import { getLocales } from "expo-localization";
import { Platform } from "react-native";
import type {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import {
  describeUnusableLocales,
  isLocaleRefusal,
  matchInstalledLocale,
  wakeWordLocaleCandidates,
} from "./wakeWordLocales";
import { matchesWakeWord } from "./wakeWordMatcher";

/**
 * On-device "AKBA" wake word, listened for only while the voice session is
 * passive. Privacy rule: no audio leaves the phone before the wake word.
 * That holds because recognition is started with requiresOnDeviceRecognition
 * and, through patches/expo-speech-recognition+3.1.3.patch, iOS now fails
 * instead of silently falling back to Apple's servers; on Android only API 33+
 * is used, where the library creates the on-device recognizer.
 *
 * The language is the first of tr-TR, the phone's own Turkish and English
 * tags and en-US that has an on-device recognizer here (see wakeWordLocales),
 * so a phone set to English wakes on "AKBA" too. A locale the recognizer
 * refuses on its first run (see isLocaleRefusal) is ruled out until the next
 * arm, and the next one is tried.
 *
 * This module never asks for a permission itself (see
 * requestWakeWordPermissionIfNeverAsked, which the voice session calls).
 * useDrivingAgent decides when to arm and disarm; this class only listens,
 * restarts and reports.
 */

type SpeechRecognitionPackage = typeof import("expo-speech-recognition");
type SpeechModule = SpeechRecognitionPackage["ExpoSpeechRecognitionModule"];

export type WakeWordStatus = {
  /** The recognizer is running (or about to restart after a normal end). */
  armed: boolean;
  /** Why it is not armed, when that is not simply "nobody asked it to be". */
  reason: string | null;
};

type Readiness = { ok: true; locale: string } | { ok: false; reason: string };

/** Normal end (the recognizer ran a while, or heard something) → quick restart. */
const RESTART_AFTER_END_MS = 300;
/**
 * A run that ended this fast with nothing heard is not restarted at full
 * speed: repeated quick ends back off from the base, doubling up to the cap.
 * Silence is normal in a car, so these never make the listener give up.
 */
const QUICK_RUN_MS = 3000;
const QUICK_END_BACKOFF_BASE_MS = 1500;
const QUICK_END_BACKOFF_CAP_MS = 10000;
/** Hard errors back off from here, doubling up to the cap, and give up after the limit. */
const HARD_ERROR_BACKOFF_BASE_MS = 1000;
const HARD_ERROR_BACKOFF_CAP_MS = 30000;
const MAX_CONSECUTIVE_HARD_ERRORS = 5;
/** Any run this long (or one that heard something) clears both streaks. */
const HEALTHY_RUN_MS = 10000;
/** How long disarm waits for the recognizer's "end" before carrying on. */
const STOP_TIMEOUT_MS = 1500;
const CHECK_TIMEOUT_MS = 3000;

/** Retrying cannot fix these: give up until the next arm. */
const FATAL_ERRORS = new Set<ExpoSpeechRecognitionErrorCode>([
  "not-allowed",
  "language-not-supported",
  "service-not-allowed",
  "bad-grammar",
]);
/** Silence and our own aborts are part of normal listening. */
const SOFT_ERRORS = new Set<ExpoSpeechRecognitionErrorCode>([
  "no-speech",
  "speech-timeout",
  "aborted",
]);

let cachedPackage: SpeechRecognitionPackage | null | undefined;

/**
 * Loaded lazily: the package calls requireNativeModule at import time, and a
 * dev client built before it was added must keep working without it.
 */
function loadSpeechPackage(): SpeechRecognitionPackage | null {
  if (cachedPackage !== undefined) return cachedPackage;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy on purpose, see above
    const pkg = require("expo-speech-recognition") as SpeechRecognitionPackage;
    cachedPackage = pkg.ExpoSpeechRecognitionModule ? pkg : null;
  } catch {
    cachedPackage = null;
  }
  return cachedPackage;
}

