/**
 * Bootstraps the entire sensor → classification → state machine → step store pipeline.
 *
 * Call `ActivityService.start()` once at app startup.
 * Call `ActivityService.stop()` on app teardown.
 *
 * This is the ONLY place that knows about all the pieces.
 * The rest of the app only interacts with StepStore and ActivityStateMachine.
 */

import Constants from "expo-constants";
import { AppState, type AppStateStatus } from "react-native";
import { Pedometer } from "expo-sensors";
import { ActivityStateMachine } from "./ActivityStateMachine";
import { ActivityPipeline } from "./sensors/ActivityPipeline";
import { ExpoSensorProvider } from "./sensors/ExpoSensorProvider";
import { MockSensorProvider } from "./sensors/MockSensorProvider";
import { StepStore } from "./sensors/StepStore";
import { ChargingSessionStore } from "./ChargingSessionStore";
import { DeviceChargingMonitor } from "./sensors/DeviceChargingMonitor";
import { ActivityRecorder } from "./sensors/ActivityRecorder";
import { RESUME_LOOKBACK_MS, seededStateFrom } from "./sensors/resumeSeed";
import { ActivityState } from "./ActivityStateMachine";

// Singleton instances
// CAR → IDLE waits longer than the generic 5 s: a red light must not end a drive.
const stateMachine = new ActivityStateMachine({ carToIdleDelayMs: 45000 });

// In dev, we keep both so we can hot-swap them when the CLI connects/disconnects
const realProvider = new ExpoSensorProvider();
const mockProvider = new MockSensorProvider();

// The active pipeline
const pipeline = new ActivityPipeline(realProvider, stateMachine);

let isRunning = false;
let bridgePollInterval: ReturnType<typeof setInterval> | null = null;
let isSimulationActive = false;

// ─── Dev Bridge Poller ───────────────────────────────────────────────────────
// In dev mode, polls the CLI simulation's HTTP bridge server (localhost:8375).
// When the CLI is running a simulation, the app picks up sensor data and feeds
// it through its own pipeline — making the UI update in real time.
// On physical devices, 'localhost' points to the phone. We need the Mac's IP.

let BRIDGE_URL = "http://localhost:8375/state";
const hostUri = Constants.expoConfig?.hostUri;
if (hostUri) {
  // hostUri looks like "192.168.1.9:8081"
  const ip = hostUri.split(":")[0];
  BRIDGE_URL = `http://${ip}:8375/state`;
}
const BRIDGE_POLL_MS = 400;

if (__DEV__) {
  console.log(`[ActivityService] 🔗 Bridge URL: ${BRIDGE_URL}`);
  console.log(`[ActivityService] 🔗 hostUri: ${hostUri ?? "(undefined)"}`);
}

function startBridgePoller(): void {
  if (!__DEV__) return;

  let wasActive = false;
  let errorCount = 0;

  bridgePollInterval = setInterval(async () => {
    try {
      const res = await fetch(BRIDGE_URL);
      const data = await res.json();
      errorCount = 0; // reset on success

      if (data.active) {
        if (!wasActive) {
          console.log(
            `[ActivityService] 📡 Simulation bridge connected — swapping to MockSensorProvider`,
          );
          pipeline.setProvider(mockProvider);
          stateMachine.updateConfig({ debounceMs: 0 }); // Bypass 5s debounce for accelerated simulations
          isSimulationActive = true;
          wasActive = true;
        }

        // Feed simulation data into the mock provider
        mockProvider.currentStepsAccumulator = data.steps;
        mockProvider.currentSpeed = data.speed;
        ChargingSessionStore.setChargingState(data.isCharging);
        mockProvider.motionVariance = data.motionVariance;

        // Emit and classify immediately
        mockProvider.simulateTickNow();
        pipeline.processWindow();
      } else if (wasActive) {
        console.log(
          "[ActivityService] 📡 Simulation bridge disconnected (simulation stopped)",
        );
        wasActive = false;
        resetPipelineToIdle();
      }
    } catch (err) {
      errorCount++;
      // Log the first 3 errors so we can diagnose connectivity issues
      if (errorCount <= 3) {
        console.log(
          `[ActivityService] ⚠️ Bridge poll failed (${errorCount}): ${err instanceof Error ? err.message : err}`,
        );
      }
      if (wasActive) {
        console.log(
          "[ActivityService] 📡 Simulation bridge disconnected (server stopped)",
        );
        wasActive = false;
        resetPipelineToIdle();
      }
    }
  }, BRIDGE_POLL_MS);
}

