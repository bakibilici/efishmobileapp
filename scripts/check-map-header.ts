/**
 * Asserts the map header's pure helpers: the station search (Turkish
 * folding, word-start ranking, nearest first, at most three), the station
 * row's subtitle and the status capsule's text and glyph colour for every
 * activity. No test runner is installed, so this runs under tsx:
 *
 *   npx tsx scripts/check-map-header.ts
 */
import assert from "node:assert/strict";

import { activityStatus } from "../components/map-header/activityStatus";
import {
  buildStationIndex,
  matchStations,
  stationSearchKey,
  stationSubtitle,
} from "../components/map-header/stationSearch";
import { TIER_BOLTS, TIER_COLORS, TIERS } from "../components/map-header/tiers";
import type { Station } from "../constants/stations";
import { ActivityState } from "../services/ActivityStateMachine";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const station = (
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  extra: Partial<Station> = {},
): Station => ({
  id,
  uuid: `uuid-${id}`,
  name,
  latitude,
  longitude,
  type: "HPC",
  powerKw: 120,
  status: "available",
  ...extra,
});

// Kızılay, Ankara, and points north of it (0.01° of latitude is about 1,1 km).
const HERE = { latitude: 39.92, longitude: 32.85 };
const at = (km: number) => HERE.latitude + km / 111.2;

const OTOPARK = station("otopark", "İSTANBUL Otopark", at(5), HERE.longitude);
const ZORLU = station("zorlu", "ZES Zorlu Center", at(3), HERE.longitude);
const MAZORLU = station("mazorlu", "Mazorlu Petrol", at(1), HERE.longitude);
const FAR_ZORLU = station("far-zorlu", "Zorlu AVM", at(40), HERE.longitude);
const NEAR_ZORLU = station("near-zorlu", "Zorlu Otopark", at(2), HERE.longitude);
const EXTRA_ZORLU = station("extra-zorlu", "Zorlu Plaza", at(10), HERE.longitude);

check("ist, İST and Ist find İSTANBUL Otopark", () => {
  const index = buildStationIndex([OTOPARK, ZORLU]);
  for (const query of ["ist", "İST", "Ist", "istanbul", "İstanbul"]) {
    assert.deepEqual(
      matchStations(index, query, null).map((s) => s.id),
      ["otopark"],
      query,
    );
  }
  assert.equal(stationSearchKey("İSTANBUL"), "istanbul");
  assert.equal(stationSearchKey("Istanbul"), "istanbul");
});

check("a word start ranks before a match inside a word", () => {
  const index = buildStationIndex([MAZORLU, ZORLU]);
  // Mazorlu is nearer but only contains "zorlu"; ZES Zorlu Center has a word starting with it.
  assert.deepEqual(
    matchStations(index, "zorlu", HERE).map((s) => s.id),
    ["zorlu", "mazorlu"],
  );
});

check("at most three, nearest first within a rank, each station once", () => {
  const index = buildStationIndex([FAR_ZORLU, ZORLU, EXTRA_ZORLU, NEAR_ZORLU, ZORLU, MAZORLU]);
  assert.equal(index.length, 5);
  assert.deepEqual(
    matchStations(index, "zorlu", HERE).map((s) => s.id),
    ["near-zorlu", "zorlu", "extra-zorlu"],
  );
  assert.deepEqual(
    matchStations(index, "zorlu", HERE, 10).map((s) => s.id),
    ["near-zorlu", "zorlu", "extra-zorlu", "far-zorlu", "mazorlu"],
  );
  // Without a position the index's order decides within a rank.
  assert.deepEqual(
    matchStations(index, "zorlu", null).map((s) => s.id),
    ["far-zorlu", "zorlu", "extra-zorlu"],
  );
});

check("a query shorter than two characters finds nothing", () => {
  const index = buildStationIndex([ZORLU, OTOPARK]);
  assert.deepEqual(matchStations(index, "z", HERE), []);
  assert.deepEqual(matchStations(index, "  ", HERE), []);
  assert.deepEqual(matchStations(index, "", HERE), []);
});

