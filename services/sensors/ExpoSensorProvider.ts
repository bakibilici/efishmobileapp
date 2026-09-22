import { Pedometer, Accelerometer } from 'expo-sensors';
import * as Location from 'expo-location';
import { ISensorDataProvider, SensorProviderConfig, SensorDataPayload, UNKNOWN_SPEED } from './types';
import { SpeedFix, deriveSpeedMps, speedIfFresh, trimTrail } from './derivedSpeed';

const DEFAULT_CONFIG: SensorProviderConfig = {
  samplingRateMs: 2000,
  enableBackgroundLocation: true,
};

/** After this many sampling ticks with no new fix, the stored speed is history. */
const SPEED_MAX_AGE_TICKS = 3;
/** Faster than a sprint. Steps above this rate in one sample are a backlog, not a pace. */
const MAX_LIVE_STEPS_PER_SEC = 5;

export class ExpoSensorProvider implements ISensorDataProvider {
  private config: SensorProviderConfig = DEFAULT_CONFIG;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(data: SensorDataPayload) => void> = new Set();
  
  // Accumulators and local state
  private stepsAccumulated = 0;
  // Steps CMPedometer counted while JS was suspended, delivered in one lump on
  // resume. They belong in the day's total but not in a live cadence.
  private backlogSteps = 0;
  // Unknown until a fix carries a speed. A 0 here would be printed as a
  // confident "0 km/sa" before the first fix, and for a whole walk whenever
  // location is denied or unavailable.
  private currentSpeed = UNKNOWN_SPEED;
  // When the fix behind currentSpeed arrived. A speed with no fix behind it any
  // more is history, not a reading — see speedIfFresh.
  private lastFixAt: number | null = null;
  private motionVariance = 0;

  // Native subscriptions
  private stepSub: Pedometer.Subscription | null = null;
  private accelSub: ReturnType<typeof Accelerometer.addListener> | null = null;
  private locationSub: Location.LocationSubscription | null = null;

  // Accelerometer buffer for variance calculation
  private accelBuffer: number[] = [];

  // Recent fixes, oldest first: the fallback measures a speed from these
  // whenever Core Location declines to report one of its own.
  private locationTrail: SpeedFix[] = [];

  public subscribe(callback: (data: SensorDataPayload) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public async start(config?: Partial<SensorProviderConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.stop(); // Clear any existing

    // Each sensor starts independently: a denied location permission must not
    // take the pedometer or the accelerometer down with it.
    const results = await Promise.allSettled([this.initPedometer(), this.initLocation()]);
    results.forEach((r) => {
      if (r.status === 'rejected') console.warn('[ExpoSensorProvider] sensor failed to initialize:', r.reason);
    });
    try {
      this.initAccelerometer();
    } catch (e) {
      console.warn('[ExpoSensorProvider] accelerometer failed to initialize:', e);
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
    // Nothing is watching any more: the last speed is history, not a reading.
    this.currentSpeed = UNKNOWN_SPEED;
    this.lastFixAt = null;
    // Stale fixes must not anchor a baseline across the gap when we resume.
    this.locationTrail = [];
    this.backlogSteps = 0;
  }

  private emitPayload(): void {
    const now = Date.now();
    const payload: SensorDataPayload = {
      timestamp: now,
      steps: this.stepsAccumulated,
      backlogSteps: this.backlogSteps,
      // Only as long as a fix stands behind it: this loop ticks every
      // samplingRateMs whether or not location has anything new to say.
      speed: speedIfFresh(
        this.currentSpeed,
        this.lastFixAt,
        now,
        this.config.samplingRateMs * SPEED_MAX_AGE_TICKS,
      ),
      motionVariance: this.motionVariance,
    };

    // Reset steps delta accumulator for the next interval
    this.stepsAccumulated = 0;
    this.backlogSteps = 0;

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
        const delta = Math.max(0, result.steps - this.lastEmittedPedometerTotal);
        this.lastEmittedPedometerTotal = result.steps;

        // Coming back from a locked screen, the first event carries everything
        // counted while JS was suspended — hundreds of steps in one sample.
        // Those are real steps and must still reach the day's total, but a
        // classifier window that read them as this second's cadence would call
        // a walk a sprint. So the plausible part goes out as live pace and the
        // rest goes out as backlog, which only the step counter adds up.
        const liveCap = (this.config.samplingRateMs / 1000) * MAX_LIVE_STEPS_PER_SEC;
        const live = Math.min(delta, liveCap);
        this.stepsAccumulated += live;
        this.backlogSteps += delta - live;
      });
    }
  }

  private async initLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    if (this.config.enableBackgroundLocation) {
      // "While Using" is enough for speed while the app is open; a denied
      // background grant used to abort the watch and CAR could never fire.
      try {
        await Location.requestBackgroundPermissionsAsync();
      } catch (e) {
        console.warn('[ExpoSensorProvider] background location unavailable, using foreground:', e);
      }
    }

    this.locationSub = await Location.watchPositionAsync(
      {
        // Balanced is kCLLocationAccuracyHundredMeters, which Core Location
        // happily serves from Wi-Fi and cell towers — and those fixes carry no
        // speed at all (-1), so a whole walk read 0 km/h. Ten metres keeps GPS
        // on, which is what actually measures a walking pace.
        accuracy: Location.Accuracy.High,
        distanceInterval: 1,
        timeInterval: 2000,
      },
      (location) => {
        // speed comes in m/s natively; iOS reports -1 when it has no estimate,
        // and that "no estimate" has to survive the trip to the screen: the
        // old Math.max(0, …) turned it into a confident 0 km/h, which is what
        // made the capsule read "Beklemede · 0 km/sa" through a whole walk.
        const speed = location.coords.speed;
        const measured =
          typeof speed === 'number' && Number.isFinite(speed) && speed >= 0;

        const at = Number.isFinite(location.timestamp) ? location.timestamp : Date.now();
        this.locationTrail = trimTrail(this.locationTrail, at);
        this.locationTrail.push({
          t: at,
          lat: location.coords.latitude,
          lon: location.coords.longitude,
          acc: location.coords.accuracy,
        });

        // Core Location's own estimate first — it is Doppler, and better than
        // anything two fixes apart can say. Only when it withholds one do we
        // measure the speed ourselves from how far the fixes have moved.
        this.currentSpeed = measured ? speed : deriveSpeedMps(this.locationTrail);
        this.lastFixAt = Date.now();
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
