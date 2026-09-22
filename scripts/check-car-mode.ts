/**
 * Asserts what car mode says about the planned trip: the header's summary
 * line, the reopen capsule's time and the arrival clock, which has to count
 * the charging stops the sheet below it already counts. No test runner is
 * installed, so this runs under tsx:
 *
 *   npx tsx scripts/check-car-mode.ts
 */
import assert from "node:assert/strict";

import {
  chargingMinutes,
  planTripSummary,
  tripDurationSeconds,
} from "../components/carModeTrip";
import { formatMinutes } from "../components/route-sheet/routeFormat";
import type {
  DriveSessionContext,
  RoutePlanData,
} from "../services/DriveSessionStore";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const METROGARDEN = "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul, Türkiye";

/** A plan as the gateway sends it: minutes and kilometres in the summary. */
const plan = (summary: {
  km?: number;
  minutes?: number;
  chargeMinutes?: number;
  stations?: number;
  destination?: string;
}): RoutePlanData =>
  ({
    routes: [],
    locations: [
      { type: "origin", name: "Kadıköy, İstanbul" },
      { type: "destination", name: summary.destination ?? METROGARDEN },
    ],
    summary: {
      total_charge_duration: summary.chargeMinutes ?? 0,
      total_station_count: summary.stations ?? 0,
      total_travel_duration: summary.minutes ?? 0,
      total_travel_length: summary.km ?? 0,
      travel_start_time: "",
      travel_finish_time: "",
    },
    waypoints: { origin: "", destination: "", stops: [] },
  }) as unknown as RoutePlanData;

const context = (
  routePlanData: RoutePlanData | undefined,
  driveSeconds?: number,
): DriveSessionContext =>
  ({
    sessionId: "check",
    startTime: 0,
    history: [],
    routePlanData,
    route:
      driveSeconds == null
        ? undefined
        : {
            origin: { latitude: 0, longitude: 0 },
            destination: { latitude: 0, longitude: 0 },
            stops: [],
            summary: { duration: driveSeconds, distance: 0 },
          },
  }) as unknown as DriveSessionContext;

check("the arrival clock counts the charging stops, not only the drive", () => {
  // The reported case: İstanbul–Ankara, 4 sa 5 dk of driving and 45 dk of
  // charging. The sheet said "şarj dahil 4 sa 50 dk" while VARIŞ was 45
  // minutes early.
  const istanbulAnkara = plan({ km: 450, minutes: 245, chargeMinutes: 45, stations: 1 });
  assert.equal(tripDurationSeconds(context(istanbulAnkara)), (245 + 45) * 60);
  // The capsule and the clock agree, which is the whole point.
  assert.equal(planTripSummary(istanbulAnkara)?.tripTime, "4 sa 50 dk");
});

check("the clock and the printed total are one number, whatever the route says", () => {
  // Both come from the plan, so a route whose own duration disagrees with the
  // plan's cannot pull them apart. Preferring the route here is what made
  // VARIŞ and the "şarj dahil" line below it differ by minutes: the live
  // İstanbul route reported 2422 s of roads against the plan's 32 dk.
  const live = plan({ km: 31.8, minutes: 32, chargeMinutes: 11, stations: 1 });
  for (const driveSeconds of [undefined, 2422, 60, 9 * 3600]) {
    const ctx = context(live, driveSeconds);
    const clock = tripDurationSeconds(ctx);
    assert.equal(clock, (32 + 11) * 60, `route ${driveSeconds}`);
    // What the clock counts, written the way the sheet writes it.
    assert.equal(formatMinutes((clock ?? 0) / 60), planTripSummary(live)?.tripTime);
  }
  assert.equal(planTripSummary(live)?.tripTime, "43 dk");
});

check("a route carried without a plan still knows how long it takes", () => {
  // The only case the route's own duration answers: no plan, so nothing else
  // on screen contradicts it.
  assert.equal(tripDurationSeconds(context(undefined, 2422)), 2422);
  // A plan whose duration is missing falls back the same way, charging added.
  const planless = plan({ km: 31.8, chargeMinutes: 11, stations: 1 });
  assert.equal(tripDurationSeconds(context(planless, 2422)), 2422 + 11 * 60);
});

check("a route without stops arrives when the drive ends", () => {
  const short = plan({ km: 34.6, minutes: 47 });
  assert.equal(tripDurationSeconds(context(short)), 47 * 60);
  // A charge duration reported without a stop is never spent.
  const stopless = plan({ km: 34.6, minutes: 47, chargeMinutes: 30, stations: 0 });
  assert.equal(chargingMinutes(stopless), 0);
  assert.equal(tripDurationSeconds(context(stopless)), 47 * 60);
});

check("no plan and no route means no arrival time", () => {
  assert.equal(tripDurationSeconds(context(undefined)), null);
  assert.equal(tripDurationSeconds(null), null);
  assert.equal(tripDurationSeconds(context(plan({ km: 12 }))), null);
  assert.equal(planTripSummary(null), null);
  assert.equal(planTripSummary(undefined), null);
});

check("the header's line is written the way the route sheet writes it", () => {
  // "34.6 km", "95 dk şarj" and the raw minutes are gone: the sheet right
  // below prints "34,6 km" and "1 sa 35 dk".
  const summary = planTripSummary(
    plan({ km: 34.6, minutes: 47, chargeMinutes: 95, stations: 2 }),
  );
  assert.equal(summary?.line, "34,6 km · 2 şarj durağı · 1 sa 35 dk şarj");
  assert.equal(summary?.destination, "Alemdağ Cd. No:940");
  assert.equal(summary?.detail, "Ümraniye, İstanbul");
  assert.equal(summary?.tripTime, "2 sa 22 dk");

  // A long trip drops the decimal, as formatKm does everywhere.
  assert.equal(
    planTripSummary(plan({ km: 450.4, minutes: 245, chargeMinutes: 45, stations: 1 }))?.line,
    "450 km · 1 şarj durağı · 45 dk şarj",
  );
});

check("a route with no charging stop says so", () => {
  const summary = planTripSummary(plan({ km: 12.4, minutes: 20 }));
  assert.equal(summary?.line, "12,4 km · şarj durağı yok");
  assert.equal(summary?.tripTime, "20 dk");
  // Nothing is claimed about a distance the plan does not report.
  assert.equal(planTripSummary(plan({ minutes: 20 }))?.line, "şarj durağı yok");
});

console.log(`\n${passed} checks passed`);
