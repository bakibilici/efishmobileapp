import { Pedometer, Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { ISensorDataProvider, SensorProviderConfig, SensorDataPayload } from './types';

const DEFAULT_CONFIG: SensorProviderConfig = {
  samplingRateMs: 2000,
  enableBackgroundLocation: true,
};

export class ExpoSensorProvider implements ISensorDataProvider {
  private config: SensorProviderConfig = DEFAULT_CONFIG;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(data: SensorDataPayload) => void> = new Set();
  
  // Accumulators and local state
  private stepsAccumulated = 0;
  private currentSpeed = 0;
  private motionVariance = 0;

  // Native subscriptions
  private stepSub: Pedometer.Subscription | null = null;
  private accelSub: ReturnType<typeof Accelerometer.addListener> | null = null;
  private locationSub: Location.LocationSubscription | null = null;

  // Accelerometer buffer for variance calculation
  private accelBuffer: number[] = [];

  public subscribe(callback: (data: SensorDataPayload) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public async start(config?: Partial<SensorProviderConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.stop(); // Clear any existing

    try {
      await Promise.all([
        this.initPedometer(),
        this.initLocation()
      ]);
      this.initAccelerometer();
    } catch (e) {
      console.warn('[ExpoSensorProvider] Some sensors failed to initialize:', e);
    }

    // Start Unified Polling Loop off the UI thread
    this.intervalId = setInterval(() => {
      this.emitPayload();
    }, this.config.samplingRateMs);
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.stepSub?.remove();
    this.accelSub?.remove();
    this.locationSub?.remove();

    this.stepSub = null;
    this.accelSub = null;
    this.locationSub = null;
    
    this.accelBuffer = [];
  }

  private emitPayload(): void {
    const payload: SensorDataPayload = {
      timestamp: Date.now(),
      steps: this.stepsAccumulated,
      speed: this.currentSpeed,
      motionVariance: this.motionVariance,
    };

    // Reset steps delta accumulator for the next interval
    this.stepsAccumulated = 0; 
    
    // Notify listeners
    this.listeners.forEach(l => l(payload));
  }

  // --- Sub-Initializers ---

  private lastEmittedPedometerTotal = 0;

  private async initPedometer() {
    const isAvailable = await Pedometer.isAvailableAsync();
    if (isAvailable) {
      this.lastEmittedPedometerTotal = 0;
      this.stepSub = Pedometer.watchStepCount(result => {
        // Pedometer natively returns cumulative steps since watch start.
        // We calculate the delta since the last event and add it to our accumulator
        // which gets reset to 0 every interval emission.
        const delta = result.steps - this.lastEmittedPedometerTotal;
        this.stepsAccumulated += delta;
        this.lastEmittedPedometerTotal = result.steps;
      });
    }
  }

  private async initLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    if (this.config.enableBackgroundLocation) {
      const bgStatus = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus.status !== 'granted') return; // We fallback to foreground location if background is denied
    }

    this.locationSub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 1, 
        timeInterval: 2000, 
      },
      (location) => {
        // speed comes in m/s natively
        this.currentSpeed = location.coords.speed || 0;
      }
    );
  }

  private initAccelerometer() {
    // Keep it relatively low frequency to save battery
    Accelerometer.setUpdateInterval(500);
    this.accelSub = Accelerometer.addListener(({ x, y, z }) => {
      const magnitude = Math.sqrt(x * x + y * y + z * z);
      this.accelBuffer.push(magnitude);
      if (this.accelBuffer.length > 10) {
        this.accelBuffer.shift();
      }
      this.motionVariance = this.calculateVariance(this.accelBuffer);
    });
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    let sumOfSquares = 0;
    for (const v of values) {
      sumOfSquares += Math.pow(v - mean, 2);
    }
    return sumOfSquares / values.length;
  }
}
