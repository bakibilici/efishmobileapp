import { SensorDataPayload } from './types';
import { SensorDataBuffer } from './SensorDataBuffer';

export type ActivityState = 'WALKING' | 'IDLE' | 'CAR' | 'UNKNOWN';

export interface ClassifierConfig {
  /** Minimum average steps per second to be considered WALKING */
  walkingStepFreqThreshold: number;
  /** Minimum average speed (m/s) to be considered CAR */
  carSpeedThreshold: number;
  /** Maximum motion variance to be considered IDLE */
  idleMotionVarianceThreshold: number;
}

const DEFAULT_CONFIG: ClassifierConfig = {
  walkingStepFreqThreshold: 0.5,    // at least 0.5 steps per second
  carSpeedThreshold: 4.0,           // > 14 km/h is likely a vehicle
  idleMotionVarianceThreshold: 0.1, // very low motion variance implies zero device movement
};

/**
 * PURE FUNCTION: Classifies activity based on a sliding window of sensor data.
 * Highly testable and free of side effects.
 * 
 * @param windowData The array of sensor payloads from the recent sliding window
 * @param config Threshold configuration
 * @returns The classified activity state
 */
export function classifyActivity(
  windowData: SensorDataPayload[],
  config: ClassifierConfig = DEFAULT_CONFIG
): ActivityState {
  if (!windowData || windowData.length === 0) {
    return 'UNKNOWN';
  }

  let totalSteps = 0;
  let totalSpeed = 0;
  let totalMotionVariance = 0;

  for (const point of windowData) {
    totalSteps += point.steps;
    totalSpeed += point.speed;
    totalMotionVariance += point.motionVariance;
  }

  const count = windowData.length;
  // Calculate true time span instead of assuming exact window size to be robust against missing samples
  const timeSpanMs = windowData[count - 1].timestamp - windowData[0].timestamp;
  // If timeSpan is 0 (only one data point), default to 1 second to avoid division by zero
  const timeSpanSeconds = timeSpanMs > 0 ? timeSpanMs / 1000 : 1; 

  const stepFrequency = totalSteps / timeSpanSeconds;
  const avgSpeed = totalSpeed / count;
  const avgMotionVariance = totalMotionVariance / count;

  // RULE 1: CAR
  // If moving relatively fast, it supersedes other low-level movements like step noise while on a bus
  if (avgSpeed > config.carSpeedThreshold) {
    return 'CAR';
  }

  // RULE 2: WALKING
  // Sufficient step frequency
  if (stepFrequency >= config.walkingStepFreqThreshold) {
    return 'WALKING';
  }

  // RULE 3: IDLE
  // Low speed, no steps, and low physical device variance (device is stable)
  if (avgSpeed < 0.5 && stepFrequency === 0 && avgMotionVariance < config.idleMotionVarianceThreshold) {
    return 'IDLE';
  }

  // If we have noisy data that doesn't cleanly fit (e.g., in a shaking train with no GPS speed)
  return 'UNKNOWN';
}

/**
 * SCHEDULER: Connects the ActivityClassifier to a SensorDataBuffer
 * Runs periodically on an interval, keeping classification logic off the main UI rendering flow.
 */
export class ActivityClassifierScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private buffer: SensorDataBuffer,
    private onActivityDetected: (activity: ActivityState) => void,
    private checkWindowSeconds: number = 5,
    private config?: ClassifierConfig
  ) {}

  public start(): void {
    if (this.intervalId) return;

    // Run classification every X seconds
    this.intervalId = setInterval(() => {
      this.processWindow();
    }, this.checkWindowSeconds * 1000);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Extracted for testability and clarity.
   * Pulls data, runs classification, and fires the callback.
   */
  private processWindow(): void {
    // 1. Pull the last X seconds of data
    const windowData = this.buffer.getLast(this.checkWindowSeconds);
    
    // 2. Pass to pure function
    const activity = classifyActivity(windowData, this.config);
    
    // 3. Dispatch result
    this.onActivityDetected(activity);
  }
}
