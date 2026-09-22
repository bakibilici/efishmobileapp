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
  ANCHOR_GAP,
  BAND_BLUR,
  BAND_FADE,
  BAND_LAYERS,
  BAND_OVERSCAN,
  BAND_PAD,
  BAND_STEPS,
  bandBlurAt,
  bandHeight,
  bandSolidHeight,
  CAPSULE_H,
  CHIP_SLACK,
  CHIPS_MARGIN,
  CONTROLS_FALLBACK,
  GAP_GROUP,
  GAP_TIGHT,
  GROUP_FALLBACK,
  SIDE,
  statusCollapseOffset,
  STATUS_MARGIN,
} from "../components/map-header/headerMetrics";
import {
  buildStationIndex,
  formatKw,
  matchStations,
  sortByDistance,
  stationSearchKey,
  stationSubtitle,
} from "../components/map-header/stationSearch";
import { formatKm } from "../components/route-sheet/routeFormat";
import {
  TIER_BOLTS,
  TIER_COLORS,
  TIER_SELECTED_COLORS,
  TIERS,
} from "../components/map-header/tiers";
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

check("a listed station's power and distance are written in Turkish", () => {
  // The sheets print "120 kW", "7,4 kW" and "4,3 km": "4.3" reads as a
  // thousands separator in Turkish.
  assert.equal(formatKw(120), "120");
  assert.equal(formatKw(7.4), "7,4");
  assert.equal(formatKw(22.05), "22,1");
  // max_power is optional in the feed, so no row may read "NaN kW": no power,
  // no segment, exactly as formatKm answers a distance it was not given.
  assert.equal(formatKw(undefined), null);
  assert.equal(formatKw(null), null);
  assert.equal(formatKw(Number.NaN), null);
  assert.equal(formatKw(0), null);
  assert.equal(formatKm(4.32), "4,3 km");
  assert.equal(formatKm(0.5), "0,5 km");
  assert.equal(formatKm(0), null);
  assert.equal(formatKm(undefined), null);
});

