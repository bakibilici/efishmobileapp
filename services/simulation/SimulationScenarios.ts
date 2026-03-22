/**
 * Declarative scenario definitions for the CLI Activity Simulator.
 *
 * Each scenario is a sequence of ticks describing sensor state over time.
 * These feed directly into MockSensorProvider → ActivityPipeline.
 */

export interface SimulationTick {
  /** How long this tick's state should be held (in real ms, before speed multiplier) */
  durationMs: number;
  /** Step delta emitted per tick */
  steps: number;
  /** Speed in m/s */
  speed: number;
  /** Whether device is plugged in */
  isCharging: boolean;
  /** Accelerometer motion variance */
  motionVariance: number;
  /** Optional human-readable phase label for log output */
  label?: string;
}

export interface Scenario {
  name: string;
  description: string;
  ticks: SimulationTick[];
}

// ─── Helper to repeat a tick N times ──────────────────────────────────────────

function repeat(tick: SimulationTick, count: number): SimulationTick[] {
  return Array.from({ length: count }, () => ({ ...tick }));
}

// ─── Built-in Scenarios ──────────────────────────────────────────────────────

const walkingScenario: Scenario = {
  name: 'walking',
  description: 'Steady walking with ramp up/down (~20s)',
  ticks: [
    // Ramp up (3s)
    { durationMs: 1000, steps: 1, speed: 0.5, isCharging: false, motionVariance: 0.3, label: '🚶 Ramp up' },
    { durationMs: 1000, steps: 1, speed: 0.8, isCharging: false, motionVariance: 0.4, label: '🚶 Ramp up' },
    { durationMs: 1000, steps: 2, speed: 1.0, isCharging: false, motionVariance: 0.5, label: '🚶 Ramp up' },
    // Steady walking (12s)
    ...repeat(
      { durationMs: 1000, steps: 1, speed: 0.8, isCharging: false, motionVariance: 0.4, label: '🚶 Steady walk' },
      12,
    ),
    // Ramp down (5s)
    { durationMs: 1000, steps: 1, speed: 0.8, isCharging: false, motionVariance: 0.4, label: '🚶 Slowing down' },
    { durationMs: 1000, steps: 1, speed: 0.5, isCharging: false, motionVariance: 0.3, label: '🚶 Slowing down' },
    { durationMs: 1000, steps: 0, speed: 0.2, isCharging: false, motionVariance: 0.1, label: '🛑 Stopping' },
    { durationMs: 1000, steps: 0, speed: 0.0, isCharging: false, motionVariance: 0.05, label: '🛑 Stopped' },
    { durationMs: 1000, steps: 0, speed: 0.0, isCharging: false, motionVariance: 0.02, label: '🛑 Stopped' },
  ],
};

const idleScenario: Scenario = {
  name: 'idle',
  description: 'Zero motion, device still (~15s)',
  ticks: repeat(
    { durationMs: 1000, steps: 0, speed: 0.0, isCharging: false, motionVariance: 0.01, label: '💤 Idle' },
    15,
  ),
};

