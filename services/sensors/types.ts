export interface SensorDataPayload {
  /** Timestamp in ms since epoch when data was aggregated */
  timestamp: number;
  /** Number of steps taken since the last emitted payload */
  steps: number;
  /** Current speed in m/s */
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