check("the station sheets list nearest first, on a copy", () => {
  // The reported list went 4,3 / 4,9 / 6,4 / 5,5 / 5,0 km, with the nearest
  // station nowhere near the top.
  const feed = [FAR_ZORLU, ZORLU, EXTRA_ZORLU, NEAR_ZORLU, MAZORLU];
  const order = feed.map((s) => s.id);
  const sorted = sortByDistance(feed, HERE);
  assert.deepEqual(
    sorted.map((s) => s.id),
    ["mazorlu", "near-zorlu", "zorlu", "extra-zorlu", "far-zorlu"],
  );
  // The map's own list is left exactly as it was: re-ordering the map's
  // children is what destabilises its native child list.
  assert.deepEqual(feed.map((s) => s.id), order);
  assert.notEqual(sorted, feed);

  // Without a location the order is kept, still as a copy.
  const kept = sortByDistance(feed, null);
  assert.deepEqual(kept.map((s) => s.id), order);
  assert.notEqual(kept, feed);
  assert.deepEqual(sortByDistance([], HERE), []);
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
  // A walk the GPS cannot put a speed on is still a walk: the state machine
  // owns the state and waits out a real pause before it leaves WALKING.
  const crawling = activityStatus(ActivityState.WALKING, 0, COLORS, false);
  assert.equal(crawling.label, "Yürüyüş");
  assert.equal(crawling.speedText, "0 km/sa");
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

check("the header is one grid with a deliberate rhythm", () => {
  // Every row runs from SIDE to SIDE: nothing is centred, nothing stops short.
  assert.equal(SIDE, 16);
  // 8 to the chips it belongs with, 12 before the capsule, which is a
  // different subject. Both land on the 4 pt grid.
  assert.equal(GAP_TIGHT, 8);
  assert.equal(GAP_GROUP, 12);
  assert.equal(GAP_TIGHT % 4, 0);
  assert.equal(GAP_GROUP % 4, 0);
  // The chip's touch row carries the slack, so each margin is the gap less it.
  assert.equal(CHIP_SLACK, 4);
  assert.equal(CHIPS_MARGIN, 4);
  assert.equal(STATUS_MARGIN, 8);
  // The fallbacks are the same sum the rendered rows produce.
  assert.equal(CONTROLS_FALLBACK, 96);
  assert.equal(GROUP_FALLBACK, 148);
  assert.equal(GROUP_FALLBACK, CONTROLS_FALLBACK + STATUS_MARGIN + CAPSULE_H);
});

check("collapsing lands the capsule exactly on the anchor", () => {
  // Expanded, the capsule's top is the controls' height plus its margin below
  // the group's top; collapsed it must sit on the group's top itself.
  for (const controls of [CONTROLS_FALLBACK, 96, 104, 120]) {
    const capsuleTop = controls + STATUS_MARGIN;
    assert.equal(capsuleTop + statusCollapseOffset(controls), 0, `controls ${controls}`);
  }
  // It travels far enough to clear the controls, which leave the screen.
  assert.ok(statusCollapseOffset(CONTROLS_FALLBACK) <= -CONTROLS_FALLBACK);
});

check("the band stops just under the header, collapsed or not", () => {
  // An iPhone with a notch, the rows as they measure today.
  const safeTop = 59;
  const controls = CONTROLS_FALLBACK;
  const status = CAPSULE_H;

  // Expanded: the capsule's bottom, plus the air the band keeps under it.
  const capsuleBottom = safeTop + ANCHOR_GAP + controls + STATUS_MARGIN + status;
  assert.equal(bandSolidHeight(safeTop, controls, status), capsuleBottom + BAND_PAD);
  assert.equal(bandHeight(safeTop, controls, status), capsuleBottom + BAND_PAD + BAND_FADE);

  // Collapsed, the band travels exactly as far as the capsule, so it keeps
  // the same air under it — the capsule is then the header's only row.
  const collapsed = bandSolidHeight(safeTop, controls, status) + statusCollapseOffset(controls);
  assert.equal(collapsed, safeTop + ANCHOR_GAP + status + BAND_PAD);

  // It is the header's own block and no more: never past the capsule's
  // bottom by more than the air and the fade, on any screen.
  for (const top of [0, 20, 44, 59, 62]) {
    const solid = bandSolidHeight(top, controls, status);
    assert.ok(solid - (top + ANCHOR_GAP + controls + STATUS_MARGIN + status) === BAND_PAD);
    assert.ok(bandHeight(top, controls, status) < 320, `band on safeTop ${top}`);
  }

  // The capsule alone is what the band ends under. MapHeader measures the
  // capsule and not the container that also holds the minimised charge's
  // widget, because that card is opaque on its own: measuring it would send
  // the blur ~90 pt further down the live map, past the header's last row.
  const withWidget = bandSolidHeight(safeTop, controls, status + 90);
  assert.equal(withWidget - bandSolidHeight(safeTop, controls, status), 90);
  assert.ok(bandHeight(safeTop, controls, status + 90) > 320, "a measured widget overruns");

  // The band moves instead of resizing, so it carries enough height above
  // the screen to cover the status bar all the way up.
  for (const rows of [CONTROLS_FALLBACK, 96, 120, 140]) {
    assert.ok(
      BAND_OVERSCAN >= -statusCollapseOffset(rows),
      `overscan ${BAND_OVERSCAN} vs travel ${-statusCollapseOffset(rows)}`,
    );
  }
});

check("the falloff steps down evenly and ends on its faintest layer", () => {
  assert.equal(BAND_LAYERS.length, BAND_STEPS);

  // Every layer covers the solid part and reaches into the fade, the first
  // one all of it: nothing ends above the header, nothing hangs below it.
  assert.equal(BAND_LAYERS[0].reach, 1);
  for (const layer of BAND_LAYERS) {
    assert.ok(layer.reach > 0 && layer.reach <= 1, `reach ${layer.reach}`);
    assert.ok(layer.intensity > 0 && layer.intensity < 100, `intensity ${layer.intensity}`);
  }
  // Deeper is fainter, so the edge that shows at the bottom is the weakest.
  for (let i = 1; i < BAND_LAYERS.length; i += 1) {
    assert.ok(BAND_LAYERS[i].reach < BAND_LAYERS[i - 1].reach);
    assert.ok(BAND_LAYERS[i].intensity > BAND_LAYERS[i - 1].intensity);
  }

  // Where they all overlap they read as BAND_BLUR, and each layer that ends
  // takes the same step out of it (±1, the rounding to whole intensities):
  // that is what keeps the fade from showing a line where a layer stops.
  const step = BAND_BLUR / BAND_STEPS;
  assert.ok(Math.abs(bandBlurAt(BAND_LAYERS) - BAND_BLUR) <= 1);
  for (let left = 0; left <= BAND_LAYERS.length; left += 1) {
    assert.ok(
      Math.abs(bandBlurAt(BAND_LAYERS.slice(0, left)) - left * step) <= 1,
      `${left} layers read as ${bandBlurAt(BAND_LAYERS.slice(0, left)).toFixed(1)}`,
    );
  }
  // The last edge of all is the one step the wash cannot hide: keep it small.
  assert.ok(BAND_LAYERS[0].intensity <= 10, `bottom layer ${BAND_LAYERS[0].intensity}`);
});

/** WCAG relative luminance of a #rrggbb colour. */
const luminance = (hex: string) => {
  const channel = (i: number) => {
    const value = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
};
/** Contrast of white on that colour. */
const contrastOnWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

check("a selected chip's fill carries white text at AA", () => {
  // The chip's label and bolts are white on TIER_SELECTED_COLORS, and the
  // chip's text is 15 pt semibold: normal text, so the bar is 4,5:1.
  for (const tier of TIERS) {
    const ratio = contrastOnWhite(TIER_SELECTED_COLORS[tier]);
    assert.ok(ratio >= 4.5, `${tier} ${TIER_SELECTED_COLORS[tier]} is ${ratio.toFixed(2)}:1`);
  }
  // The pins' own colours are the reason the selected fill is a separate set.
  assert.ok(contrastOnWhite(TIER_COLORS.DC) < 4.5);
  assert.ok(contrastOnWhite(TIER_COLORS.AC) < 4.5);
  // HPC is dark enough already: the two sets agree there.
  assert.equal(TIER_SELECTED_COLORS.HPC, TIER_COLORS.HPC);
});

console.log(`\n${passed} checks passed`);
