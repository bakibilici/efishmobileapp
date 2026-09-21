/**
 * Asserts the helpers behind the map's station pins: a route's charging
 * stops drawn as the map's own stations, AKBA's stations_focus payload, and
 * the providers' names kept off the screen. No test runner is installed, so
 * this runs under tsx:
 *
 *   npx tsx scripts/check-station-markers.ts
 */
import assert from "node:assert/strict";

import { stationTierOf, type Station } from "../constants/stations";
import type { RoutePlanData, RoutePlanLocation } from "../services/DriveSessionStore";
import {
  cleanProviderText,
  mentionsProviderName,
  withoutProviderNames,
  withoutProviderNamesInPlan,
  withoutProviderNamesInStationDetails,
  withoutProviderNamesInTitle,
} from "../services/providerNames";
import {
  availableSockets,
  matchRouteStop,
  routeStopStation,
  routeStopTier,
  stationNameKey,
} from "../services/routeStopStations";
import {
  focusFitCoordinates,
  focusPinsToAdd,
  parseStationsFocus,
  StationFocusBus,
  stationFromFocus,
} from "../services/stationFocus";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const stop = (fields: Partial<RoutePlanLocation>): RoutePlanLocation => ({
  type: "station",
  name: "ZES Bolu Dağı Tesisleri",
  coordinates: { lat: "40.7400", lon: "31.6100" },
  travel_duration: 0,
  travel_length: 0,
  battery_status: { from: 20, to: 80 },
  ...fields,
});

const station = (fields: Partial<Station>): Station => ({
  id: "electrip-1",
  uuid: "cs-1",
  name: "ZES Bolu Dağı Tesisleri",
  latitude: 40.74,
  longitude: 31.61,
  type: "DC",
  powerKw: 180,
  status: "available",
  source: "electrip",
  socket_stats: { DC: { available: 3, total: 4 }, AC: { available: 1, total: 2 } },
  ...fields,
});

check("the map's tier rule: HPC, then DC, else AC, whatever the order", () => {
  assert.equal(stationTierOf(["AC", "HPC", "DC"]), "HPC");
  assert.equal(stationTierOf(["AC", "DC"]), "DC");
  assert.equal(stationTierOf(["AC"]), "AC");
  assert.equal(stationTierOf([]), "AC");
  assert.equal(stationTierOf(undefined), "AC");
});

check("a stop's tier follows the same rule from cp_type, cpType or the counts", () => {
  assert.equal(routeStopTier(stop({ cp_type: "DC" })), "DC");
  assert.equal(routeStopTier(stop({ cp_type: "AC,DC,HPC" })), "HPC");
  assert.equal(routeStopTier(stop({ cp_type: "ac / dc" })), "DC");
  assert.equal(routeStopTier({ ...stop({}), cpType: ["AC", "HPC"] }), "HPC");
  assert.equal(routeStopTier(stop({ ac_count: 2, dc_count: 4, hpc_count: 0 })), "DC");
  assert.equal(routeStopTier(stop({ hpc_count: 2 })), "HPC");
  assert.equal(routeStopTier(stop({ ac_count: 2 })), "AC");
  assert.equal(routeStopTier(stop({})), "AC");
});

check("a stop takes the loaded station by the map's id when it is nearby", () => {
  const byId = new Map([["electrip-77", station({ id: "electrip-77" })]]);
  const found = matchRouteStop(stop({ id: 77 }), [], byId);
  assert.equal(found?.id, "electrip-77");
  // The same id far away is another id space, not this station.
  const far = new Map([["electrip-77", station({ id: "electrip-77", latitude: 41.2, longitude: 29.0 })]]);
  assert.equal(matchRouteStop(stop({ id: 77 }), [], far), null);
});

