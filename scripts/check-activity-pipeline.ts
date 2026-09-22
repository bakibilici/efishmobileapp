/**
 * Asserts the walk the owner actually took: the pedometer sees a normal pace
 * while iOS has no speed estimate for it (CLLocation.speed is -1 on a coarse
 * fix, and expo-location passes that straight through). The classifier must
 * still call it a walk, the speed must stay unknown instead of becoming a
 * confident 0, and the capsule must say "Yürüyüş".
 *
 * No test runner is installed, so this runs under tsx:
 *
 *   npx tsx scripts/check-activity-pipeline.ts
 */
import assert from "node:assert/strict";

import { activityStatus } from "../components/map-header/activityStatus";
import { toDisplayKmh } from "../hooks/useSpeed";
import { ActivityState, ActivityStateMachine } from "../services/ActivityStateMachine";
import { classifyActivity } from "../services/sensors/ActivityClassifier";
import { ActivityPipeline } from "../services/sensors/ActivityPipeline";
import { MockSensorProvider } from "../services/sensors/MockSensorProvider";
import { SpeedStore } from "../services/sensors/SpeedStore";
import { StepStore } from "../services/sensors/StepStore";
import {
  TRAIL_MAX_MS,
  deriveSpeedMps,
  speedIfFresh,
  trimTrail,
  type SpeedFix,
} from "../services/sensors/derivedSpeed";
import {
  RESUME_LOOKBACK_MS,
  seededStateFrom,
} from "../services/sensors/resumeSeed";
import {
  UNKNOWN_SPEED,
  type ISensorDataProvider,
  type SensorDataPayload,
} from "../services/sensors/types";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const COLORS = { primary: "#0093C9", tertiary: "#7CFBC7", neutral: "#587A99" };

const sample = (t: number, steps: number, speed: number): SensorDataPayload => ({
  timestamp: t,
  steps,
  speed,
  motionVariance: 0.45,
});

/** A 5 s window as the 2 s sampling loop fills it: three samples, 1.8 steps/s. */
const walkWindow = (speed: number): SensorDataPayload[] => [
  sample(0, 4, speed),
  sample(2000, 3, speed),
  sample(4000, 4, speed),
];

check("a walk with no speed estimate is still a walk", () => {
  assert.equal(classifyActivity(walkWindow(UNKNOWN_SPEED)), "WALKING");
  // And identical to what the old clamp-to-zero provider produced.
  assert.equal(classifyActivity(walkWindow(0)), "WALKING");
});

check("an unknown speed never raises the state by itself", () => {
  // No steps and no speed is not a car and not a run, whatever the sentinel is.
  const still = [
    { ...sample(0, 0, UNKNOWN_SPEED), motionVariance: 0.01 },
    { ...sample(2000, 0, UNKNOWN_SPEED), motionVariance: 0.01 },
    { ...sample(4000, 0, UNKNOWN_SPEED), motionVariance: 0.01 },
  ];
  assert.equal(classifyActivity(still), "IDLE");
  // A measured motorway speed still reads as a car.
  assert.equal(classifyActivity([sample(0, 0, 25), sample(4000, 0, 25)]), "CAR");
});

check("the state machine reaches WALKING within two windows", () => {
  // From a cold buffer this is the honest floor: one window to classify, one
  // debounce to clear — about 10 s. That is why an unlock mid-walk does not
  // start from a cold buffer; see the resume seeding checks below.
  const fsm = new ActivityStateMachine({ carToIdleDelayMs: 45000 });
  fsm.transition(classifyActivity(walkWindow(UNKNOWN_SPEED)), false, 0);
  assert.equal(fsm.getState(), ActivityState.IDLE, "debounced on the first window");
  fsm.transition(classifyActivity(walkWindow(UNKNOWN_SPEED)), false, 5000);
  assert.equal(fsm.getState(), ActivityState.WALKING);
});

/** Runs one window of the real pipeline and returns what SpeedStore holds. */
const windowThrough = async (speeds: number[]): Promise<number> => {
  const provider = new MockSensorProvider();
  const pipeline = new ActivityPipeline(provider, new ActivityStateMachine());
  SpeedStore.reset();
  await pipeline.start();
  for (const speed of speeds) {
    provider.currentStepsAccumulator = 4;
    provider.currentSpeed = speed;
    provider.motionVariance = 0.45;
    provider.simulateTickNow();
  }
  pipeline.processWindow();
  pipeline.stop();
  return SpeedStore.getSpeed();
};

