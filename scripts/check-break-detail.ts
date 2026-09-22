/**
 * Asserts the helpers behind a break suggestion's detail page in the route
 * sheet: the walk, how it fits the charge, the stop it belongs to, the maps
 * search and the alternatives' categories. No test runner is installed, so
 * this runs under tsx:
 *
 *   npx tsx scripts/check-break-detail.ts
 */
import assert from "node:assert/strict";

import {
  alternativeKindOf,
  alternativeName,
  alternativeTitle,
  chargeFitLine,
  listedAlternatives,
  mapsSearchUrl,
  mapsWebUrl,
  placeName,
  stationForHighlight,
  stopCoordinates,
  WALK_METERS_PER_MINUTE,
  walkLine,
  walkMinutes,
} from "../components/route-sheet/breakDetail";
import type {
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../services/DriveSessionStore";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const highlight = (overrides: Partial<RoutePlanInterestHighlight> = {}) =>
  ({
    id: "coffee-1",
    interestKey: "coffee",
    interestLabel: "Kahve",
    icon: "cafe-outline",
    shortLabel: "Kahve",
    title: "Kahve molası",
    message: "5 dk yürüme, 31 dk şarja sığıyor.",
    stationName: "ZES Bolu Dağı Tesisleri",
    poiName: "BLAK COFFEE & ROASTERY Bolu Dağı Tesisleri Şubesi",
    distanceM: 347,
    poiSource: "places",
    ...overrides,
  }) as RoutePlanInterestHighlight;

const station = (overrides: Partial<RoutePlanLocation> = {}) =>
  ({
    type: "station",
    name: "ZES Bolu Dağı Tesisleri",
    coordinates: { lat: "40.7400", lon: "31.6100" },
    travel_duration: 95,
    travel_length: 142,
    battery_status: { from: 24, to: 80 },
    charge_duration: 31,
    ...overrides,
  }) as RoutePlanLocation;

check("the walk is the ranker's 75 m a minute, at least one minute, and needs a distance", () => {
  assert.equal(WALK_METERS_PER_MINUTE, 75);
  assert.equal(walkMinutes(347), 5);
  assert.equal(walkMinutes(20), 1);
  assert.equal(walkMinutes(0), null);
  assert.equal(walkMinutes(undefined), null);
  assert.equal(walkLine(347), "350 m · yaklaşık 5 dk yürüme");
  assert.equal(walkLine(1240), "1,2 km · yaklaşık 17 dk yürüme");
  assert.equal(walkLine(0), null);
});

check("the fit line counts the walk there and back against the charge", () => {
  assert.equal(
    chargeFitLine(347, 31),
    "Gidiş-dönüş yaklaşık 10 dk yürüme; 31 dk şarjın içinde yaklaşık 21 dk kalır.",
  );
  assert.equal(
    chargeFitLine(1400, 20),
    "Gidiş-dönüş yaklaşık 38 dk yürüme; 20 dk şarjdan uzun sürer.",
  );
  assert.equal(chargeFitLine(undefined, 14), "Şarj 14 dk sürüyor; mola bu süreye göre önerildi.");
  assert.equal(chargeFitLine(347, undefined), null);
  assert.equal(chargeFitLine(347, 0), null);
});

check("a suggestion's stop: the one it was opened from, its carrier, its id, its place, then its name", () => {
  const own = highlight();
  const carrier = station({ name: "Başka ad", interest_highlight: own });
  const named = station();
  assert.equal(stationForHighlight(own, [named, carrier]), carrier);
  assert.equal(stationForHighlight(highlight(), [station({ name: "Eşarj Gerede" }), named]), named);
  const byId = station({ name: "Başka", interest_highlight: highlight() });
  assert.equal(stationForHighlight(highlight({ stationName: "" }), [byId]), byId);
  assert.equal(stationForHighlight(highlight({ stationName: "Yok", id: "" }), [named]), null);

  // Two stops of one chain share a name: the id tells them apart, before the name.
  const first = station({ interest_highlight: highlight({ id: "coffee-1" }) });
  const second = station({ interest_highlight: highlight({ id: "coffee-2" }) });
  assert.equal(stationForHighlight(highlight({ id: "coffee-2" }), [first, second]), second);

  // The stop row it was opened from wins, even over a stop carrying a copy.
  const shared = highlight({ id: "same" });
  const a = station({ interest_highlight: highlight({ id: "same" }) });
  const b = station({ interest_highlight: shared });
  assert.equal(stationForHighlight(shared, [a, b], { station: a, stationIndex: 0 }), a);

  // A plan saved again (new objects, a shared id): the place it was opened at.
  const savedA = station({ interest_highlight: highlight({ id: "same" }) });
  const savedB = station({ interest_highlight: highlight({ id: "same" }) });
  assert.equal(
    stationForHighlight(highlight({ id: "same" }), [savedA, savedB], { station: b, stationIndex: 1 }),
    savedB,
  );
  // A place past the end falls back to the name.
  assert.equal(
    stationForHighlight(highlight({ id: "same" }), [savedA, savedB], { stationIndex: 5 }),
    savedA,
  );
});

check("a generic suggestion has no place, so no maps search", () => {
  assert.equal(placeName(highlight({ poiName: "", poiSource: "none" })), null);
  assert.equal(placeName(highlight({ poiSource: "none" })), null);
  assert.equal(placeName(highlight()), "BLAK COFFEE & ROASTERY Bolu Dağı Tesisleri Şubesi");
});

check("the maps search names the place near the stop, per platform", () => {
  const near = stopCoordinates(station());
  assert.deepEqual(near, { lat: 40.74, lng: 31.61 });
  assert.equal(
    mapsSearchUrl("ios", "Keddy's Cafe & Co", near),
    "maps://?q=Keddy's%20Cafe%20%26%20Co&sll=40.74,31.61",
  );
  assert.equal(
    mapsSearchUrl("android", "Keddy's Cafe", near),
    "geo:40.74,31.61?q=Keddy's%20Cafe",
  );
  assert.equal(mapsSearchUrl("ios", "Kafe", null), "maps://?q=Kafe");
  assert.equal(mapsSearchUrl("android", "Kafe", null), "geo:0,0?q=Kafe");
  assert.equal(
    mapsWebUrl("ios", "Kafe", near),
    "https://maps.apple.com/?q=Kafe&sll=40.74,31.61",
  );
  assert.equal(
    mapsWebUrl("android", "Kafe", near),
    "https://www.google.com/maps/search/?api=1&query=Kafe",
  );
});

check("a stop without usable coordinates gives none", () => {
  assert.equal(stopCoordinates(station({ coordinates: { lat: "", lon: "31" } })), null);
  assert.equal(stopCoordinates(station({ coordinates: { lat: "0", lon: "0" } })), null);
  assert.equal(stopCoordinates(station({ coordinates: { lat: "95", lon: "31" } })), null);
  assert.equal(stopCoordinates(null), null);
});

check("an alternative's category comes from its category, else its title", () => {
  assert.equal(alternativeKindOf({ name: "Köroğlu", category: "food" }), "food");
  assert.equal(alternativeKindOf({ name: "Teras", title: "Manzara molası" }), "viewpoint");
  assert.equal(alternativeKindOf({ name: "Yol", title: "Kısa yürüyüş molası" }), "park");
  assert.equal(alternativeKindOf({ name: "Bilinmez" }), null);
  assert.equal(alternativeTitle({ name: "Köroğlu", category: "food" }), "Yemek molası");
  assert.equal(alternativeTitle({ name: "Teras", title: " Manzara molası " }), "Manzara molası");
  assert.equal(alternativeTitle({ name: "Bilinmez" }), null);
});

check("an alternative of a ruled-out kind is left out, by its category or its title", () => {
  const alternatives = [
    { name: "Köroğlu", category: "food" },
    { name: "Teras", title: "Kısa manzara molası" },
    { name: "Bilinmez" },
    { name: " ", title: "" },
  ];
  assert.deepEqual(
    listedAlternatives(alternatives, ["viewpoint"]).map((alternative) => alternative.name),
    ["Köroğlu", "Bilinmez"],
  );
  assert.deepEqual(
    listedAlternatives(alternatives, ["food"]).map((alternative) => alternative.name),
    ["Teras", "Bilinmez"],
  );
  assert.equal(listedAlternatives(alternatives, []).length, 3);
  assert.deepEqual(listedAlternatives(undefined, ["food"]), []);
});

check("a name of only punctuation is no name: never listed as \".\"", () => {
  const alternatives = [{ name: "." }, { name: " , " }, { name: "Shell" }, { name: ".", title: "Kahve molası" }];
  assert.deepEqual(
    listedAlternatives(alternatives, []).map((alternative) => alternativeName(alternative) ?? alternativeTitle(alternative)),
    ["Shell", "Kahve molası"],
  );
  assert.equal(alternativeName({ name: "7/24 Market" }), "7/24 Market");
  assert.equal(alternativeTitle({ name: "x", title: " - " }), null);
});

console.log(`\n${passed} checks passed`);