check("the subtitle: tier, power and distance", () => {
  const nearby = station("s", "Kızılay", HERE.latitude + 2.4 / 111.2, HERE.longitude);
  assert.equal(stationSubtitle(nearby, HERE), "HPC · 120 kW · 2,4 km");
  assert.equal(stationSubtitle({ ...nearby, powerKw: 0 }, HERE), "HPC · 2,4 km");
  assert.equal(stationSubtitle(nearby, null), "HPC · 120 kW");
  assert.equal(stationSubtitle({ ...nearby, type: "AC", powerKw: 7.4 }, null), "AC · 7,4 kW");
});

const COLORS = { primary: "#0093C9", tertiary: "#7CFBC7", neutral: "#587A99" };

check("the status capsule for every activity", () => {
  const car = activityStatus(ActivityState.CAR, 54, COLORS, false);
  assert.deepEqual(car, {
    label: "Sürüş",
    glyphColor: "#FF9F0A",
    iconState: ActivityState.CAR,
    speedText: "54 km/sa",
    showSteps: false,
    doubleSteps: false,
  });
  assert.equal(activityStatus(ActivityState.CAR, -1, COLORS, false).speedText, "? km/sa");

  const fast = activityStatus(ActivityState.RUNNING, 9, COLORS, false);
  assert.equal(fast.label, "Koşu (hızlı)");
  assert.equal(fast.speedText, "9 km/sa");
  assert.equal(fast.glyphColor, COLORS.primary);
  assert.equal(fast.showSteps, true);
  const slow = activityStatus(ActivityState.RUNNING, 8, COLORS, false);
  assert.equal(slow.label, "Koşu (yavaş)");
  assert.equal(activityStatus(ActivityState.RUNNING, -1, COLORS, false).speedText, null);

  const walking = activityStatus(ActivityState.WALKING, 4, COLORS, false);
  assert.equal(walking.label, "Yürüyüş");
  assert.equal(walking.speedText, "4 km/sa");
  assert.equal(walking.glyphColor, "#00875A");
  assert.equal(activityStatus(ActivityState.WALKING, 4, COLORS, true).glyphColor, COLORS.tertiary);
  const paused = activityStatus(ActivityState.WALKING, 0, COLORS, false);
  assert.equal(paused.label, "Beklemede");
  assert.equal(paused.speedText, "0 km/sa");
  const walkingUnknown = activityStatus(ActivityState.WALKING, -1, COLORS, false);
  assert.equal(walkingUnknown.label, "Yürüyüş");
  assert.equal(walkingUnknown.speedText, null);

  const charging = activityStatus(ActivityState.CHARGING, 0, COLORS, false);
  assert.deepEqual(charging, {
    label: "Şarjda",
    glyphColor: "#B38600",
    iconState: ActivityState.CHARGING,
    speedText: null,
    showSteps: true,
    doubleSteps: true,
  });
  assert.equal(activityStatus(ActivityState.CHARGING, 0, COLORS, true).glyphColor, "#FFD60A");
  const pacing = activityStatus(ActivityState.CHARGING, 3, COLORS, false);
  assert.equal(pacing.speedText, "3 km/sa");
  assert.equal(pacing.doubleSteps, true);

  for (const state of [ActivityState.IDLE, ActivityState.UNKNOWN]) {
    assert.deepEqual(activityStatus(state, 12, COLORS, false), {
      label: "Beklemede",
      glyphColor: COLORS.neutral,
      iconState: ActivityState.IDLE,
      speedText: null,
      showSteps: true,
      doubleSteps: false,
    });
  }
});

check("the tiers match the pins", () => {
  assert.deepEqual([...TIERS], ["HPC", "DC", "AC"]);
  assert.deepEqual(TIER_COLORS, { HPC: "#7C4DFF", DC: "#FF8A1F", AC: "#4BACE4" });
  assert.deepEqual(TIER_BOLTS, { HPC: 3, DC: 2, AC: 1 });
});

console.log(`\n${passed} checks passed`);
