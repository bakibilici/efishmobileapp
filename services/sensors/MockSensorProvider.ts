import { ISensorDataProvider, SensorProviderConfig, SensorDataPayload } from './types';

export class MockSensorProvider implements ISensorDataProvider {
  private config: SensorProviderConfig = { samplingRateMs: 1000, enableBackgroundLocation: false };
  private listeners: Set<(data: SensorDataPayload) => void> = new Set();
  private intervalId: ReturnType<typeof setInterval> | null = null;

  // Mutable state representing external world "sensors"
  public currentStepsAccumulator = 0;
  public currentSpeed = 0;
  public motionVariance = 0;

  public async start(config?: Partial<SensorProviderConfig>): Promise<void> {
    this.config = { ...this.config, ...config };
    
    this.stop();

    this.intervalId = setInterval(() => {
      this.emitPayload();
    }, this.config.samplingRateMs);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public subscribe(callback: (data: SensorDataPayload) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private emitPayload() {
    const payload: SensorDataPayload = {
      timestamp: Date.now(),
      steps: this.currentStepsAccumulator,
      speed: this.currentSpeed,
      motionVariance: this.motionVariance,
    };

    // Reset step delta for the next interval
    this.currentStepsAccumulator = 0;

    this.listeners.forEach(l => l(payload));
  }

  /**
   * Utility for testing: immediately triggers an emit, optionally overriding payload.
   * Helps test subscribers without waiting for the next setInterval tick.
   */
  public simulateTickNow(payloadOverride?: Partial<SensorDataPayload>) {
    const payload: SensorDataPayload = {
      timestamp: Date.now(),
      steps: payloadOverride?.steps ?? this.currentStepsAccumulator,
      speed: payloadOverride?.speed ?? this.currentSpeed,
      motionVariance: payloadOverride?.motionVariance ?? this.motionVariance,
    };
    this.currentStepsAccumulator = 0;
    this.listeners.forEach(l => l(payload));
  }
}