check("a stop within 30 m is the station there; the nearest one wins", () => {
  const list = [
    station({ id: "a", name: "Başka", latitude: 40.74025, longitude: 31.61 }), // ~28 m
    station({ id: "b", name: "Başka", latitude: 40.74010, longitude: 31.61 }), // ~11 m
    station({ id: "c", name: "Başka", latitude: 40.7410, longitude: 31.61 }), // ~111 m
  ];
  assert.equal(matchRouteStop(stop({}), list)?.id, "b");
  assert.equal(matchRouteStop(stop({}), [list[2]]), null);
});

check("a stop matches by name only nearby, Turkish case and provider names aside", () => {
  const sameName = station({ id: "n", name: "ZES BOLU DAĞI TESİSLERİ", latitude: 40.745, longitude: 31.61 }); // ~560 m
  assert.equal(matchRouteStop(stop({}), [sameName])?.id, "n");
  const farAway = station({ id: "f", name: "ZES Bolu Dağı Tesisleri", latitude: 40.8, longitude: 31.61 });
  assert.equal(matchRouteStop(stop({}), [farAway]), null);
  assert.equal(stationNameKey("Electrip Kızılay AVM"), stationNameKey("kizilay avm"));
});

check("an unmatched stop becomes a station with the route's fields and no socket counts", () => {
  const built = routeStopStation(
    stop({ id: 5, name: "Electrip Gerede", cp_type: "HPC", max_power: 300, brand: "Eşarj" }),
    1,
  );
  assert.ok(built);
  assert.equal(built.id, "route-stop-5");
  assert.equal(built.type, "HPC");
  assert.equal(built.name, "Gerede");
  assert.equal(built.powerKw, 300);
  assert.equal(availableSockets(built), null);
  assert.equal(availableSockets(station({})), 4);
  assert.equal(availableSockets(station({ socket_stats: {} })), 0);
  assert.equal(routeStopStation(stop({ coordinates: { lat: "x", lon: "31" } }), 0), null);
});

check("provider names in every spelling are found", () => {
  for (const text of [
    "efish", "E-Fish", "eFish", "EFISH", "efiş", "e-fiş", "EFİŞ", "E-FİŞ",
    "Electrip", "ELECTRİP", "electrıp", "Elektrip", "ELEKTRİP", "electripglobal",
    "Electrip Maps © 2026", "ZES (Electrip)",
  ]) {
    assert.ok(mentionsProviderName(text), text);
  }
  for (const text of ["Cafe Fish", "Defish", "Elektrik", "Efes Pilsen", "ZES Kadıköy", "Eşarj Gerede", ""]) {
    assert.ok(!mentionsProviderName(text), text);
  }
});

check("provider names are cut out cleanly, other text is left as it was", () => {
  assert.equal(withoutProviderNames("Electrip Kadıköy"), "Kadıköy");
  assert.equal(withoutProviderNames("ZES - eFish Hub"), "ZES - Hub");
  assert.equal(withoutProviderNames("Kızılay AVM (Electrip)"), "Kızılay AVM");
  assert.equal(withoutProviderNames("Otopark, ELECTRİP Global, Ankara"), "Otopark, Ankara");
  assert.equal(withoutProviderNames("E-FİŞ"), "");
  const untouched = "ZES Bolu Dağı Tesisleri";
  assert.equal(withoutProviderNames(untouched), untouched);
  assert.equal(cleanProviderText("Electrip"), undefined);
  assert.equal(cleanProviderText("Electrip", "Şarj istasyonu"), "Şarj istasyonu");
  assert.equal(cleanProviderText(undefined), undefined);
});

