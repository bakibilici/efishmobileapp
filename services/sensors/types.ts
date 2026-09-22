/**
 * The speed of a sample the platform could not measure. iOS reports
 * CLLocation.speed as -1 whenever Core Location has no estimate — on a coarse
 * fix, indoors, or before the first GPS fix — and expo-location passes that
 * straight through. It has to stay distinguishable from a measured 0: a screen
 * prints "0 km/sa" for the second and nothing at all for the first.
 */
export const UNKNOWN_SPEED = -1;

export interface SensorDataPayload {
  /** Timestamp in ms since epoch when data was aggregated */
  timestamp: number;
  /** Number of steps taken since the last emitted payload, at a pace a body can hold */
  steps: number;
  /**
   * Steps that arrived in this payload but were not taken during it: the lump
   * CMPedometer hands over when the app comes back from a locked screen. They
   * count towards the day's total and nothing else — reading them as cadence
   * would turn a walk into a sprint for a window.
   */
  backlogSteps?: number;
  /** Current speed in m/s, or UNKNOWN_SPEED (-1) when the platform has none */
  speed: number;
  /** Motion variance calculated from accelerometer data (useful for differentiating car vs still context) */
  motionVariance: number;
}

export interface SensorProviderConfig {
  /** Rate at which the unified stream emits data (in milliseconds) */
  samplingRateMs: number;
  /** Whether to enable background location tracking (requires permissions) */
  enableBackgroundLocation: boolean;
}

export interface ISensorDataProvider {
  /** Initializes sensors and starts the polling loop */
  start(config?: Partial<SensorProviderConfig>): Promise<void>;
  
  /** Stops all sensors and the polling loop */
  stop(): void;

  /**
   * Subscribes to the unified sensor data stream.
   * @param callback Function called every `samplingRateMs` with unified data.
   * @returns An unsubscribe function.
   */
  subscribe(callback: (data: SensorDataPayload) => void): () => void;
}
