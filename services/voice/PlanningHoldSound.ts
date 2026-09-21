import { Audio, type AVPlaybackSource } from "expo-av";
import * as Haptics from "expo-haptics";
import { applyAkbaAudioMode } from "./audioMode";
import type { HoldSoundMode } from "./planningHoldGate";

/**
 * The route-planning hold loop and its haptic ticks, driven to whatever mode
 * planningHoldGate asks for. Mode changes can come faster than the native
 * calls finish, so every change is applied in order on one queue, and a step
 * that a newer change overtook stops where it is and leaves the rest to it.
 *
 * AKBA starting to speak ("ready") silences the music at once, so not even
 * its first syllable plays over it; only the plan's end ("off") fades.
 *
 * Feedback, never a dependency: failures are logged as warnings and swallowed.
 * A step that failed is not taken as reached, so asking for the same mode
 * again tries it again.
 */

const HOLD_VOLUME = 0.52;
const FADE_IN_MS = 400;
/** Only for the plan's end; AKBA speaking cuts the music without a fade. */
const FADE_OUT_MS = 200;
const FADE_STEP_MS = 50;
const HAPTIC_INTERVAL_MS = 2600;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class PlanningHoldSound {
  private sound: Audio.Sound | null = null;
  private volume = 0;
  private playing = false;
  /** The mode asked for; null after a failed step, so the next set() runs whatever it asks. */
  private wanted: HoldSoundMode | null = "off";
  /** Bumped by every mode change; a step started under an older one gives way. */
  private epoch = 0;
  private queue: Promise<void> = Promise.resolve();
  private hapticTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly source: AVPlaybackSource) {}

  /** Resolves once the sound has reached `mode` (or a newer mode took over). */
  set(mode: HoldSoundMode): Promise<void> {
    if (mode === this.wanted) return this.queue;
    this.wanted = mode;
    this.syncHaptics();
    const epoch = ++this.epoch;
    this.queue = this.queue
      .then(() => this.converge(epoch))
      .catch((error) => {
        console.warn("[PlanningHoldSound] Hold sound step failed:", error);
        // Not reached: the next set(), even for the same mode, runs again.
        if (!this.overtaken(epoch)) {
          this.wanted = null;
          this.syncHaptics();
        }
      });
    return this.queue;
  }

  /** The ticks follow the music: only while it is audible. */
  private syncHaptics() {
    if (this.wanted === "playing") {
      if (this.hapticTimer) return;
      void Haptics.selectionAsync().catch(() => {});
      this.hapticTimer = setInterval(() => {
        void Haptics.selectionAsync().catch(() => {});
      }, HAPTIC_INTERVAL_MS);
    } else if (this.hapticTimer) {
      clearInterval(this.hapticTimer);
      this.hapticTimer = null;
    }
  }

  private overtaken(epoch: number) {
    return epoch !== this.epoch;
  }

  private async converge(epoch: number): Promise<void> {
    if (this.overtaken(epoch)) return;

    if (this.wanted === "off") {
      const sound = this.sound;
      if (!sound) return;
      // Detached before anything can fail: whatever happens below, this sound
      // is stopped and unloaded, and a plan that starts meanwhile loads its own.
      this.sound = null;
      const wasPlaying = this.playing;
      this.playing = false;
      try {
        if (wasPlaying) await this.fadeTo(sound, 0, FADE_OUT_MS, epoch);
      } finally {
        this.volume = 0;
        try {
          await sound.stopAsync();
        } finally {
          await sound.unloadAsync();
        }
      }
      return;
    }

    let sound = this.sound;
    if (!sound) {
      await applyAkbaAudioMode();
      const created = await Audio.Sound.createAsync(this.source, {
        shouldPlay: false,
        isLooping: true,
        volume: 0,
      });
      sound = created.sound;
      // Kept even if overtaken: the next step plays it or unloads it.
      this.sound = sound;
      this.volume = 0;
      this.playing = false;
      if (this.overtaken(epoch)) return;
    }

    if (this.wanted === "ready") {
      if (!this.playing) return;
      // AKBA is speaking: silent in one call, then paused, with no fade and
      // no overtaken check in between (the next fade-in starts from 0).
      await sound.setVolumeAsync(0);
      this.volume = 0;
      await sound.pauseAsync();
      this.playing = false;
      return;
    }

    if (!this.playing) {
      await sound.playAsync();
      this.playing = true;
    }
    await this.fadeTo(sound, HOLD_VOLUME, FADE_IN_MS, epoch);
  }

  /** Steps the volume from where it is now; stops early when overtaken. */
  private async fadeTo(sound: Audio.Sound, target: number, durationMs: number, epoch: number) {
    const from = this.volume;
    if (from === target) return;
    const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    for (let i = 1; i <= steps; i += 1) {
      if (this.overtaken(epoch)) return;
      const volume = from + ((target - from) * i) / steps;
      await sound.setVolumeAsync(volume);
      this.volume = volume;
      if (i < steps) await sleep(FADE_STEP_MS);
    }
  }
}