function resetPipelineToIdle() {
  console.log("[ActivityService] 🔄 Reverting to real ExpoSensorProvider");

  // 1. Force the mock provider to emit one last IDLE tick to flush the pipeline
  mockProvider.currentSpeed = 0;
  mockProvider.currentStepsAccumulator = 0;
  mockProvider.motionVariance = 0;
  ChargingSessionStore.setChargingState(false);

  for (let i = 0; i < 3; i++) {
    mockProvider.simulateTickNow();
  }
  pipeline.processWindow();

  // 2. Swap back to real hardware sensors
  pipeline.setProvider(realProvider);
  stateMachine.updateConfig({ debounceMs: 5000 }); // Restore real-world hysteresis
  isSimulationActive = false;
}

function stopBridgePoller(): void {
  if (bridgePollInterval) {
    clearInterval(bridgePollInterval);
    bridgePollInterval = null;
  }
}

// ─── Resume Seeding ──────────────────────────────────────────────────────────
// The pipeline does not run while the phone is locked, so it comes back from a
// walk knowing nothing and needs two windows — about ten seconds — before the
// capsule stops saying "Beklemede". The phone counted those steps regardless,
// so we ask it and commit the walk at once. See sensors/resumeSeed for the
// rules about what history is allowed to conclude.

let appStateSub: { remove: () => void } | null = null;

async function seedFromRecentSteps(): Promise<void> {
  // The dev bridge drives the state machine itself, with the debounce off.
  if (isSimulationActive) return;
  // Charging outranks activity in the FSM; seeding a walk under it would only
  // be overwritten by the next window.
  if (ChargingSessionStore.isCharging) return;

  try {
    // Step history is iOS-only and needs the motion grant. The seed is an
    // optimisation on top of the live windows, so it must never be the thing
    // that puts a permission prompt on screen — the pedometer subscription in
    // ExpoSensorProvider asks for that, in its own time.
    if (!(await Pedometer.isAvailableAsync())) return;
    if (!(await Pedometer.getPermissionsAsync()).granted) return;

    const end = new Date();
    const start = new Date(end.getTime() - RESUME_LOOKBACK_MS);
    const { steps } = await Pedometer.getStepCountAsync(start, end);
    const seeded = seededStateFrom(stateMachine.getState(), steps, RESUME_LOOKBACK_MS);
    if (!seeded) return;
    console.log(
      `[ActivityService] Resume: ${steps} steps in the last ${RESUME_LOOKBACK_MS / 1000}s, seeding ${seeded}`,
    );
    stateMachine.seedState(seeded);
  } catch {
    // Step history is iOS-only and needs the motion grant. Without it we simply
    // wait for the live windows — the behaviour this seeding improves on.
  }
}

function startResumeSeeding(): void {
  appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
    if (next === "active") void seedFromRecentSteps();
  });
  // Opening the app mid-walk is the same situation as unlocking mid-walk.
  void seedFromRecentSteps();
}

function stopResumeSeeding(): void {
  appStateSub?.remove();
  appStateSub = null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const ActivityService = {
  /** Boot the entire sensor pipeline. Safe to call multiple times (idempotent). */
  async start(): Promise<void> {
    if (isRunning) return;
    isRunning = true;

    console.log("[ActivityService] Starting pipeline...");
    ActivityRecorder.attach(stateMachine);
    await pipeline.start();
    console.log("[ActivityService] Pipeline running.");

    // Phone charger → CHARGING state (2x steps), vetoed while driving.
    void DeviceChargingMonitor.start(() => stateMachine.getState() === ActivityState.CAR);

    // Come back from a locked screen already knowing the walk is a walk.
    startResumeSeeding();

    // In dev mode, start listening for CLI simulation data
    startBridgePoller();
  },

  /** Gracefully stop */
  stop(): void {
    if (!isRunning) return;
    isRunning = false;
    stopBridgePoller();
    stopResumeSeeding();
    DeviceChargingMonitor.stop();
    pipeline.stop();
    console.log("[ActivityService] Pipeline stopped.");
  },

  /** Expose for components that need to subscribe to state changes (e.g. CarModeModal) */
  getStateMachine(): ActivityStateMachine {
    return stateMachine;
  },

  /** Expose step store for direct access if needed */
  getStepStore() {
    return StepStore;
  },

  /** Reset step count (e.g. new day) */
  resetSteps(): void {
    StepStore.reset();
  },

  /** Returns true if the dev bridge is currently driving simulation data */
  isSimulationActive(): boolean {
    return isSimulationActive;
  },
};