const speedChecks = async () => {
  const allUnknown = await windowThrough([UNKNOWN_SPEED, UNKNOWN_SPEED, UNKNOWN_SPEED]);
  const mixed = await windowThrough([UNKNOWN_SPEED, 1.3, UNKNOWN_SPEED, 1.3]);
  const measuredZero = await windowThrough([0, 0]);

  check("a window with nothing measured leaves the speed unknown", () => {
    assert.equal(allUnknown, UNKNOWN_SPEED);
  });

  check("only measured samples are averaged", () => {
    // 1.3 m/s is 4.68 km/h. The unknowns must not drag it towards zero.
    assert.ok(Math.abs(mixed - 4.68) < 0.01, `expected about 4.68 km/h, got ${mixed}`);
    // A measured zero is still a measurement.
    assert.equal(measuredZero, 0);
  });
};

/**
 * A provider that emits exactly what the test hands it, so the pipeline's own
 * step routing can be exercised (MockSensorProvider has no backlog channel).
 */
class ManualProvider implements ISensorDataProvider {
  private listeners = new Set<(d: SensorDataPayload) => void>();
  async start(): Promise<void> {}
  stop(): void {}
  subscribe(cb: (d: SensorDataPayload) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emit(payload: SensorDataPayload): void {
    this.listeners.forEach((l) => l(payload));
  }
}

const backlogChecks = async () => {
  // Resuming mid-walk: CMPedometer hands over everything it counted while JS
  // was suspended, in one sample.
  const provider = new ManualProvider();
  const fsm = new ActivityStateMachine();
  const pipeline = new ActivityPipeline(provider, fsm);
  StepStore.reset();
  await pipeline.start();

  provider.emit({ timestamp: 0, steps: 2, backlogSteps: 600, speed: 2.0, motionVariance: 0.45 });
  provider.emit({ timestamp: 2000, steps: 2, backlogSteps: 0, speed: 2.0, motionVariance: 0.45 });
  provider.emit({ timestamp: 4000, steps: 2, backlogSteps: 0, speed: 2.0, motionVariance: 0.45 });
  // What the classifier is handed: the live pace only, 1.5 steps/s.
  const classified = classifyActivity([
    sample(0, 2, 2.0),
    sample(2000, 2, 2.0),
    sample(4000, 2, 2.0),
  ]);
  // What it would be handed without the split: the backlog as this second's pace.
  const unsplit = classifyActivity([
    sample(0, 602, 2.0),
    sample(2000, 2, 2.0),
    sample(4000, 2, 2.0),
  ]);
  pipeline.processWindow();
  pipeline.stop();
  // addSteps awaits hydration before it lands.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const counted = StepStore.getSnapshot().rawSteps;
  StepStore.reset();

  check("a backlog of steps counts, but is not a pace", () => {
    // 2 m/s is a brisk 7.2 km/h, over the classifier's running speed bar, so a
    // backlog read as cadence tips it over: the capsule would flash
    // "Koşu (yavaş)" for a window or two of an ordinary walk after an unlock.
    assert.equal(unsplit, "RUNNING", "the flash this split exists to prevent");
    assert.equal(classified, "WALKING");
    // And not one of those steps is lost from the day's total.
    assert.equal(counted, 606, `expected 2+2+2 live and 600 backlog, got ${counted}`);
  });
};

check("the capsule calls a walk a walk, with or without a speed", () => {
  const unknown = activityStatus(
    ActivityState.WALKING,
    toDisplayKmh(UNKNOWN_SPEED),
    COLORS,
    true,
  );
  assert.equal(unknown.label, "Yürüyüş");
  assert.equal(unknown.speedText, null, "no speed is printed when none was measured");

  // The reported bug: WALKING with a zero speed read "Beklemede · 0 km/sa".
  const zero = activityStatus(ActivityState.WALKING, toDisplayKmh(0), COLORS, true);
  assert.equal(zero.label, "Yürüyüş");
  assert.equal(zero.speedText, "0 km/sa");

  const walking = activityStatus(ActivityState.WALKING, toDisplayKmh(4.68), COLORS, true);
  assert.equal(walking.label, "Yürüyüş");
  assert.equal(walking.speedText, "5 km/sa");

  // Standing still is the state machine's call, and it still reads "Beklemede".
  assert.equal(activityStatus(ActivityState.IDLE, toDisplayKmh(0), COLORS, true).label, "Beklemede");
});

// --- The speed the app measures for itself when iOS withholds one ---

/** Metres north, as a latitude delta. Good to well under a metre at these sizes. */
const northed = (lat: number, metres: number) => lat + metres / 111320;

/**
 * A trail walking due north at `mps`, one fix every 2 s, as watchPositionAsync
 * delivers them. `acc` is the horizontal accuracy Core Location reports.
 */
const walkTrail = (mps: number, count: number, acc = 5): SpeedFix[] =>
  Array.from({ length: count }, (_, i) => ({
    t: i * 2000,
    lat: northed(41.015, mps * i * 2),
    lon: 28.979,
    acc,
  }));

check("a walk iOS reports no speed for still gets a measured one", () => {
  // 1.4 m/s is an ordinary walking pace: 5.04 km/h.
  const mps = deriveSpeedMps(walkTrail(1.4, 4));
  assert.ok(Math.abs(mps - 1.4) < 0.05, `expected about 1.4 m/s, got ${mps}`);
  assert.equal(toDisplayKmh(mps * 3.6), 5);
});

check("GPS wander while standing still is not a speed", () => {
  // Two metres of drift over a full 6 s baseline: inside the noise floor.
  const still: SpeedFix[] = [
    { t: 0, lat: 41.015, lon: 28.979, acc: 5 },
    { t: 2000, lat: northed(41.015, 1.2), lon: 28.979, acc: 5 },
    { t: 4000, lat: northed(41.015, 0.4), lon: 28.979, acc: 5 },
    { t: 6000, lat: northed(41.015, 2), lon: 28.979, acc: 5 },
  ];
  assert.equal(deriveSpeedMps(still), UNKNOWN_SPEED, "no reading, not a phantom zero");
});

check("a walk that ends where it started reads as no speed, never as 0 km/sa", () => {
  // Pacing a room, or a loop round the block: the pedometer sees a walk the
  // whole time, but the two ends of the baseline are a metre apart. The owner's
  // second complaint was "hızım hep 0 da kaldı" — under a correct "Yürüyüş"
  // label, a printed 0 would be that same complaint again.
  const loop: SpeedFix[] = [
    { t: 0, lat: 41.015, lon: 28.979, acc: 5 },
    { t: 2000, lat: northed(41.015, 8), lon: 28.979, acc: 5 },
    { t: 4000, lat: northed(41.015, 4), lon: 28.979, acc: 5 },
    { t: 6000, lat: northed(41.015, 1), lon: 28.979, acc: 5 },
  ];
  assert.equal(deriveSpeedMps(loop), UNKNOWN_SPEED);
  const capsule = activityStatus(
    ActivityState.WALKING,
    toDisplayKmh(UNKNOWN_SPEED),
    COLORS,
    true,
  );
  assert.equal(capsule.label, "Yürüyüş");
  assert.equal(capsule.speedText, null, "silence, not a zero");
  assert.equal(capsule.showSteps, true, "the walk still shows its steps");
});

check("a speed with no fresh fix behind it expires", () => {
  // The sampling loop re-emits every 2 s; fixes only arrive when the phone
  // moves a metre. Standing still after a walk, the last reading must not be
  // re-emitted forever: it would print a speed at a standstill and hold the
  // classifier above its IDLE bar, which is also what keeps a parked car in CAR.
  const maxAge = 6000;
  assert.equal(speedIfFresh(1.4, 10000, 12000, maxAge), 1.4, "still fresh");
  assert.equal(speedIfFresh(1.4, 10000, 16000, maxAge), 1.4, "the last tick it counts");
  assert.equal(speedIfFresh(1.4, 10000, 16001, maxAge), UNKNOWN_SPEED, "stale");
  assert.equal(speedIfFresh(1.4, null, 16000, maxAge), UNKNOWN_SPEED, "no fix ever arrived");
  // And an expired speed reads as no speed rather than as a standstill.
  assert.equal(toDisplayKmh(speedIfFresh(1.4, null, 0, maxAge) * 3.6), -1);
});

check("a walk the phone counted while locked is committed on resume", () => {
  const walkingSteps = 18; // 1.8 steps/s over the 10 s lookback
  assert.equal(
    seededStateFrom(ActivityState.IDLE, walkingSteps, RESUME_LOOKBACK_MS),
    ActivityState.WALKING,
    "no 10 s of Beklemede after an unlock",
  );
  assert.equal(
    seededStateFrom(ActivityState.UNKNOWN, walkingSteps, RESUME_LOOKBACK_MS),
    ActivityState.WALKING,
  );
  // A few steps to the kettle are not a walk: the bar is the classifier's own.
  assert.equal(seededStateFrom(ActivityState.IDLE, 4, RESUME_LOOKBACK_MS), null);
  assert.equal(seededStateFrom(ActivityState.IDLE, 0, RESUME_LOOKBACK_MS), null);
});

check("history never overrules a state the app is already in", () => {
  // The one that matters: a passenger's steps must not take a live drive out of
  // CAR, which is what would start DriveSessionStore's end-of-drive timer.
  for (const live of [ActivityState.CAR, ActivityState.CHARGING, ActivityState.RUNNING, ActivityState.WALKING]) {
    assert.equal(seededStateFrom(live, 40, RESUME_LOOKBACK_MS), null, `${live} is left alone`);
  }
});

check("a fix too coarse to tell walking from wander answers nothing", () => {
  // 100 m accuracy is the Balanced fix that started all this.
  assert.equal(deriveSpeedMps(walkTrail(1.4, 4, 100)), UNKNOWN_SPEED);
  // Missing accuracy is unusable too, not optimistically trusted.
  const noAcc = walkTrail(1.4, 4).map((f) => ({ ...f, acc: null }));
  assert.equal(deriveSpeedMps(noAcc), UNKNOWN_SPEED);
});

check("too short a baseline is not divided by", () => {
  // Two fixes 2 s apart: a walk's 2.8 m is inside the error bars of a 5 m fix.
  assert.equal(deriveSpeedMps(walkTrail(1.4, 2)), UNKNOWN_SPEED);
});

check("a gap in the trail does not become a speed", () => {
  // The app was backgrounded: the next fix is minutes later, and the straight
  // line to it says nothing about how fast they were going.
  const resumed: SpeedFix[] = [
    { t: 0, lat: 41.015, lon: 28.979, acc: 5 },
    { t: 300000, lat: northed(41.015, 400), lon: 28.979, acc: 5 },
  ];
  assert.equal(deriveSpeedMps(resumed), UNKNOWN_SPEED);
});

check("an implausible jump is a bad fix, not a speed", () => {
  const jump: SpeedFix[] = [
    { t: 0, lat: 41.015, lon: 28.979, acc: 5 },
    { t: 4000, lat: northed(41.015, 5000), lon: 28.979, acc: 5 },
  ];
  assert.equal(deriveSpeedMps(jump), UNKNOWN_SPEED);
});

check("the trail forgets fixes too old to anchor anything", () => {
  const trail = walkTrail(1.4, 12); // 22 s of history
  const kept = trimTrail(trail, 22000);
  assert.ok(kept.length < trail.length, "old fixes are dropped");
  assert.ok(
    kept.every((f) => 22000 - f.t <= TRAIL_MAX_MS),
    "nothing older than the trail window survives",
  );
});

check("a driving speed Core Location does report is used as given", () => {
  // The fallback is a fallback: the pipeline prefers coords.speed, and this
  // stays the CAR-threshold arithmetic it always was.
  assert.equal(classifyActivity([sample(0, 0, 25), sample(4000, 0, 25)]), "CAR");
});

speedChecks()
  .then(backlogChecks)
  .then(() => {
    console.log(`\n${passed} checks passed`);
    // The pipeline's sampling loop is stopped, but the mock provider's timers
    // are not this script's business to wait on.
    process.exit(0);
  });
