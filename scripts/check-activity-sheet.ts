/**
 * Asserts the activity sheet's pure model (components/activity-sheet/
 * activitySheetModel.ts): how long a state has held, the step split, today's
 * drives, the words for a permission — and that the numbers in the Turkish
 * explanation are still the ones the detection actually uses, read out of
 * the source files themselves. No test runner is installed, so this runs
 * under tsx:
 *
 *   npx tsx scripts/check-activity-sheet.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  clockText,
  DETECTION_EXPLANATION,
  DETECTION_NUMBERS,
  driveDistanceKm,
  driveSummary,
  EM_DASH,
  formatCount,
  formatHoldDuration,
  formatSpeed,
  opensSettings,
  permissionFooter,
  permissionKind,
  permissionLabel,
  startOfDay,
  stepBreakdown,
  todayDrives,
} from "../components/activity-sheet/activitySheetModel";
import type { StoredDriveSessionRecord } from "../services/driveSessionHistory";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const ROOT = join(__dirname, "..");
const source = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** The number after `key:` in a source file ("walkingStepFreqThreshold: 1.2,"). */
const numberAfter = (text: string, key: string): number => {
  const match = new RegExp(`${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
  assert.ok(match, `${key} not found in source`);
  return Number(match[1]);
};

/** A typed default in a constructor ("private checkWindowSeconds: number = 5,"). */
const numberDefaultOf = (text: string, key: string): number => {
  const match = new RegExp(`${key}\\s*:\\s*number\\s*=\\s*(-?\\d+(?:\\.\\d+)?)`).exec(text);
  assert.ok(match, `${key} default not found in source`);
  return Number(match[1]);
};

// ─── How long a state has held ───────────────────────────────────────────────

check("a state the app never saw begin has no duration", () => {
  assert.equal(formatHoldDuration(null), null);
  // The screen prints its own sentence for null; it never prints "0 dk".
  assert.equal(formatHoldDuration(0), "1 dakikadan az");
  assert.equal(formatHoldDuration(59_000), "1 dakikadan az");
});

check("held minutes read as the route sheet writes durations", () => {
  assert.equal(formatHoldDuration(60_000), "1 dk");
  assert.equal(formatHoldDuration(4 * 60_000), "4 dk");
  assert.equal(formatHoldDuration(72 * 60_000), "1 sa 12 dk");
  assert.equal(formatHoldDuration(120 * 60_000), "2 sa");
});

check("a speed that was never measured is not printed", () => {
  assert.equal(formatSpeed(-1), null);
  assert.equal(formatSpeed(Number.NaN), null);
  assert.equal(formatSpeed(0), "0 km/sa");
  assert.equal(formatSpeed(54), "54 km/sa");
});

// ─── Today's steps ───────────────────────────────────────────────────────────

check("the charging bonus is the difference, never a second counter", () => {
  const walked = stepBreakdown({ rawSteps: 790, effectiveSteps: 790, isCharging: false });
  assert.deepEqual(walked, {
    total: 790,
    raw: 790,
    bonus: 0,
    isCharging: false,
    isEmpty: false,
  });

  // 300 of the 500 steps were taken on the charger: 500 + 300 effective.
  const charged = stepBreakdown({ rawSteps: 500, effectiveSteps: 800, isCharging: true });
  assert.equal(charged.bonus, 300);
  assert.equal(charged.total - charged.raw, charged.bonus);
  assert.equal(charged.isCharging, true);
});

check("a day with no steps is empty, not hidden", () => {
  const none = stepBreakdown({ rawSteps: 0, effectiveSteps: 0, isCharging: false });
  assert.equal(none.isEmpty, true);
  assert.equal(none.total, 0);
  assert.equal(none.bonus, 0);
});

check("a count reads as the capsule prints it, whatever the runtime's locale", () => {
  // The capsule's RollingNumber shows "1.430"; the sheet must not show "1430"
  // one tap later. Grouped by hand, so no Intl data can change the answer.
  assert.equal(formatCount(1430), "1.430");
  assert.equal(formatCount(790), "790");
  assert.equal(formatCount(0), "0");
  assert.equal(formatCount(1_234_567), "1.234.567");
  assert.equal(formatCount(12_345), "12.345");
  assert.equal(formatCount(Number.NaN), EM_DASH);
});

check("an effective count behind the raw one never shows a negative bonus", () => {
  // Hydration order can leave the two out of step for a frame.
  const odd = stepBreakdown({ rawSteps: 120, effectiveSteps: 0, isCharging: false });
  assert.equal(odd.bonus, 0);
  assert.equal(odd.total, 120);
});

// ─── Today's drives ──────────────────────────────────────────────────────────

const NOW = new Date(2026, 8, 22, 18, 0);
const at = (hours: number, minutes = 0, daysAgo = 0) =>
  new Date(2026, 8, 22 - daysAgo, hours, minutes).getTime();

let seq = 0;
const record = (
  options: {
    startedAt?: number;
    km?: number | null;
    planKm?: number | null;
    destination?: string;
  } = {},
): StoredDriveSessionRecord => {
  seq += 1;
  const startedAt = options.startedAt ?? at(14, 20);
  const destination = options.destination ?? "Sur Yapı Metrogarden AVM";
  return {
    id: seq,
    userId: 1,
    sessionId: `session-${seq}`,
    title: `Konumunuz → ${destination}`,
    originName: "Konumunuz",
    destinationName: destination,
    state: "CAR_SESSION_ACTIVE",
    startedAt,
    updatedAt: startedAt,
    endedAt: null,
    durationSeconds: null,
    distanceKm: options.km ?? null,
    stationCount: 1,
    routeContext:
      options.planKm == null
        ? {}
        : { routePlanData: { summary: { total_travel_length: options.planKm } } },
  };
};

check("today is the phone's own calendar day", () => {
  assert.equal(startOfDay(NOW), new Date(2026, 8, 22, 0, 0, 0, 0).getTime());
  const rows = [
    record({ startedAt: at(0, 5) }),
    record({ startedAt: at(23, 50, 1) }),
    record({ startedAt: at(9, 30) }),
  ];
  assert.deepEqual(
    todayDrives(rows, NOW).map((row) => row.startedAt),
    [at(9, 30), at(0, 5)],
  );
});

check("distance prefers the plan's own total, as Oturumlar does", () => {
  assert.equal(driveDistanceKm(record({ km: 12, planKm: 34.6 })), 34.6);
  assert.equal(driveDistanceKm(record({ km: 12 })), 12);
  assert.equal(driveDistanceKm(record({})), null);
  assert.equal(driveDistanceKm(record({ km: 0 })), null);
});

check("a day with no drive says so instead of showing zeros", () => {
  const summary = driveSummary([record({ startedAt: at(14, 20, 3) })], NOW);
  assert.deepEqual(summary, { count: 0, distanceText: EM_DASH, last: null });
});

check("the day's drives are counted, added up and named", () => {
  const summary = driveSummary(
    [
      record({ startedAt: at(9, 10), planKm: 12.2 }),
      record({ startedAt: at(14, 20), km: 22.4, destination: "Ayasofya" }),
      record({ startedAt: at(16, 0, 2), km: 500 }),
    ],
    NOW,
  );
  assert.equal(summary.count, 2);
  assert.equal(summary.distanceText, "34,6 km");
  assert.equal(summary.last?.title, "Ayasofya");
  assert.equal(summary.last?.timeText, "14:20");
});

check("a distance no record kept is a dash, not a zero", () => {
  const summary = driveSummary([record({ startedAt: at(9, 10) })], NOW);
  assert.equal(summary.count, 1);
  assert.equal(summary.distanceText, EM_DASH);
  assert.equal(summary.last?.timeText, "09:10");
});

check("the clock is padded by hand, whatever the runtime's locale data", () => {
  assert.equal(clockText(at(9, 5)), "09:05");
  assert.equal(clockText(at(0, 0)), "00:00");
  assert.equal(clockText(at(23, 59)), "23:59");
});

// ─── Permissions ─────────────────────────────────────────────────────────────

check("expo's permission answers become the three Turkish words", () => {
  assert.equal(permissionLabel(permissionKind({ granted: true, status: "granted" })), "İzin verildi");
  assert.equal(permissionLabel(permissionKind({ granted: false, status: "denied" })), "İzin verilmedi");
  assert.equal(
    permissionLabel(permissionKind({ granted: false, status: "undetermined" })),
    "Sorulmadı",
  );
  // The simulator has no pedometer: the call throws and the row says so.
  assert.equal(permissionLabel(permissionKind(null)), "Bilinmiyor");
  assert.equal(permissionLabel(permissionKind({ status: "restricted" })), "Bilinmiyor");
});

check("only a permission iOS actually lists offers a trip to Ayarlar", () => {
  // iOS shows no Hareket ve Fitness switch for an app that has never asked,
  // so "Sorulmadı" must not send the driver to a page with nothing on it.
  assert.equal(opensSettings("undetermined"), false);
  assert.equal(opensSettings("granted"), false);
  assert.equal(opensSettings("denied"), true);
  assert.equal(opensSettings("unknown"), true);
});

check("a permission that was never asked is explained instead", () => {
  const asked = permissionFooter("granted", "denied");
  assert.ok(!asked.includes("ilk ihtiyaç duyduğunda"));
  const unasked = permissionFooter("undetermined", "granted");
  assert.ok(unasked.startsWith(asked), "the footer only gains a sentence");
  assert.ok(unasked.includes("ilk ihtiyaç duyduğunda"));
  // Whatever the row says, the footer stays formal and emoji-free.
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(unasked));
});

// ─── The explanation, against the live detection ─────────────────────────────

check("the explanation's thresholds are the classifier's own", () => {
  const classifier = source("services/sensors/ActivityClassifier.ts");
  assert.equal(
    numberAfter(classifier, "walkingStepFreqThreshold"),
    DETECTION_NUMBERS.walkingStepsPerSecond,
  );
  assert.equal(
    numberAfter(classifier, "runningStepFreqThreshold"),
    DETECTION_NUMBERS.runningStepsPerSecond,
  );
  assert.equal(numberAfter(classifier, "runningSpeedThreshold"), DETECTION_NUMBERS.runningSpeedMs);
  assert.equal(numberAfter(classifier, "carSpeedThreshold"), DETECTION_NUMBERS.carSpeedMs);
});

check("the explanation's waits are the state machine's own", () => {
  assert.equal(
    numberAfter(source("services/ActivityStateMachine.ts"), "debounceMs"),
    DETECTION_NUMBERS.debounceMs,
  );
  assert.equal(
    numberAfter(source("services/ActivityService.ts"), "carToIdleDelayMs"),
    DETECTION_NUMBERS.carToIdleDelayMs,
  );
  assert.equal(
    numberDefaultOf(source("services/sensors/ActivityPipeline.ts"), "checkWindowSeconds"),
    DETECTION_NUMBERS.windowSeconds,
  );
});

check("the Turkish text states exactly those numbers", () => {
  // Lowered, because a threshold can fall at the start of a sentence.
  const text = DETECTION_EXPLANATION.toLowerCase();
  const comma = (value: number) => String(value).replace(".", ",");
  assert.ok(text.includes(`${comma(DETECTION_NUMBERS.walkingStepsPerSecond)} adım`), "walking");
  assert.ok(text.includes(`${comma(DETECTION_NUMBERS.runningStepsPerSecond)} adım`), "running");
  // m/s as the screen says it: km/h, to the whole number.
  assert.equal(Math.round(DETECTION_NUMBERS.runningSpeedMs * 3.6), 6);
  assert.equal(Math.round(DETECTION_NUMBERS.carSpeedMs * 3.6), 15);
  assert.ok(text.includes("saatte 6 km"), "6 km/sa");
  assert.ok(text.includes("saatte 15 km"), "15 km/sa");
  assert.ok(text.includes("beş saniyede bir"), "the window");
  assert.equal(DETECTION_NUMBERS.debounceMs / 1000, 5);
  assert.ok(text.includes("beş saniye boyunca"), "the debounce");
  assert.equal(DETECTION_NUMBERS.carToIdleDelayMs / 1000, 45);
  assert.ok(text.includes("kırk beş saniye"), "the car-to-idle wait");
  assert.ok(text.includes("şarj"), "charging priority");
});

check("the rule-based classifier the explanation describes is the live one", () => {
  // classifyActivity short-circuits every threshold above when the learned
  // model is on (services/sensors/ActivityModel.ts: enabled AND a tree), and
  // then none of DETECTION_EXPLANATION's numbers decide anything. Turning the
  // model on without rewriting that paragraph would have the screen explain a
  // mechanism the app is not using, to the one reader checking it.
  const model = JSON.parse(source("constants/activityModel.json")) as {
    enabled?: boolean;
    tree?: unknown;
  };
  assert.ok(
    !(model.enabled && model.tree),
    "constants/activityModel.json is live: DETECTION_EXPLANATION must describe the learned model instead",
  );
});

check("the copy is formal Turkish and carries no emoji", () => {
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(DETECTION_EXPLANATION));
  assert.ok(DETECTION_EXPLANATION.includes("olduğunuz"), "formal siz");
});

console.log(`\n${passed} checks passed.`);
