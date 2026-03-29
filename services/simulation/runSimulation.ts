#!/usr/bin/env node
/**
 * CLI Activity Simulator
 *
 * Feeds scripted sensor data through the real ActivityPipeline and logs
 * every pipeline stage: sensor → buffer → classifier → FSM → StepStore.
 *
 * Usage:
 *   npx tsx services/simulation/runSimulation.ts --scenario walking --speed 10
 *   npm run sim:walk
 */

import { execSync } from "child_process";
import * as http from "http";
import { ActivityState, ActivityStateMachine } from "../ActivityStateMachine";
import { ChargingSessionStore } from "../ChargingSessionStore";
import { ActivityPipeline } from "../sensors/ActivityPipeline";
import { MockSensorProvider } from "../sensors/MockSensorProvider";
import { StepStore } from "../sensors/StepStore";
import { Scenario, getScenario, getScenarioNames } from "./SimulationScenarios";
process.env.IS_SIMULATION = "true";

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
};

// ─── Help Output ─────────────────────────────────────────────────────────────

function printHelp(): void {
  console.log(`
${C.cyan}${C.bold}🐟 eFish Activity Simulator${C.reset}

${C.bold}Usage:${C.reset}
  npx tsx services/simulation/runSimulation.ts --scenario <name> [--speed <N>]
  npm run sim:walk                              ${C.dim}# shortcut${C.reset}

${C.bold}Scenarios:${C.reset}
  ${C.green}walking${C.reset}         Steady walking with ramp up/down (~20s)
  ${C.green}idle${C.reset}            Zero motion, device still (~15s)
  ${C.green}car${C.reset}             Accelerate → cruise → decelerate (~25s)
  ${C.green}charging_walk${C.reset}   Walk while plugged in (2× multiplier test)
  ${C.yellow}all${C.reset}             Run all scenarios sequentially

${C.bold}Options:${C.reset}
  --scenario, -s  Scenario to run (required)
  --speed, -x     Speed multiplier (default: 10, higher = faster)
  --once          Run scenario once and exit (default: loop until Ctrl+C)
  --help, -h      Show this help

${C.bold}Examples:${C.reset}
  ${C.dim}npm run sim:walk${C.reset}                          ${C.dim}# loops until Ctrl+C${C.reset}
  ${C.dim}npm run simulate -- -s car -x 5 --once${C.reset}    ${C.dim}# single run${C.reset}
  ${C.dim}npx tsx services/simulation/runSimulation.ts -s walking -x 20${C.reset}
`);
}

// ─── CLI Arg Parsing ─────────────────────────────────────────────────────────

interface CLIArgs {
  scenario: string | null;
  speed: number;
  help: boolean;
  once: boolean;
}

function parseArgs(argv: string[]): CLIArgs {
  const args: CLIArgs = { scenario: null, speed: 10, help: false, once: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--scenario" || arg === "-s") {
      args.scenario = argv[++i] ?? null;
    } else if (arg === "--speed" || arg === "-x") {
      const val = parseInt(argv[++i], 10);
      if (!isNaN(val) && val > 0) args.speed = val;
    } else if (arg === "--once") {
      args.once = true;
    }
  }

  return args;
}

// ─── Logging Utilities ───────────────────────────────────────────────────────

function logSensor(
  tickIndex: number,
  label: string,
  data: {
    steps: number;
    speed: number;
    isCharging: boolean;
    motionVariance: number;
  },
): void {
  const chargingTag = data.isCharging ? ` ${C.yellow}CHARGING${C.reset}` : "";
  console.log(
    `${C.dim}[${String(tickIndex).padStart(3, "0")}]${C.reset} ` +
      `${C.blue}SENSOR${C.reset} ${label.padEnd(25)} ` +
      `steps=${C.bold}${data.steps}${C.reset} speed=${data.speed.toFixed(1)}m/s var=${data.motionVariance.toFixed(2)}${chargingTag}`,
  );
}

function logClassification(state: string): void {
  const color =
    state === "WALKING"
      ? C.green
      : state === "CAR"
        ? C.red
        : state === "IDLE"
          ? C.dim
          : C.yellow;
  console.log(
    `     ${C.magenta}CLASSIFY${C.reset} → ${color}${C.bold}${state}${C.reset}`,
  );
}

function logFSMTransition(from: string, to: string): void {
  console.log(
    `     ${C.bgMagenta}${C.white}${C.bold} FSM ${C.reset} ${from} → ${C.bold}${to}${C.reset}`,
  );
}

