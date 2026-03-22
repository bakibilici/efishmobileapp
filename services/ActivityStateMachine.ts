import { ActivityState as ClassifierState } from "./sensors/ActivityClassifier";

export enum ActivityState {
  IDLE = "IDLE",
  WALKING = "WALKING",
  CAR = "CAR",
  RUNNING = "RUNNING",
  CHARGING = "CHARGING",
  UNKNOWN = "UNKNOWN",
}

export interface FSMConfig {
  /** How long a new state must be sustained before firing a change event */
  debounceMs: number;
  /** Specialized timing for cleaning up walking noise */
  walkingToIdleDelayMs?: number;
  /** Specialized timing for stopping a vehicle record */
  carToIdleDelayMs?: number;
}

const DEFAULT_CONFIG: FSMConfig = {
  debounceMs: 5000, // 5 seconds of stability required
};

/**
 * State Machine managing high-level application activity states.
 * Interprets classification outputs, prioritizes charging status, and debounces rapid switching.
 */
export class ActivityStateMachine {
  private currentState: ActivityState = ActivityState.IDLE;
  private config: FSMConfig;

  // Debounce tracking
  private pendingState: ActivityState | null = null;
  private pendingStateStartTime: number = 0;

  // Observable listeners
  private listeners: Set<(state: ActivityState) => void> = new Set();

  constructor(config: Partial<FSMConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  public updateConfig(newConfig: Partial<FSMConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Subscribe to state changes without blocking UI
   */
  public onStateChange(listener: (state: ActivityState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener); // returns unsubscribe function
  }

  public getState(): ActivityState {
    return this.currentState;
  }

  /**
   * Transitions evaluate incoming rules and determine if a permanent state change should occur.
   * Typically called by your ActivityPipeline every X seconds.
   */
  public transition(
    classifiedActivity: ClassifierState,
    isCharging: boolean = false,
    now: number = Date.now(),
  ): void {

    // 1. Map Classifier output to Application State Map
    let targetState: ActivityState;
    if (isCharging) {
      targetState = ActivityState.CHARGING;
    } else {
      switch (classifiedActivity) {
        case "WALKING":
          targetState = ActivityState.WALKING;
          break;
        case "RUNNING":
          targetState = ActivityState.RUNNING;
          break;
        case "CAR":
          targetState = ActivityState.CAR;
          break;
        case "IDLE":
        default:
          targetState = ActivityState.IDLE;
          break;
      }
    }

    // 2. Debounce rapid switching (Hysteresis)
    if (targetState !== this.currentState) {
      if (this.pendingState !== targetState) {
        // Started observing a NEW target state
        this.pendingState = targetState;
        this.pendingStateStartTime = now;
      }

      const elapsedMs = now - this.pendingStateStartTime;

      // Calculate required debounce period based on specific transition logic
      let requiredDebounce = this.config.debounceMs;

      if (
        this.currentState === ActivityState.WALKING &&
        targetState === ActivityState.IDLE
      ) {
        requiredDebounce = this.config.walkingToIdleDelayMs ?? requiredDebounce;
      } else if (
        this.currentState === ActivityState.CAR &&
        targetState === ActivityState.IDLE
      ) {
        requiredDebounce = this.config.carToIdleDelayMs ?? requiredDebounce;
      }

      // If we've seen this target state consistently enough, commit it
      if (
        elapsedMs >= requiredDebounce ||
        (targetState === ActivityState.CHARGING) // Snap quickly if we detect a plug-in while idle
      ) {
        this.commitState(targetState);
      }
    } else {
      // Data confirms we are already in the correct state, clear pending transitions
      this.clearPendingState();
    }
  }

  private commitState(newState: ActivityState) {
    if (this.currentState !== newState) {
      this.currentState = newState;
      this.clearPendingState();

      this.listeners.forEach((listener) => {
        try {
          // Wrap in try-catch to ensure a failing UI listener doesn't crash the pipeline
          listener(newState);
        } catch (err) {
          console.error(
            "[ActivityStateMachine] Error in state change listener:",
            err,
          );
        }
      });
    }
  }

  private clearPendingState() {
    this.pendingState = null;
    this.pendingStateStartTime = 0;
  }
}