check("a route plan loses the names in stops, brands, highlights and waypoints", () => {
  const plan = {
    routes: [],
    locations: [
      stop({ type: "origin", name: "Kadıköy" }),
      stop({
        name: "Electrip Bolu",
        brand: "Electrip",
        address: "D-100, eFish otoparkı",
        interest_highlight: {
          id: "h",
          interestKey: "coffee",
          interestLabel: "Kahve",
          icon: "cafe",
          shortLabel: "Kahve",
          title: "Kahve",
          message: "Electrip Bolu'da kahve molası",
          stationName: "Electrip Bolu",
        },
      }),
    ],
    summary: {} as RoutePlanData["summary"],
    waypoints: { origin: "Kadıköy", destination: "Kızılay", stops: ["Electrip Bolu"] },
    route_optimization_summary: "eFish önerisi: Bolu'da kahve.",
  } as RoutePlanData;
  const cleaned = withoutProviderNamesInPlan(plan);
  assert.equal(cleaned.locations[1].name, "Bolu");
  assert.equal(cleaned.locations[1].brand, undefined);
  assert.equal(cleaned.locations[1].address, "D-100, otoparkı");
  assert.equal(cleaned.locations[1].interest_highlight?.stationName, "Bolu");
  assert.equal(cleaned.locations[1].interest_highlight?.message, "Bolu'da kahve molası");
  assert.equal(cleaned.route_optimization_summary, "önerisi: Bolu'da kahve.");
  assert.deepEqual(cleaned.waypoints.stops, ["Bolu"]);
  assert.equal(cleaned.locations[0], plan.locations[0]);
  const clean = { ...plan, locations: [plan.locations[0]], waypoints: { origin: "A", destination: "B", stops: [] }, route_optimization_summary: "Kahve" };
  assert.equal(withoutProviderNamesInPlan(clean), clean);
});

const FOCUS = {
  type: "stations_focus",
  center: { latitude: 40.99, longitude: 29.03, label: "Kadıköy" },
  stations: [
    { id: "electrip-202600", latitude: 40.991, longitude: 29.031, name: "ZES Moda", type: "DC" },
    { id: "electrip-202601", latitude: 40.995, longitude: 29.04, name: "Electrip Fenerbahçe", type: "HPC" },
  ],
  radius_km: 3,
};

check("stations_focus: a well-formed payload is read, names cleaned", () => {
  const focus = parseStationsFocus(FOCUS);
  assert.ok(focus);
  assert.deepEqual(focus.center, { latitude: 40.99, longitude: 29.03, label: "Kadıköy" });
  assert.deepEqual(focus.stations.map((s) => s.id), ["electrip-202600", "electrip-202601"]);
  assert.equal(focus.stations[1].name, "Fenerbahçe");
  assert.equal(focus.radiusKm, 3);
});

check("stations_focus: malformed payloads and entries are ignored", () => {
  assert.equal(parseStationsFocus(null), null);
  assert.equal(parseStationsFocus("stations_focus"), null);
  assert.equal(parseStationsFocus({ ...FOCUS, type: "tool_end" }), null);
  assert.equal(parseStationsFocus({ ...FOCUS, center: null }), null);
  assert.equal(parseStationsFocus({ ...FOCUS, center: { latitude: "40", longitude: 29 } }), null);
  assert.equal(parseStationsFocus({ ...FOCUS, center: { latitude: 0, longitude: 0 } }), null);
  assert.equal(parseStationsFocus({ ...FOCUS, stations: {} }), null);
  assert.equal(parseStationsFocus({ ...FOCUS, stations: [] }), null);
  assert.equal(
    parseStationsFocus({
      ...FOCUS,
      stations: [{ id: "", latitude: 40, longitude: 29, type: "DC" }, { id: "x", latitude: 91, longitude: 29, type: "DC" }],
    }),
    null,
  );
  const partly = parseStationsFocus({
    ...FOCUS,
    stations: [
      ...FOCUS.stations,
      { id: "electrip-9", latitude: 40.99, longitude: 29.03, type: "SUPER" },
      { id: "electrip-202600", latitude: 40.991, longitude: 29.031, type: "DC" },
      "electrip-3",
    ],
    radius_km: -1,
  });
  assert.deepEqual(partly?.stations.map((s) => s.id), ["electrip-202600", "electrip-202601"]);
  assert.equal(partly?.radiusKm, null);
});