const carScenario: Scenario = {
  name: 'car',
  description: 'Accelerate → cruise → decelerate (~25s)',
  ticks: [
    // Idle at start (3s)
    ...repeat(
      { durationMs: 1000, steps: 0, speed: 0.0, isCharging: false, motionVariance: 0.02, label: '🅿️ Parked' },
      3,
    ),
    // Acceleration (5s)
    { durationMs: 1000, steps: 0, speed: 2.0, isCharging: false, motionVariance: 0.8, label: '🚗 Accelerating' },
    { durationMs: 1000, steps: 0, speed: 4.0, isCharging: false, motionVariance: 1.0, label: '🚗 Accelerating' },
    { durationMs: 1000, steps: 0, speed: 7.0, isCharging: false, motionVariance: 1.2, label: '🚗 Accelerating' },
    { durationMs: 1000, steps: 0, speed: 11.0, isCharging: false, motionVariance: 1.0, label: '🚗 Accelerating' },
    { durationMs: 1000, steps: 0, speed: 15.0, isCharging: false, motionVariance: 0.8, label: '🚗 Accelerating' },
    // Cruising (10s) — occasional phantom step from bumps
    ...repeat(
      { durationMs: 1000, steps: 0, speed: 15.0, isCharging: false, motionVariance: 0.5, label: '🛣️ Cruising' },
      8,
    ),
    { durationMs: 1000, steps: 1, speed: 15.0, isCharging: false, motionVariance: 0.9, label: '🛣️ Cruising (bump)' },
    { durationMs: 1000, steps: 0, speed: 14.5, isCharging: false, motionVariance: 0.5, label: '🛣️ Cruising' },
    // Deceleration (4s)
    { durationMs: 1000, steps: 0, speed: 10.0, isCharging: false, motionVariance: 0.7, label: '🚗 Decelerating' },
    { durationMs: 1000, steps: 0, speed: 5.0, isCharging: false, motionVariance: 0.5, label: '🚗 Decelerating' },
    { durationMs: 1000, steps: 0, speed: 1.0, isCharging: false, motionVariance: 0.2, label: '🚗 Decelerating' },
    { durationMs: 1000, steps: 0, speed: 0.0, isCharging: false, motionVariance: 0.05, label: '🅿️ Stopped' },
  ],
};

const chargingWalkScenario: Scenario = {
  name: 'charging_walk',
  description: 'Walk while plugged in (2× multiplier test)',
  ticks: [
    ...repeat(
      { durationMs: 1000, steps: 2, speed: 1.2, isCharging: true, motionVariance: 0.6, label: '🚶 Walking + Charging' },
      20,
    ),
  ],
};

const chargingIdleScenario: Scenario = {
  name: 'charging_idle',
  description: 'Plugged in but stationary',
  ticks: repeat(
    { durationMs: 1000, steps: 0, speed: 0.0, isCharging: true, motionVariance: 0.01, label: '🔌 Charging (idle)' },
    20,
  ),
};

const runningSlowScenario: Scenario = {
  name: 'running_slow',
  description: 'Slow jog (~7-8 km/h)',
  ticks: [
    ...repeat(
      { durationMs: 1000, steps: 2, speed: 2.1, isCharging: false, motionVariance: 1.2, label: '🏃 Jogging' },
      20,
    ),
  ],
};

const runningFastScenario: Scenario = {
  name: 'running_fast',
  description: 'Fast running (~12 km/h)',
  ticks: [
    ...repeat(
      { durationMs: 1000, steps: 3, speed: 3.4, isCharging: false, motionVariance: 2.0, label: '🏃 Running Fast' },
      20,
    ),
  ],
};

const runningIntervalScenario: Scenario = {
  name: 'running_interval',
  description: 'Interval training: Walk ↔ Run',
  ticks: [
    ...repeat({ durationMs: 1000, steps: 1, speed: 1.2, isCharging: false, motionVariance: 0.5, label: '🚶 Walking' }, 5),
    ...repeat({ durationMs: 1000, steps: 3, speed: 3.5, isCharging: false, motionVariance: 2.2, label: '🏃 Running' }, 5),
    ...repeat({ durationMs: 1000, steps: 1, speed: 1.2, isCharging: false, motionVariance: 0.5, label: '🚶 Walking' }, 5),
    ...repeat({ durationMs: 1000, steps: 3, speed: 3.5, isCharging: false, motionVariance: 2.2, label: '🏃 Running' }, 5),
  ],
};

// ─── Registry ────────────────────────────────────────────────────────────────

export const SCENARIOS: Record<string, Scenario> = {
  walking: walkingScenario,
  idle: idleScenario,
  car: carScenario,
  charging_walk: chargingWalkScenario,
  charging_idle: chargingIdleScenario,
  running_slow: runningSlowScenario,
  running_fast: runningFastScenario,
  running_interval: runningIntervalScenario,
};

export function getScenario(name: string): Scenario | undefined {
  return SCENARIOS[name];
}

export function getScenarioNames(): string[] {
  return Object.keys(SCENARIOS);
}