function loadSpeechModule(): SpeechModule | null {
  return loadSpeechPackage()?.ExpoSpeechRecognitionModule ?? null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** The phone's preferred languages, most preferred first; empty if unreadable. */
function preferredLocaleTags(): string[] {
  try {
    return getLocales().map((locale) => locale.languageTag);
  } catch {
    return [];
  }
}

function buildStartOptions(
  speech: SpeechRecognitionPackage,
  lang: string,
): ExpoSpeechRecognitionOptions {
  return {
    lang,
    continuous: true,
    interimResults: true,
    maxAlternatives: 3,
    requiresOnDeviceRecognition: true,
    addsPunctuation: false,
    // Also what makes an English or Turkish recognizer write the name as "Electrip" or "AKBA".
    contextualStrings: ["Electrip", "electrip", "Elektrip", "elektrip", "AKBA", "Akba", "akba"],
    // Passive listening must not look like a call to the car. videoChat and
    // voiceChat (like allowBluetooth) open the hands-free profile, which
    // switches a Bluetooth car kit into call mode and cuts its music; the
    // default mode with A2DP keeps the car's audio as it is and listens on
    // the phone's own microphone. The live session sets its own mode.
    iosCategory: {
      category: speech.AVAudioSessionCategory.playAndRecord,
      categoryOptions: [
        speech.AVAudioSessionCategoryOptions.defaultToSpeaker,
        speech.AVAudioSessionCategoryOptions.allowBluetoothA2DP,
        speech.AVAudioSessionCategoryOptions.mixWithOthers,
      ],
      mode: speech.AVAudioSessionMode.default,
    },
  };
}

class WakeWordListenerImpl {
  private status: WakeWordStatus = { armed: false, reason: null };
  private statusListeners = new Set<(status: WakeWordStatus) => void>();
  /** Bumped by every arm/disarm; async work from an older generation bails out. */
  private generation = 0;
  private wanted = false;
  private onWake: (() => void) | null = null;
  private subscribed = false;
  /** start() was called and its "end" has not arrived yet. */
  private nativeActive = false;
  /** We asked the recognizer to stop; its "end" must not trigger a restart. */
  private stopping = false;
  private endWaiters: (() => void)[] = [];
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private lastError: ExpoSpeechRecognitionErrorCode | null = null;
  private runStartedAt = 0;
  private runHeardSomething = false;
  /** The recognizer sent a result event this run, even an empty one: it is working. */
  private runHadResult = false;
  /** Runs started in the current locale; 1 while its first one is going. */
  private runsInLocale = 0;
  private consecutiveHardErrors = 0;
  private consecutiveQuickEnds = 0;
  private matching = false;
  private warnedReasons = new Set<string>();
  /** The language the recognizer runs in, picked afresh at every arm. */
  private locale: string | null = null;
  /**
   * Locales the recognizer refused since the last arm (see isLocaleRefusal).
   * Cleared at every arm, so one whose model has finished downloading since
   * is tried again.
   */
  private refusedLocales = new Set<string>();

  getStatus(): WakeWordStatus {
    return this.status;
  }

  subscribe(listener: (status: WakeWordStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  /**
   * Starts listening if the device can do it privately. Idempotent while
   * armed. After a give-up, calling arm again is "the next arm" and retries.
   */
  async arm(onWake: () => void): Promise<void> {
    this.onWake = onWake;
    if (this.wanted) return;
    this.wanted = true;
    const generation = ++this.generation;
    this.consecutiveHardErrors = 0;
    this.consecutiveQuickEnds = 0;
    this.refusedLocales.clear();
    await this.prepareAndStart(generation);
  }

  /** Picks a locale (again, after one was refused) and starts listening in it. */
  private async prepareAndStart(generation: number): Promise<void> {
    const readiness = await this.checkReadiness();
    if (generation !== this.generation || !this.wanted) return;
    if (!readiness.ok) {
      this.giveUp(readiness.reason);
      return;
    }
    this.locale = readiness.locale;
    this.runsInLocale = 0;
    // A stop from an earlier generation may still be settling.
    await this.stopNative();
    if (generation !== this.generation || !this.wanted) return;

    this.setStatus({ armed: true, reason: null });
    this.startNative(generation);
  }

  /** Resolves once the recognizer has fully stopped (or the stop timed out). */
  async disarm(): Promise<void> {
    this.generation += 1;
    this.wanted = false;
    this.clearRestartTimer();
    if (this.status.armed) this.setStatus({ armed: false, reason: null });
    await this.stopNative();
  }

  private setStatus(next: WakeWordStatus) {
    if (next.armed === this.status.armed && next.reason === this.status.reason) return;
    this.status = next;
    this.statusListeners.forEach((listener) => listener(next));
  }

  /** One console.warn per distinct message for the life of the app. */
  private warnOnce(message: string, detail?: unknown) {
    if (this.warnedReasons.has(message)) return;
    this.warnedReasons.add(message);
    if (detail === undefined) {
      console.warn(`[WakeWord] ${message}`);
    } else {
      console.warn(`[WakeWord] ${message}`, detail);
    }
  }

  private giveUp(reason: string, detail?: unknown) {
    this.generation += 1;
    this.wanted = false;
    this.clearRestartTimer();
    this.setStatus({ armed: false, reason });
    this.warnOnce(`Not listening for "AKBA": ${reason}`, detail);
    void this.stopNative();
  }

  private clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  /**
   * The locale to listen in, or why the wake word cannot run here. Never
   * prompts. The first candidate with an on-device recognizer that has not
   * been refused since the last arm wins; the rest are not checked.
   */
  private async checkReadiness(): Promise<Readiness> {
    const fail = (reason: string): Readiness => ({ ok: false, reason });
    const speech = loadSpeechModule();
    if (!speech) return fail("speech module not in this build");

    if (Platform.OS === "android") {
      // Below API 33 the library's "on-device" flag is only a preference and
      // the recognizer may stream to a server.
      if (typeof Platform.Version !== "number" || Platform.Version < 33) {
        return fail("Android 13 or newer is needed for on-device recognition");
      }
    } else if (Platform.OS !== "ios") {
      return fail("unsupported platform");
    }

    try {
      const mic = await withTimeout(speech.getMicrophonePermissionsAsync(), CHECK_TIMEOUT_MS);
      if (!mic.granted) return fail("microphone permission not granted");
      const recognizer = await withTimeout(
        speech.getSpeechRecognizerPermissionsAsync(),
        CHECK_TIMEOUT_MS,
      );
      if (!recognizer.granted) return fail("speech recognition permission not granted");

      let installedLocales: string[] = [];
      if (Platform.OS === "android") {
        if (!speech.supportsOnDeviceRecognition()) {
          return fail("on-device recognition unsupported");
        }
        ({ installedLocales } = await withTimeout(
          speech.getSupportedLocales({}),
          CHECK_TIMEOUT_MS,
        ));
      }

      const noOnDevice: string[] = [];
      const unavailable: string[] = [];
      for (const candidate of wakeWordLocaleCandidates(preferredLocaleTags())) {
        // iOS: patched to take a locale; without one both checks used the
        // phone's default language. Android: the models installed for
        // offline use are the ones its on-device recognizer can run.
        const locale =
          Platform.OS === "ios" ? candidate : matchInstalledLocale(candidate, installedLocales);
        if (!locale || this.refusedLocales.has(locale)) {
          noOnDevice.push(candidate);
        } else if (Platform.OS === "ios" && !speech.supportsOnDeviceRecognition(locale)) {
          noOnDevice.push(candidate);
        } else if (Platform.OS === "ios" && !speech.isRecognitionAvailable(locale)) {
          unavailable.push(candidate);
        } else {
          return { ok: true, locale };
        }
      }
      return fail(describeUnusableLocales(noOnDevice, unavailable));
    } catch (error) {
      this.warnOnce("Readiness check failed", error);
      return fail("readiness check failed");
    }
  }

  private ensureSubscribed(speech: SpeechModule) {
    if (this.subscribed) return;
    this.subscribed = true;
    speech.addListener("start", this.handleStart);
    speech.addListener("result", this.handleResult);
    speech.addListener("error", this.handleError);
    speech.addListener("end", this.handleEnd);
  }

  /** Best effort: asks the recognizer to stop, without waiting for it. */
  private abortNative() {
    try {
      loadSpeechModule()?.abort();
    } catch {
      // Nothing to stop.
    }
  }

  private startNative(generation: number) {
    if (generation !== this.generation || !this.wanted) return;
    const pkg = loadSpeechPackage();
    if (!pkg) {
      this.giveUp("speech module not in this build");
      return;
    }
    const lang = this.locale;
    if (!lang) {
      this.giveUp("no wake-word locale chosen");
      return;
    }
    const speech = pkg.ExpoSpeechRecognitionModule;
    this.ensureSubscribed(speech);
    this.lastError = null;
    this.runStartedAt = Date.now();
    this.runHeardSomething = false;
    this.runHadResult = false;
    this.runsInLocale += 1;
    this.stopping = false;
    this.nativeActive = true;
    try {
      speech.start(buildStartOptions(pkg, lang));
    } catch (error) {
      this.nativeActive = false;
      this.giveUp("recognizer failed to start", error);
    }
  }

  private stopNative(): Promise<void> {
    if (!this.nativeActive) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        // The late "end", if it ever comes, is still swallowed by `stopping`.
        this.nativeActive = false;
        this.warnOnce("The recognizer did not confirm the stop in time");
        // An abort that reached the native side before its start had
        // finished can be lost; ask once more. A recognizer that only comes
        // up after this reports "start", and handleStart closes it again.
        this.abortNative();
        finish();
      }, STOP_TIMEOUT_MS);
      this.endWaiters.push(finish);
      if (!this.stopping) {
        this.stopping = true;
        this.abortNative();
      }
    });
  }

  /**
   * The recognizer is up. Normally that is the run just started; if JS has
   * already stopped wanting it (a disarm or a match raced the native start,
   * or a stop timed out), it is closed again right away, so the microphone
   * can never stay open behind a listener that reports itself off.
   */
  private handleStart = () => {
    if (this.wanted && !this.stopping) return;
    this.nativeActive = true;
    this.stopping = true;
    this.abortNative();
  };

  private handleResult = (event: ExpoSpeechRecognitionResultEvent) => {
    this.runHadResult = true;
    if (!this.wanted || this.stopping || this.matching) return;
    const transcripts = (event.results ?? []).map((result) => result.transcript);
    if (transcripts.some((text) => text.trim().length > 0)) {
      this.runHeardSomething = true;
    }
    if (transcripts.some(matchesWakeWord)) {
      void this.handleMatch();
    }
  };

  private async handleMatch() {
    this.matching = true;
    const onWake = this.onWake;
    const generation = ++this.generation;
    this.wanted = false;
    this.clearRestartTimer();
    this.setStatus({ armed: false, reason: null });
    try {
      await this.stopNative();
    } finally {
      this.matching = false;
    }
    // A disarm while the recognizer was stopping (screen locked, drive
    // ended) takes the wake back: it must not start a session.
    if (generation !== this.generation) return;
    onWake?.();
  }

  private handleError = (event: ExpoSpeechRecognitionErrorEvent) => {
    this.lastError = event.error;
    if (!this.stopping && this.wanted && FATAL_ERRORS.has(event.error)) {
      // Keep the message: "language-not-supported" is also how the patched
      // library refuses to fall back to server recognition.
      this.warnOnce(`Recognizer error ${event.error} (${this.locale})`, event.message);
    }
  };

  private handleEnd = () => {
    this.nativeActive = false;
    const waiters = this.endWaiters;
    this.endWaiters = [];
    waiters.forEach((resolve) => resolve());

    if (this.stopping) {
      this.stopping = false;
      return;
    }
    if (!this.wanted) return;

    const error = this.lastError;
    this.lastError = null;
    const ranMs = Date.now() - this.runStartedAt;
    if (this.runHeardSomething || ranMs >= HEALTHY_RUN_MS) {
      this.consecutiveHardErrors = 0;
      this.consecutiveQuickEnds = 0;
    }

    const run = {
      first: this.runsInLocale === 1,
      quick: ranMs < QUICK_RUN_MS,
      hadResult: this.runHadResult,
    };
    if (error && isLocaleRefusal(error, run)) {
      // This locale cannot run on the device after all: rule it out and try
      // the next one. Each pass rules one out, so this ends within the
      // candidate list, in a locale that works or in a give-up.
      if (this.locale) this.refusedLocales.add(this.locale);
      this.consecutiveHardErrors = 0;
      this.consecutiveQuickEnds = 0;
      void this.prepareAndStart(this.generation);
      return;
    }
    if (error && FATAL_ERRORS.has(error)) {
      this.giveUp(`recognizer error ${error}`);
      return;
    }

    let delay: number;
    if (error && !SOFT_ERRORS.has(error)) {
      this.consecutiveHardErrors += 1;
      if (this.consecutiveHardErrors >= MAX_CONSECUTIVE_HARD_ERRORS) {
        this.giveUp(`repeated recognizer error ${error}`);
        return;
      }
      delay = Math.min(
        HARD_ERROR_BACKOFF_BASE_MS * 2 ** (this.consecutiveHardErrors - 1),
        HARD_ERROR_BACKOFF_CAP_MS,
      );
    } else if (ranMs < QUICK_RUN_MS && !this.runHeardSomething) {
      this.consecutiveQuickEnds += 1;
      delay = Math.min(
        QUICK_END_BACKOFF_BASE_MS * 2 ** (this.consecutiveQuickEnds - 1),
        QUICK_END_BACKOFF_CAP_MS,
      );
    } else {
      delay = RESTART_AFTER_END_MS;
    }

    const generation = this.generation;
    this.clearRestartTimer();
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startNative(generation);
    }, delay);
  };
}

export const WakeWordListener = new WakeWordListenerImpl();

/**
 * The voice session calls this once it is live in car mode — the moment the
 * app already asks for location and the microphone. Only an iOS permission
 * that was never asked is requested; a refusal is respected and the wake word
 * simply stays off. Android's recognizer only needs RECORD_AUDIO, which the
 * voice session requests itself.
 */
export async function requestWakeWordPermissionIfNeverAsked(): Promise<void> {
  if (Platform.OS !== "ios") return;
  const speech = loadSpeechModule();
  if (!speech) return;
  try {
    const current = await speech.getSpeechRecognizerPermissionsAsync();
    if (current.status === "undetermined" && current.canAskAgain) {
      await speech.requestSpeechRecognizerPermissionsAsync();
    }
  } catch {
    // The wake word stays off; the voice session is unaffected.
  }
}
