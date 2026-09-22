import { ActivityStateMachine } from "../ActivityStateMachine";
import { ActivityState as ClassifierState, classifyActivity } from "./ActivityClassifier";
import { ActivityRecorder } from "./ActivityRecorder";
import { SensorDataBuffer } from "./SensorDataBuffer";
import { SpeedStore } from "./SpeedStore";
import { StepStore } from "./StepStore";
import { ISensorDataProvider, SensorDataPayload, UNKNOWN_SPEED } from "./types";
import { ChargingSessionStore } from "../ChargingSessionStore";

/**
 * Orchestrates the data flow from hardware sensors -> memory buffer -> classifier -> state machine.
 * This class isolates the "when and how" data moves between our decoupled architectural layers.
 */
export class ActivityPipeline {
  private buffer: SensorDataBuffer;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private unsubscribeProvider: (() => void) | null = null;

  constructor(
    private provider: ISensorDataProvider,
    private stateMachine: ActivityStateMachine,
    private checkWindowSeconds: number = 5,
  ) {
    // Keep exactly 15s of history to serve sliding windows safely without Memory constraints
    this.buffer = new SensorDataBuffer(15, 20);
  }

  /**
   * Starts the pipeline: binds sensors, begins buffering, and fires up the scheduled classifier.
   */
  public async start(): Promise<void> {
    // 1. Boot up hardware layer
    await this.provider.start();

    // 2. Stream data points into our circular memory buffer
    this.unsubscribeProvider = this.provider.subscribe(
      (data: SensorDataPayload) => {
        this.buffer.add(data);

        // Push step data to the centralized store for UI consumption.
        // The counter gets the backlog too — those steps were walked, they just
        // were not walked in this window, so only the buffer above ignores them.
        const isCharging = ChargingSessionStore.isCharging;
        const currentState = this.stateMachine.getState();
        const countedSteps = data.steps + (data.backlogSteps ?? 0);
        if (countedSteps > 0) {
          StepStore.addSteps(countedSteps, isCharging, currentState);
        } else {
          StepStore.setChargingState(isCharging);
        }
      },
    );

    // 3. Start background classification loop (non-blocking)
    if (!this.intervalId) {
      this.intervalId = setInterval(() => {
        this.processWindow();
      }, this.checkWindowSeconds * 1000);
    }
  }

  /**
   * Gracefully shuts down sensors and stops background loops to prevent memory leaks.
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.unsubscribeProvider) {
      this.unsubscribeProvider();
      this.unsubscribeProvider = null;
    }

    this.provider.stop();
  }

  /**
   * Hot-swaps the active sensor provider at runtime.
   * Useful for switching between physical sensors and CLI mock data.
   */
  public async setProvider(newProvider: ISensorDataProvider): Promise<void> {
    const wasRunning = this.unsubscribeProvider !== null;
    
    // Stop listening to old provider
    if (this.unsubscribeProvider) {
      this.unsubscribeProvider();
      this.unsubscribeProvider = null;
    }
    this.provider.stop();

    // Swap
    this.provider = newProvider;

    // Restart with new provider if pipeline was active
    if (wasRunning) {
      await this.provider.start();
      
      this.unsubscribeProvider = this.provider.subscribe(
        (data: SensorDataPayload) => {
          this.buffer.add(data);
          const isCharging = ChargingSessionStore.isCharging;
          const countedSteps = data.steps + (data.backlogSteps ?? 0);
          if (countedSteps > 0) {
            StepStore.addSteps(countedSteps, isCharging);
          } else {
            StepStore.setChargingState(isCharging);
          }
        },
      );
    }
  }

  /**
   * The core pipeline executor: pulls data, runs logic, formats it, and dispatches to reducers.
   */
  public processWindow(): void {
    // A. Read the latest sliding window from our robust circular buffer
    const windowData = this.buffer.getLast(this.checkWindowSeconds);

    if (windowData.length === 0) {
      return;
    }

    // B. Run Pure Classification Logic
    // Getting an instantaneous judgment from our math-based rules engine
    const classifiedState: ClassifierState = classifyActivity(windowData);

    // Optional: Log the instantaneous "raw" classification state for debugging
    // console.debug(
    //   `[ActivityPipeline] Instantaneous Window Classification: ${classifiedState}`,
    // );

    // C. Calculate average speed over the window and update store.
    // Only the samples the platform actually measured count: averaging an
    // UNKNOWN_SPEED in would drag a real speed down, and a window of nothing
    // but unknowns would print a negative one. Such a window stays unknown,
    // which every screen shows as no speed rather than as a confident "0".
    let totalSpeed = 0;
    let measuredCount = 0;
    for (const d of windowData) {
      if (d.speed >= 0) {
        totalSpeed += d.speed;
        measuredCount += 1;
      }
    }
    const avgSpeed = measuredCount > 0 ? totalSpeed / measuredCount : UNKNOWN_SPEED;
    // Assuming sensor input is m/s, converting to km/h for UI display
    const avgSpeedKmh = measuredCount > 0 ? avgSpeed * 3.6 : UNKNOWN_SPEED;
    SpeedStore.setSpeed(avgSpeedKmh);

    // D. Send instantaneous classification to State Machine for debounce/hysteresis checks
    // The FSM now receives the actual 'WALKING' | 'CAR' | 'IDLE' output and tracks sustained transitions internally.
    const latestCharging = ChargingSessionStore.isCharging;

    this.stateMachine.transition(classifiedState, latestCharging);

    // E. Field-test evidence: one feature row per window (no-op unless recording).
    // avgSpeed above is the mean of what was measured, which is what the screen
    // should print. The recorded feature has to be the other thing: exactly what
    // classifyActivity feeds the learned model, unknowns counted as 0 over every
    // sample. Recording the displayed number instead would train the model on a
    // value it never sees at serve time, on precisely the unmeasured windows
    // this work is about. `speedKnown` keeps the distinction without moving the
    // number.
    const steps = windowData.reduce((sum, d) => sum + d.steps, 0);
    const variance = windowData.reduce((sum, d) => sum + d.motionVariance, 0) / windowData.length;
    ActivityRecorder.onWindow({
      t: Date.now(),
      windowSec: this.checkWindowSeconds,
      steps,
      stepFreq: steps / this.checkWindowSeconds,
      avgSpeed: totalSpeed / windowData.length,
      speedKnown: measuredCount > 0,
      variance,
      charging: latestCharging,
      classified: classifiedState,
      fsm: this.stateMachine.getState(),
    });
  }
}