check("the camera fit covers the center and the stations, never less than ~800 m", () => {
  const focus = parseStationsFocus(FOCUS)!;
  const points = focusFitCoordinates(focus);
  const lats = points.map((p) => p.latitude);
  assert.ok(Math.max(...lats) - Math.min(...lats) >= 0.0072 - 1e-9);
  for (const p of [focus.center, ...focus.stations]) {
    assert.ok(points.some((q) => q.latitude === p.latitude && q.longitude === p.longitude));
  }
  const wide = parseStationsFocus({
    ...FOCUS,
    stations: [{ id: "electrip-1", latitude: 41.2, longitude: 29.3, name: "", type: "AC" }],
  })!;
  assert.equal(focusFitCoordinates(wide).length, 2);
});

check("the bus hands on the newest focus and its clear", () => {
  const seen: (number | null)[] = [];
  const unsubscribe = StationFocusBus.subscribe((focus) => seen.push(focus?.seq ?? null));
  StationFocusBus.publish(parseStationsFocus(FOCUS)!);
  StationFocusBus.publish(parseStationsFocus(FOCUS)!);
  StationFocusBus.clear();
  StationFocusBus.clear();
  unsubscribe();
  StationFocusBus.publish(parseStationsFocus(FOCUS)!);
  assert.equal(seen.length, 3);
  assert.ok(seen[0]! < seen[1]!);
  assert.equal(seen[2], null);
  assert.equal(StationFocusBus.get()?.stations.length, 2);
  StationFocusBus.clear();
});

check("a station detail payload loses the names in its name, address and charge points", () => {
  const details = {
    name: "Electrip Kadıköy",
    address: "Moda Cd. 12, eFish otoparkı",
    directions: "Girişte sağda",
    charge_points: [{ id: 1, name: "EFISH-01", sockets: [] }, { id: 2, name: "CP 2" }],
  };
  const cleaned = withoutProviderNamesInStationDetails(details);
  assert.equal(cleaned.name, "Kadıköy");
  assert.equal(cleaned.address, "Moda Cd. 12, otoparkı");
  assert.equal(cleaned.directions, "Girişte sağda");
  assert.equal(cleaned.charge_points[0].name, "01");
  assert.equal(cleaned.charge_points[1], details.charge_points[1]);
  assert.equal(withoutProviderNamesInStationDetails({ name: "Electrip" }).name, "Şarj istasyonu");
  const clean = { name: "ZES Moda", address: "Moda", charge_points: [{ name: "A" }] };
  assert.equal(withoutProviderNamesInStationDetails(clean), clean);
  assert.equal(withoutProviderNamesInStationDetails(null), null);
});

check("a stored session's place title loses the names; a title of only a name is none", () => {
  const title = { title: "Electrip Kadıköy", detail: "Kadıköy, İstanbul", address: "eFish Hub, Moda" };
  assert.deepEqual(withoutProviderNamesInTitle(title), {
    title: "Kadıköy",
    detail: "Kadıköy, İstanbul",
    address: "Hub, Moda",
  });
  const clean = { title: "Alemdağ Cd. No:940", detail: null, address: null };
  assert.equal(withoutProviderNamesInTitle(clean), clean);
  assert.equal(withoutProviderNamesInTitle({ title: "Electrip", detail: null, address: null }), null);
  assert.equal(withoutProviderNamesInTitle(null), null);
});

check("a found station the feed has not loaded is neither free nor busy", () => {
  const built = stationFromFocus(parseStationsFocus(FOCUS)!.stations[1]);
  assert.equal(built.status, "unknown");
  assert.equal(built.name, "Fenerbahçe");
  assert.equal(built.source, "electrip");
});

check("found stations the map draws are highlighted in place; only the rest get a pin", () => {
  const found = [station({ id: "a" }), station({ id: "b" }), station({ id: "c" })];
  assert.deepEqual(focusPinsToAdd(found, new Set(["b", "x"])).map((s) => s.id), ["a", "c"]);
  assert.deepEqual(focusPinsToAdd(found, new Set()).map((s) => s.id), ["a", "b", "c"]);
  assert.deepEqual(focusPinsToAdd(found, new Set(["a", "b", "c"])), []);
});

console.log(`\n${passed} checks passed`);
