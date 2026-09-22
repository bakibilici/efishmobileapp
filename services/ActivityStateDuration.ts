import { ActivityService } from "./ActivityService";
import type { ActivityState } from "./ActivityStateMachine";

/**
 * When the current activity state began, for the activity sheet's "Bu
 * durumda" row.
 *
 * The state machine reports changes, not start times, so the state the app
 * booted in has no beginning this observer could know. Until the first
 * change it therefore holds nothing and `heldMs` returns null, which the
 * sheet prints as "Bu oturumda değişmedi" rather than inventing a moment.
 *
 * It only listens; the detection itself (services/sensors, the state
 * machine) is untouched.
 */
class ActivityStateDurationImpl {
  private changedAt: number | null = null;
  private stateAtChange: ActivityState | null = null;
  private unsubscribe: (() => void) | null = null;

  /** Idempotent: the state machine is a singleton, so one listener is enough. */
  public start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = ActivityService.getStateMachine().onStateChange((state) => {
      this.changedAt = Date.now();
      this.stateAtChange = state;
    });
  }

  public stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.changedAt = null;
    this.stateAtChange = null;
  }

  /**
   * How long `current` has held, in ms; null when this run never saw it
   * begin (nothing has changed yet, or the state moved without this
   * observer listening).
   */
  public heldMs(current: ActivityState, now: number = Date.now()): number | null {
    if (this.changedAt == null || this.stateAtChange !== current) return null;
    return Math.max(0, now - this.changedAt);
  }
}

export const ActivityStateDuration = new ActivityStateDurationImpl();