function logStepStore(
  raw: number,
  effective: number,
  isCharging: boolean,
): void {
  const multiplier = isCharging ? " (2×)" : "";
  console.log(
    `     ${C.cyan}STEPS${C.reset}   raw=${raw} effective=${C.bold}${effective}${C.reset}${multiplier}`,
  );
}

// ─── Live Bridge Server ─────────────────────────────────────────────────────
// Serves current simulation state over HTTP so the running Expo app can poll it.
// App's ActivityService (dev mode) hits GET /state every 500ms.

const BRIDGE_PORT = 8375;

interface LiveState {
  active: boolean;
  steps: number;
  speed: number;
  isCharging: boolean;
  motionVariance: number;
  scenario: string;
  tick: number;
  label: string;
}

let liveState: LiveState = {
  active: false,
  steps: 0,
  speed: 0,
  isCharging: false,
  motionVariance: 0,
  scenario: "",
  tick: 0,
  label: "",
};

let bridgeServer: http.Server | null = null;

function killExistingBridge(): void {
  try {
    // Find PID(s) listening on the bridge port (macOS/Linux)
    const output = execSync(`lsof -ti tcp:${BRIDGE_PORT}`, {
      encoding: "utf-8",
    }).trim();

    if (output) {
      const pids = output.split("\n").filter(Boolean);
      console.log(
        `${C.yellow}⚠ Killing existing process(es) on port ${BRIDGE_PORT}: PID ${pids.join(", ")}${C.reset}`,
      );
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), "SIGTERM");
        } catch {
          // Process may have already exited
        }
      }
      // Brief wait for the port to free up
      execSync("sleep 0.5");
    }
  } catch {
    // lsof returns non-zero if no process found — that's fine
  }
}

function startBridgeServer(): Promise<void> {
  // Kill any previous simulation that's still holding the port
  killExistingBridge();

  return new Promise((resolve) => {
    bridgeServer = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(liveState));
    });

    bridgeServer.listen(BRIDGE_PORT, () => {
      console.log(
        `${C.green}${C.bold}📡 Bridge server${C.reset} listening on ${C.bold}http://localhost:${BRIDGE_PORT}${C.reset}`,
      );
      console.log(
        `${C.dim}   App will pick up simulation data automatically in dev mode${C.reset}\n`,
      );
      resolve();
    });

    bridgeServer.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        console.log(
          `${C.red}✗ Bridge port ${BRIDGE_PORT} still in use after cleanup — bridge disabled${C.reset}`,
        );
      }
      resolve(); // Don't block simulation if bridge fails
    });
  });
}

function stopBridgeServer(): void {
  liveState = { ...liveState, active: false };
  bridgeServer?.close();
  bridgeServer = null;
}

