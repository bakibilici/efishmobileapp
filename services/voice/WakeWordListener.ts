import { Platform } from "react-native";
import type {
  ExpoSpeechRecognitionErrorCode,
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";
import { matchesWakeWord } from "./wakeWordMatcher";

/**
 * On-device "AKBA" wake word, listened for only while the voice session is
 * passive. Privacy rule: no audio leaves the phone before the wake word.
 * That holds because recognition is started with requiresOnDeviceRecognition
 * and, through patches/expo-speech-recognition+3.1.3.patch, iOS now fails
 * instead of silently falling back to Apple's servers; on Android only API 33+
 * is used, where the library creates the on-device recognizer.
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

export const WAKE_WORD_LOCALE = "tr-TR";

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

function buildStartOptions(speech: SpeechRecognitionPackage): ExpoSpeechRecognitionOptions {
  return {
    lang: WAKE_WORD_LOCALE,
    continuous: true,
    interimResults: true,
    maxAlternatives: 3,
    requiresOnDeviceRecognition: true,
    addsPunctuation: false,
    contextualStrings: ["AKBA", "Akba"],
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
  private consecutiveHardErrors = 0;
  private consecutiveQuickEnds = 0;
  private matching = false;
  private warnedReasons = new Set<string>();

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

    const blocker = await this.checkReadiness();
    if (generation !== this.generation || !this.wanted) return;
    if (blocker) {
      this.giveUp(blocker);
      return;
    }
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

  /** Returns why the wake word cannot run here, or null when it can. Never prompts. */
  private async checkReadiness(): Promise<string | null> {
    const speech = loadSpeechModule();
    if (!speech) return "speech module not in this build";

    if (Platform.OS === "android") {
      // Below API 33 the library's "on-device" flag is only a preference and
      // the recognizer may stream to a server.
      if (typeof Platform.Version !== "number" || Platform.Version < 33) {
        return "Android 13 or newer is needed for on-device recognition";
      }
    } else if (Platform.OS !== "ios") {
      return "unsupported platform";
    }

    try {
      const mic = await withTimeout(speech.getMicrophonePermissionsAsync(), CHECK_TIMEOUT_MS);
      if (!mic.granted) return "microphone permission not granted";
      const recognizer = await withTimeout(
        speech.getSpeechRecognizerPermissionsAsync(),
        CHECK_TIMEOUT_MS,
      );
      if (!recognizer.granted) return "speech recognition permission not granted";

      if (Platform.OS === "ios") {
        // Patched to accept a locale; without it both checks used the phone's
        // default language, not Turkish.
        if (!speech.isRecognitionAvailable(WAKE_WORD_LOCALE)) {
          return "speech recognizer unavailable for tr-TR";
        }
        if (!speech.supportsOnDeviceRecognition(WAKE_WORD_LOCALE)) {
          return "on-device recognition unsupported for tr-TR";
        }
      } else {
        if (!speech.supportsOnDeviceRecognition()) {
          return "on-device recognition unsupported";
        }
        const { installedLocales } = await withTimeout(
          speech.getSupportedLocales({}),
          CHECK_TIMEOUT_MS,
        );
        const hasTurkish = installedLocales.some((locale) =>
          locale.toLowerCase().replace("_", "-").startsWith("tr"),
        );
        if (!hasTurkish) return "tr-TR on-device model not installed";
      }
    } catch (error) {
      this.warnOnce("Readiness check failed", error);
      return "readiness check failed";
    }
    return null;
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
    const speech = pkg.ExpoSpeechRecognitionModule;
    this.ensureSubscribed(speech);
    this.lastError = null;
    this.runStartedAt = Date.now();
    this.runHeardSomething = false;
    this.stopping = false;
    this.nativeActive = true;
    try {
      speech.start(buildStartOptions(pkg));
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
      this.warnOnce(`Recognizer error ${event.error}`, event.message);
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
