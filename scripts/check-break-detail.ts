/**
 * Asserts the helpers behind a break suggestion's detail page in the route
 * sheet: the walk, how it fits the charge, the stop it belongs to, the maps
 * search and the alternatives' categories, and the photos the sheet shows —
 * a suggestion's place and the destination, which share one rule for turning
 * the gateway's path into a URL. No test runner is installed, so this runs
 * under tsx:
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
  photoCredit,
  photoCreditLine,
  placeName,
  placePhotoUri,
  stationForHighlight,
  stopCoordinates,
  WALK_METERS_PER_MINUTE,
  walkLine,
  walkMinutes,
} from "../components/route-sheet/breakDetail";
import {
  destinationPhotoCredit,
  destinationPhotoUri,
} from "../components/route-sheet/placePhoto";
import type {
  RoutePlanData,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../services/DriveSessionStore";
import {
  normalizeRoutePlanFromGateway,
  withoutPhotosInPlan,
} from "../services/routePlanGateway";

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

const GATEWAY = "https://geocode-service.vercel.app/api/route-plan";
const PHOTO = "/api/place-photo?ref=AbCd_12-34&s=AAAAAAAAAAAAAAAAAAAAAA";

check("a photo path becomes a URL on the app's own gateway", () => {
  assert.equal(
    placePhotoUri(highlight({ photoUrl: PHOTO }), GATEWAY),
    `https://geocode-service.vercel.app${PHOTO}`,
  );
  // A gateway URL given without the path still resolves (getRoutePlanGatewayUrl appends it).
  assert.equal(
    placePhotoUri(highlight({ photoUrl: PHOTO }), "https://other.example.com/api/route-plan"),
    `https://other.example.com${PHOTO}`,
  );
  assert.equal(placePhotoUri(highlight({ photoUrl: `  ${PHOTO}  ` }), GATEWAY) !== null, true);
});

check("a photo from another host is served from our own origin, never theirs", () => {
  assert.equal(
    placePhotoUri(highlight({ photoUrl: `https://evil.example.com${PHOTO}` }), GATEWAY),
    `https://geocode-service.vercel.app${PHOTO}`,
  );
});

check("anything that is not this endpoint on an https gateway gives no photo", () => {
  const cases = [
    "javascript:/api/place-photo?ref=x",
    "//evil.example.com/api/place-photo?ref=x",
    "https:///api/place-photo?ref=x",
    "http://evil.example.com/api/place-photo?ref=x",
    "/api/other?ref=x",
    "/api/place-photo",
    "",
    "   ",
  ];
  for (const photoUrl of cases) {
    assert.equal(placePhotoUri(highlight({ photoUrl }), GATEWAY), null, photoUrl);
  }
  assert.equal(placePhotoUri(highlight({ photoUrl: undefined }), GATEWAY), null);
  // An over-long value is refused before it is parsed.
  assert.equal(
    placePhotoUri(highlight({ photoUrl: `/api/place-photo?ref=${"A".repeat(2000)}` }), GATEWAY),
    null,
  );
});

check("an http or pathless gateway shows no photo rather than a wrong one", () => {
  assert.equal(placePhotoUri(highlight({ photoUrl: PHOTO }), "http://localhost:3000/api/route-plan"), null);
  assert.equal(placePhotoUri(highlight({ photoUrl: PHOTO }), "https://geocode-service.vercel.app"), null);
  assert.equal(placePhotoUri(highlight({ photoUrl: PHOTO }), ""), null);
});

check("a suggestion that names no real place never shows a photo", () => {
  assert.equal(placePhotoUri(highlight({ photoUrl: PHOTO, poiSource: "none" }), GATEWAY), null);
  assert.equal(placePhotoUri(highlight({ photoUrl: PHOTO, poiName: "  " }), GATEWAY), null);
  assert.equal(placePhotoUri(highlight({ photoUrl: PHOTO, poiName: undefined }), GATEWAY), null);
});

check("a photo's credit is its attribution, when there is a readable one", () => {
  assert.equal(photoCredit(highlight({ photoAttribution: " Ayşe K. " })), "Ayşe K.");
  assert.equal(photoCredit(highlight({ photoAttribution: " - " })), null);
  assert.equal(photoCredit(highlight({})), null);
});

check("the group's credit line names only the photos on screen", () => {
  const withPhoto = highlight({ photoUrl: PHOTO, photoAttribution: "Ayşe K." });
  const other = highlight({ id: "food-1", photoUrl: PHOTO, photoAttribution: "Veli A." });
  assert.equal(photoCreditLine([withPhoto], GATEWAY), "Fotoğraf: Ayşe K.");
  assert.equal(photoCreditLine([withPhoto, other], GATEWAY), "Fotoğraflar: Ayşe K., Veli A.");
  // The same author twice is named once, and one name is never pluralised.
  assert.equal(
    photoCreditLine([withPhoto, highlight({ id: "b", photoUrl: PHOTO, photoAttribution: "Ayşe K." })], GATEWAY),
    "Fotoğraf: Ayşe K.",
  );
  // A photo Google sent uncredited is legitimate: it adds no name, and it must
  // not put the one credited name under a plural that claims it as hers too.
  assert.equal(photoCreditLine([withPhoto, highlight({ id: "c", photoUrl: PHOTO })], GATEWAY), "Fotoğraf: Ayşe K.");
});

check("no shown photo, no credit line", () => {
  assert.equal(photoCreditLine([], GATEWAY), null);
  assert.equal(photoCreditLine([highlight({})], GATEWAY), null);
  // Credited, but the photo itself is refused: nothing is shown, so nothing is credited.
  assert.equal(
    photoCreditLine([highlight({ photoUrl: "/api/other?x", photoAttribution: "Ayşe K." })], GATEWAY),
    null,
  );
  assert.equal(photoCreditLine([highlight({ photoUrl: PHOTO, photoAttribution: " . " })], GATEWAY), null);
  assert.equal(photoCreditLine([highlight({ photoUrl: PHOTO })], GATEWAY), null);
});

check("at most two names are credited", () => {
  const credited = ["A", "B", "C", "D"].map((name, index) =>
    highlight({ id: `h${index}`, photoUrl: PHOTO, photoAttribution: name }),
  );
  assert.equal(photoCreditLine(credited, GATEWAY), "Fotoğraflar: A, B");
});

// ---------------------------------------------------------------------------
// The destination's photo. It reaches the sheet as two top-level fields on the
// plan and is read by exactly the rule a break photo is read by, so the header
// can never load a photograph the gateway did not sign.

const plan = (overrides: Partial<RoutePlanData> = {}) =>
  ({
    routes: [],
    locations: [],
    summary: {
      total_charge_duration: 45,
      total_station_count: 2,
      total_travel_duration: 245,
      total_travel_length: 350,
      travel_start_time: "",
      travel_finish_time: "",
    },
    waypoints: { origin: "Kadıköy", destination: "Kızılay", stops: [] },
    ...overrides,
  }) as RoutePlanData;

check("the destination's photo becomes a URL on the app's own gateway", () => {
  assert.equal(
    destinationPhotoUri(plan({ destination_photo_url: PHOTO }), GATEWAY),
    `https://geocode-service.vercel.app${PHOTO}`,
  );
  assert.equal(
    destinationPhotoUri(
      plan({ destination_photo_url: PHOTO }),
      "https://other.example.com/api/route-plan",
    ),
    `https://other.example.com${PHOTO}`,
  );
  assert.equal(
    destinationPhotoUri(plan({ destination_photo_url: `  ${PHOTO}  ` }), GATEWAY) !== null,
    true,
  );
});

check("a destination photo claiming another host is served from our own origin", () => {
  assert.equal(
    destinationPhotoUri(plan({ destination_photo_url: `https://evil.example.com${PHOTO}` }), GATEWAY),
    `https://geocode-service.vercel.app${PHOTO}`,
  );
});

check("a plan with no destination photo shows none, and says so with null", () => {
  // The whole no-photo guarantee rests on this: null, never a placeholder URL.
  assert.equal(destinationPhotoUri(plan(), GATEWAY), null);
  assert.equal(destinationPhotoUri(null, GATEWAY), null);
  assert.equal(destinationPhotoUri(undefined, GATEWAY), null);
  assert.equal(destinationPhotoUri(plan({ destination_photo_url: "" }), GATEWAY), null);
  assert.equal(destinationPhotoUri(plan({ destination_photo_url: "   " }), GATEWAY), null);
});

check("a destination photo from anywhere but this endpoint on an https gateway gives none", () => {
  const cases = [
    "javascript:/api/place-photo?ref=x",
    "//evil.example.com/api/place-photo?ref=x",
    "https:///api/place-photo?ref=x",
    "http://evil.example.com/api/place-photo?ref=x",
    "/api/route-plan?ref=x",
    "/api/other?ref=x",
    "/api/place-photo",
    "api/place-photo?ref=x",
  ];
  for (const url of cases) {
    assert.equal(destinationPhotoUri(plan({ destination_photo_url: url }), GATEWAY), null, url);
  }
  // Refused before it is parsed; a real signed URL is ~1070 characters.
  assert.equal(
    destinationPhotoUri(
      plan({ destination_photo_url: `/api/place-photo?ref=${"A".repeat(2000)}` }),
      GATEWAY,
    ),
    null,
  );
  // A real one, at full length, is not.
  assert.equal(
    destinationPhotoUri(
      plan({ destination_photo_url: `/api/place-photo?ref=${"A".repeat(1024)}&s=${"B".repeat(22)}` }),
      GATEWAY,
    ) !== null,
    true,
  );
});

check("an http or pathless gateway shows no destination photo rather than a wrong one", () => {
  const p = plan({ destination_photo_url: PHOTO });
  assert.equal(destinationPhotoUri(p, "http://localhost:3000/api/route-plan"), null);
  assert.equal(destinationPhotoUri(p, "https://geocode-service.vercel.app"), null);
  assert.equal(destinationPhotoUri(p, ""), null);
});

check("the destination's credit is its attribution, when there is a readable one", () => {
  assert.equal(
    destinationPhotoCredit(plan({ destination_photo_attribution: " Ayşe K. " })),
    "Ayşe K.",
  );
  assert.equal(destinationPhotoCredit(plan({ destination_photo_attribution: " - " })), null);
  assert.equal(destinationPhotoCredit(plan({ destination_photo_attribution: "" })), null);
  assert.equal(destinationPhotoCredit(plan()), null);
  assert.equal(destinationPhotoCredit(null), null);
});

check("the plan keeps the two destination-photo fields, or neither key at all", () => {
  const kept = normalizeRoutePlanFromGateway(
    plan({
      destination_photo_url: PHOTO,
      destination_photo_attribution: "Ayşe K.",
    }),
  );
  assert.equal(kept.destination_photo_url, PHOTO);
  assert.equal(kept.destination_photo_attribution, "Ayşe K.");

  // A photo Google sent uncredited is a legitimate one: the URL stays, and no
  // empty credit key is invented beside it.
  const uncredited = normalizeRoutePlanFromGateway(plan({ destination_photo_url: PHOTO }));
  assert.equal(uncredited.destination_photo_url, PHOTO);
  assert.equal("destination_photo_attribution" in uncredited, false);

  // Absent stays absent: not undefined, so a plan with no photo is one
  // wherever it is read, the stored plans the agent strips photos from too.
  const none = normalizeRoutePlanFromGateway(plan());
  assert.equal("destination_photo_url" in none, false);
  assert.equal("destination_photo_attribution" in none, false);

  // Anything of the wrong shape is dropped rather than carried by the spread.
  for (const bad of [
    { destination_photo_url: 42 },
    { destination_photo_url: null },
    { destination_photo_url: { toString: () => PHOTO } },
    { destination_photo_url: `/api/place-photo?ref=${"A".repeat(2000)}` },
  ]) {
    const dropped = normalizeRoutePlanFromGateway(
      plan({ ...bad, destination_photo_attribution: "Ayşe K." } as Partial<RoutePlanData>),
    );
    assert.equal("destination_photo_url" in dropped, false, JSON.stringify(bad));
    // The credit goes with the photo it belongs to; a credit alone credits nothing.
    assert.equal("destination_photo_attribution" in dropped, false, JSON.stringify(bad));
  }

  // A credit of the wrong type leaves the photo alone.
  const oddCredit = normalizeRoutePlanFromGateway(
    plan({
      destination_photo_url: PHOTO,
      destination_photo_attribution: 7,
    } as unknown as Partial<RoutePlanData>),
  );
  assert.equal(oddCredit.destination_photo_url, PHOTO);
  assert.equal("destination_photo_attribution" in oddCredit, false);
});

check("the destination's photo and a break's are read by one and the same rule", () => {
  // Whatever a break photo is refused for, the destination's is refused for
  // too: one implementation, so there is no second place to get it wrong.
  const cases = [
    PHOTO,
    `https://evil.example.com${PHOTO}`,
    "http://evil.example.com/api/place-photo?ref=x",
    "/api/other?ref=x",
    "//evil.example.com/api/place-photo?ref=x",
    "javascript:/api/place-photo?ref=x",
    "/api/place-photo",
    "   ",
  ];
  for (const url of cases) {
    assert.equal(
      destinationPhotoUri(plan({ destination_photo_url: url }), GATEWAY),
      placePhotoUri(highlight({ photoUrl: url }), GATEWAY),
      url,
    );
  }
});

// ---------------------------------------------------------------------------
// What the drive history is allowed to keep. A photo path is signed for a day
// or two; stored, it can only come back as a 403, and a header that draws one
// reserves the slot, shifts its copy and then collapses again when the request
// fails. So the store strips every photo on its way to disk and on its way
// back (DriveSessionStore: getSessionSnapshot, buildRestoredContext), which is
// what makes "no photo in a stored plan" true rather than merely intended.

check("a stored plan keeps no photograph: the destination's or a break's", () => {
  const withPhotos = plan({
    destination_photo_url: PHOTO,
    destination_photo_attribution: "Ayşe K.",
    interest_highlights: [highlight({ photoUrl: PHOTO, photoAttribution: "Ayşe K." })],
    locations: [
      station({
        interest_highlight: highlight({ photoUrl: PHOTO, photoAttribution: "Ayşe K." }),
      }),
    ],
  });
  const stored = withoutPhotosInPlan(withPhotos);

  // Absent, not undefined: the renderer reads a plan by whether the key is there.
  assert.equal("destination_photo_url" in stored, false);
  assert.equal("destination_photo_attribution" in stored, false);
  assert.equal("photoUrl" in stored.interest_highlights![0]!, false);
  assert.equal("photoAttribution" in stored.interest_highlights![0]!, false);
  assert.equal("photoUrl" in stored.locations[0]!.interest_highlight!, false);
  // Nothing else about the plan is touched: the rows still read the same.
  assert.equal(stored.interest_highlights![0]!.title, "Kahve molası");
  assert.equal(stored.locations[0]!.name, "ZES Bolu Dağı Tesisleri");
  assert.equal(stored.waypoints.destination, "Kızılay");
  // And nothing is drawn from it — the answer a photo-less plan gives.
  assert.equal(destinationPhotoUri(stored, GATEWAY), null);
  assert.equal(destinationPhotoCredit(stored), null);
  assert.equal(placePhotoUri(stored.interest_highlights![0]!, GATEWAY), null);

  // The live plan is untouched: this drive goes on showing its photographs.
  assert.equal(withPhotos.destination_photo_url, PHOTO);
  assert.equal(withPhotos.interest_highlights![0]!.photoUrl, PHOTO);
});

check("a plan that never had a photo is stored as the very same object", () => {
  // Not merely equal: identical, so a drive with no photo is not copied and
  // nothing about it can change on its way to disk.
  const bare = plan({ interest_highlights: [highlight()], locations: [station()] });
  assert.equal(withoutPhotosInPlan(bare), bare);
  // A credit with no photo beside it is still something to strip.
  const creditOnly = plan({ destination_photo_attribution: "Ayşe K." });
  assert.equal("destination_photo_attribution" in withoutPhotosInPlan(creditOnly), false);
});

check("a restored plan is the photo-less layout, whatever the row on disk held", () => {
  // What buildRestoredContext does with a row written before photos stopped
  // being stored: the rules compose, and both keys are gone at the end of it.
  const fromDisk = plan({
    destination_photo_url: PHOTO,
    destination_photo_attribution: "Ayşe K.",
    interest_highlights: [highlight({ photoUrl: PHOTO })],
  });
  const restored = withoutPhotosInPlan(normalizeRoutePlanFromGateway(fromDisk));
  assert.equal("destination_photo_url" in restored, false);
  assert.equal("destination_photo_attribution" in restored, false);
  assert.equal(destinationPhotoUri(restored, GATEWAY), null);
  assert.equal(restored.interest_highlights!.length, 1);
  assert.equal(placePhotoUri(restored.interest_highlights![0]!, GATEWAY), null);
});

console.log(`\n${passed} checks passed`);