// ─── Simulation Runner ──────────────────────────────────────────────────────

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function runScenario(
  scenario: Scenario,
  speedMultiplier: number,
): Promise<void> {
  console.log(
    `\n${C.bgBlue}${C.white}${C.bold} ▶ SCENARIO: ${scenario.name.toUpperCase()} ${C.reset} ${C.dim}${scenario.description}${C.reset}`,
  );
  console.log(
    `${C.dim}  Speed: ${speedMultiplier}× | Ticks: ${scenario.ticks.length} | Simulated time: ${(scenario.ticks.reduce((s, t) => s + t.durationMs, 0) / 1000).toFixed(0)}s${C.reset}\n`,
  );

  // Reset StepStore for a clean run
  StepStore.reset();

  // Wire up real pipeline components
  const provider = new MockSensorProvider();
  const fsm = new ActivityStateMachine({ debounceMs: 0 });
  const pipeline = new ActivityPipeline(provider, fsm, 3); // 3s classification window

  // Track state transitions
  const stateHistory: { time: number; state: string }[] = [];
  let previousState = fsm.getState();

  // Subscribe to FSM state changes
  fsm.onStateChange((newState: ActivityState) => {
    logFSMTransition(previousState, newState);
    stateHistory.push({ time: Date.now(), state: newState });
    previousState = newState;
  });

  // Subscribe to StepStore updates
  const unsubSteps = StepStore.subscribe((snapshot) => {
    // logStepStore(
    //   snapshot.rawSteps,
    //   snapshot.effectiveSteps,
    //   snapshot.isCharging,
    // );
  });

  // Intercept classification by overriding console.debug to capture pipeline logs
  const originalDebug = console.debug;
  console.debug = (...args: unknown[]) => {
    const msg = args.join(" ");
    if (msg.includes("[ActivityPipeline]")) {
      // Extract classification from pipeline log
      const match = msg.match(/Classification: (\w+)/);
      if (match) {
        // logClassification(match[1]);
      }
    }
  };

  // Start pipeline (but we won't rely on its internal setInterval for sensor emission)
  await pipeline.start();

  // Stop the provider's own interval — we control timing manually
  provider.stop();

  // Feed ticks through the pipeline
  for (let i = 0; i < scenario.ticks.length; i++) {
    const tick = scenario.ticks[i];

    // Set mock sensor state
    provider.currentStepsAccumulator = tick.steps;
    provider.currentSpeed = tick.speed;
    ChargingSessionStore.setChargingState(tick.isCharging);
    provider.motionVariance = tick.motionVariance;

    // Update live bridge state for the running app
    liveState = {
      active: true,
      steps: tick.steps,
      speed: tick.speed,
      isCharging: tick.isCharging,
      motionVariance: tick.motionVariance,
      scenario: scenario.name,
      tick: i,
      label: tick.label ?? "",
    };

    // Log sensor data
    // logSensor(i, tick.label ?? "", {
    //   steps: tick.steps,
    //   speed: tick.speed,
    //   isCharging: tick.isCharging,
    //   motionVariance: tick.motionVariance,
    // });

    // Emit data directly into the pipeline's subscriber chain
    provider.simulateTickNow();

    // Trigger classification manually (bypass setInterval wait)
    pipeline.processWindow();

    // Pace simulation
    const delayMs = tick.durationMs / speedMultiplier;
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  // Cleanup
  pipeline.stop();
  unsubSteps();
  console.debug = originalDebug;

  // Print summary
  const snap = StepStore.getSnapshot();
  console.log(`\n${C.bold}── Summary ──${C.reset}`);
  console.log(`  Final FSM State:    ${C.bold}${fsm.getState()}${C.reset}`);
  console.log(`  Raw Steps:          ${snap.rawSteps}`);
  console.log(
    `  Effective Steps:    ${C.bold}${snap.effectiveSteps}${C.reset}`,
  );
  console.log(`  State Transitions:  ${stateHistory.length}`);
  if (stateHistory.length > 0) {
    console.log(
      `  History:            ${stateHistory.map((h) => h.state).join(" → ")}`,
    );
  }
  console.log("");
}

// ─── Main ────────────────────────────────────────────────────────────────────

let shouldStop = false;
let totalCycles = 0;

function registerShutdownHandler(): void {
  process.on("SIGINT", () => {
    if (shouldStop) {
      // Second Ctrl+C → force exit
      stopBridgeServer();
      console.log(`\n${C.red}Force exit.${C.reset}`);
      process.exit(1);
    }
    shouldStop = true;
    console.log(
      `\n${C.yellow}${C.bold}⏹ Stopping after current cycle...${C.reset} ${C.dim}(Ctrl+C again to force)${C.reset}`,
    );
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help || !args.scenario) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  registerShutdownHandler();

  // Resolve scenarios to run
  let scenarios: Scenario[];
  if (args.scenario === "all") {
    const names = getScenarioNames();
    scenarios = names.map((n) => getScenario(n)!);
  } else {
    const scenario = getScenario(args.scenario);
    if (!scenario) {
      console.error(
        `${C.red}Error: Unknown scenario "${args.scenario}"${C.reset}`,
      );
      console.error(`Available: ${getScenarioNames().join(", ")}, all`);
      process.exit(1);
    }
    scenarios = [scenario];
  }

  const modeLabel = args.once ? "single run" : "looping (Ctrl+C to stop)";
  console.log(
    `${C.cyan}${C.bold}🐟 eFish Activity Simulator${C.reset} — ${args.speed}× speed, ${modeLabel}\n`,
  );

  // Start bridge server so the running app can receive simulation data
  await startBridgeServer();

  // Main loop
  do {
    totalCycles++;

    if (totalCycles > 1) {
      console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);
      console.log(`${C.bold}── Cycle ${totalCycles} ──${C.reset}\n`);
    }

    for (const scenario of scenarios) {
      if (shouldStop) break;
      await runScenario(scenario, args.speed);
    }
  } while (!args.once && !shouldStop);

  // Final summary
  stopBridgeServer();
  console.log(
    `${C.green}${C.bold}✓ Simulation complete.${C.reset} ${C.dim}Ran ${totalCycles} cycle(s).${C.reset}\n`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`${C.red}Fatal error:${C.reset}`, err);
  process.exit(1);
});
