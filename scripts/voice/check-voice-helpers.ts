/**
 * Asserts the pure helpers behind the wake word and the break exclusions.
 * The repo has no test runner installed, so this runs under tsx:
 *
 *   npx tsx scripts/voice/check-voice-helpers.ts
 */
import assert from "node:assert/strict";
import { PREDEFINED_USER_INTERESTS } from "../../constants/userInterests";
import {
  BreakExclusions,
  excludedBreaksPrefKey,
  parseStoredBreakKinds,
} from "../../services/breakExclusions";
import type {
  RoutePlanData,
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../../services/DriveSessionStore";
import {
  alternativeKind,
  BREAK_KINDS,
  highlightKind,
  keptAlternatives,
  normalizeBreakKinds,
  personalizeRoutePlan,
  templateKind,
  updateInterestChips,
} from "../../services/routePersonalization";
import { foldTurkish, matchesWakeWord } from "../../services/voice/wakeWordMatcher";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

// ── Wake word ─────────────────────────────────────────────────────────────
check("folds Turkish letters after tr-TR lower-casing", () => {
  assert.equal(foldTurkish("AĞBA"), "agba");
  assert.equal(foldTurkish("İBADET"), "ibadet");
  assert.equal(foldTurkish("IŞIK"), "isik");
  // "i" + combining dot, as a runtime without Turkish rules would produce.
  assert.equal(foldTurkish("i̇badet"), "ibadet");
});

check("matches the spellings the recognizer produces", () => {
  for (const heard of [
    "AKBA",
    "Akba",
    "akba",
    "akpa",
    "Ağba",
    "akbaa",
    "Hakba",
    "ak ba",
    "Ak Ba",
    "hey Akba nereye gidiyoruz",
    "Akba'ya sor",
    "Akba, şarj istasyonu bul",
    " akba ",
  ]) {
    assert.equal(matchesWakeWord(heard), true, heard);
  }
});

check("ignores words that only contain the sound", () => {
  for (const heard of [
    "",
    "akbaba",
    "Akbank",
    "Akbay",
    "akbar",
    "ak parti",
    "ak baba",
    "kaba",
    "abla",
    "bak bakalım",
    "araba",
  ]) {
    assert.equal(matchesWakeWord(heard), false, heard);
  }
});

// ── Break exclusions ──────────────────────────────────────────────────────
check("normalizes the agent's excluded kinds", () => {
  assert.deepEqual(normalizeBreakKinds([" Food ", "coffee", "food", "nope", 3, null]), [
    "food",
    "coffee",
  ]);
  assert.deepEqual(normalizeBreakKinds("food"), []);
  assert.deepEqual(normalizeBreakKinds(undefined), []);
});

check("every local template has a kind from the agent's list", () => {
  const expected: Record<string, string> = {
    coffee: "coffee",
    meal: "food",
    dessert: "dessert",
    shopping: "shopping",
    view: "viewpoint",
    restroom: "restroom",
    worship: "worship",
    quiet: "park",
    walk: "park",
    family_kids: "park",
    family: "food",
    comfort: "coffee",
  };
  for (const [key, kind] of Object.entries(expected)) {
    assert.equal(templateKind(key), kind, key);
    assert.ok((BREAK_KINDS as readonly string[]).includes(kind));
  }
});

check("maps gateway highlights to kinds by key, then by POI category", () => {
  assert.equal(highlightKind({ interestKey: "food" }), "food");
  assert.equal(highlightKind({ interestKey: "family" }), "food");
  assert.equal(highlightKind({ interestKey: "scenic" }), "viewpoint");
  assert.equal(highlightKind({ interestKey: "walk" }), "park");
  assert.equal(highlightKind({ interestKey: "family_kids" }), "park");
  assert.equal(highlightKind({ interestKey: "", poiCategory: "mosque" }), "worship");
  assert.equal(highlightKind({ interestKey: "x", poiCategory: "restaurant" }), "food");
  assert.equal(highlightKind({ interestKey: "x", poiCategory: "y" }), null);
});

const station = (name: string): RoutePlanLocation => ({
  type: "station",
  name,
  coordinates: { lat: "0", lon: "0" },
  travel_duration: 0,
  travel_length: 0,
  battery_status: { from: 50, to: 80 },
});
const endpoint = (type: "origin" | "destination", name: string): RoutePlanLocation => ({
  ...station(name),
  type,
});
const plan = (extra: Partial<RoutePlanData> = {}): RoutePlanData =>
  ({
    locations: [endpoint("origin", "A"), station("S1"), station("S2"), endpoint("destination", "B")],
    ...extra,
  }) as RoutePlanData;
const kindsOf = (data: RoutePlanData) =>
  (data.interest_highlights ?? []).map((h) => templateKind(h.interestKey) ?? h.interestKey);

check("local fill skips excluded interests", () => {
  const result = personalizeRoutePlan(plan(), ["Yemek", "Kahve"], ["food"]);
  // Two stations: the coffee chip, then the comfort fallback (also a coffee kind).
  assert.deepEqual(kindsOf(result), ["coffee", "coffee"]);
  assert.ok(result.locations.every((l) => l.interest_highlight?.interestKey !== "meal"));
});

check("the fallback template is excluded too", () => {
  const result = personalizeRoutePlan(plan(), ["Yemek"], ["food", "coffee"]);
  assert.deepEqual(result.interest_highlights, []);
  assert.ok(result.locations.every((l) => !l.interest_highlight));
});

check("without exclusions the old behaviour holds", () => {
  const result = personalizeRoutePlan(plan(), ["Yemek"]);
  assert.deepEqual(
    (result.interest_highlights ?? []).map((h) => h.interestKey),
    ["meal", "comfort"],
  );
});

check("gateway highlights of an excluded kind are dropped", () => {
  const gateway = plan({
    interest_highlights: [
      { id: "1", interestKey: "food", interestLabel: "Yemek", icon: "restaurant-outline", shortLabel: "Yemek", title: "Yemek molası", message: "", stationName: "S1" },
      { id: "2", interestKey: "coffee", interestLabel: "Kahve", icon: "cafe-outline", shortLabel: "Kahve", title: "Kahve molası", message: "", stationName: "S2" },
    ],
    route_optimization_summary: "S1: Yemek molası | S2: Kahve molası",
  });
  const result = personalizeRoutePlan(gateway, ["Yemek", "Kahve"], ["food"]);
  assert.deepEqual((result.interest_highlights ?? []).map((h) => h.interestKey), ["coffee"]);
  assert.equal(result.route_optimization_summary, "S2: Kahve molası");
});

check("when every gateway highlight is excluded, the local fill honours the list", () => {
  const gateway = plan({
    interest_highlights: [
      { id: "1", interestKey: "food", interestLabel: "Yemek", icon: "restaurant-outline", shortLabel: "Yemek", title: "Yemek molası", message: "", stationName: "S1" },
    ],
  });
  const result = personalizeRoutePlan(gateway, ["Yemek", "İbadet alanı"], ["food"]);
  const keys = (result.interest_highlights ?? []).map((h) => h.interestKey);
  assert.ok(!keys.includes("food") && !keys.includes("meal"), keys.join(","));
  assert.ok(keys.includes("worship"), keys.join(","));
});

check("embedded station highlights of an excluded kind are dropped", () => {
  const embedded = plan();
  embedded.locations[1] = {
    ...embedded.locations[1],
    interest_highlight: { id: "1", interestKey: "worship", interestLabel: "", icon: "moon", shortLabel: "", title: "İbadet molası", message: "", stationName: "S1" },
  };
  const result = personalizeRoutePlan(embedded, [], ["worship"]);
  assert.ok(result.locations.every((l) => l.interest_highlight?.interestKey !== "worship"));
});

check("'Çocuk dostu mola' is the park template, 'Ailece rota' the family one", () => {
  const oneStation = (): RoutePlanData =>
    ({
      locations: [endpoint("origin", "A"), station("S1"), endpoint("destination", "B")],
    }) as RoutePlanData;
  const keyFor = (chip: string) =>
    personalizeRoutePlan(oneStation(), [chip]).interest_highlights?.[0]?.interestKey;
  assert.equal(keyFor("Çocuk dostu mola"), "family_kids");
  assert.equal(keyFor("Ailece rota"), "family");
  // Ruling out parks leaves no kids' suggestion; ruling out food leaves it.
  const noPark = personalizeRoutePlan(oneStation(), ["Çocuk dostu mola"], ["park", "coffee"]);
  assert.deepEqual(noPark.interest_highlights, []);
  const noFood = personalizeRoutePlan(oneStation(), ["Çocuk dostu mola"], ["food"]);
  assert.equal(noFood.interest_highlights?.[0]?.interestKey, "family_kids");
});

// ── Alternatives ──────────────────────────────────────────────────────────
const alt = (name: string, category: string): RoutePlanHighlightAlternative => ({
  name,
  category,
  title: name,
});
const withAlternatives = (
  id: string,
  interestKey: string,
  stationName: string,
  alternatives: RoutePlanHighlightAlternative[],
): RoutePlanInterestHighlight => ({
  id,
  interestKey,
  interestLabel: "",
  icon: "",
  shortLabel: "",
  title: `${interestKey} molası`,
  message: "",
  stationName,
  alternatives,
});

check("alternatives are kinded by the ranker's category, Places types too", () => {
  assert.equal(alternativeKind({ category: "food" }), "food");
  assert.equal(alternativeKind({ category: "park" }), "park");
  assert.equal(alternativeKind({ category: "restaurant" }), "food");
  assert.equal(alternativeKind({ category: "mosque" }), "worship");
  assert.equal(alternativeKind({ category: undefined }), null);
  assert.equal(alternativeKind({ category: "unknown" }), null);
});

check("keptAlternatives drops excluded kinds and keeps the array when nothing goes", () => {
  const list = [alt("Köfteci", "food"), alt("Park", "park"), alt("Bilinmez", "x")];
  assert.deepEqual(
    keptAlternatives(list, ["food"])?.map((a) => a.name),
    ["Park", "Bilinmez"],
  );
  assert.equal(keptAlternatives(list, ["sport"]), list);
  assert.equal(keptAlternatives(list, []), list);
  assert.equal(keptAlternatives(undefined, ["food"]), undefined);
});

check("a kept highlight loses its excluded alternatives, listed and embedded", () => {
  const listed = withAlternatives("1", "coffee", "S1", [
    alt("Köfteci", "food"),
    alt("Lokanta", "restaurant"),
    alt("Park", "park"),
  ]);
  const embedded = plan({
    interest_highlights: [listed],
    route_optimization_summary: "gateway summary",
  });
  embedded.locations[1] = { ...embedded.locations[1], interest_highlight: listed };
  const result = personalizeRoutePlan(embedded, ["Kahve"], ["food"]);
  assert.deepEqual(
    result.interest_highlights?.[0]?.alternatives?.map((a) => a.name),
    ["Park"],
  );
  assert.deepEqual(
    result.locations[1].interest_highlight?.alternatives?.map((a) => a.name),
    ["Park"],
  );
  // Only alternatives changed: the gateway's own summary stays.
  assert.equal(result.route_optimization_summary, "gateway summary");
  // The input plan is not mutated.
  assert.equal(listed.alternatives?.length, 3);
});

check("with nothing to drop the plan comes back as the same object", () => {
  const gateway = plan({
    interest_highlights: [withAlternatives("1", "coffee", "S1", [alt("Park", "park")])],
  });
  assert.equal(personalizeRoutePlan(gateway, [], ["food"]), gateway);
  assert.equal(personalizeRoutePlan(gateway, [], []), gateway);
});

check("re-filtering a shown plan drops the newly excluded kind", () => {
  // What the hook does after preference_update: personalize the stored plan again.
  const shown = personalizeRoutePlan(plan(), ["Yemek", "Kahve"]);
  assert.deepEqual(kindsOf(shown), ["food", "coffee"]);
  const refiltered = personalizeRoutePlan(shown, ["Yemek", "Kahve"], ["food"]);
  assert.notEqual(refiltered, shown);
  assert.deepEqual(kindsOf(refiltered), ["coffee"]);
  assert.ok(refiltered.locations.every((l) => l.interest_highlight?.interestKey !== "meal"));
});

// ── Interest chips (preference_update) ────────────────────────────────────
check("removed chips go, matched by folded label", () => {
  assert.deepEqual(
    updateInterestChips(
      ["Kahve", "Yemek", "İbadet alanı"],
      ["yemek", "İBADET ALANI"],
      [],
      PREDEFINED_USER_INTERESTS,
    ),
    ["Kahve"],
  );
});

check("restored chips come back in the app's spelling, once, only if known", () => {
  assert.deepEqual(
    updateInterestChips(
      ["Kahve"],
      [],
      ["yemek", "kahve", "Yemek", "Uzay yolculuğu", "çocuk dostu mola"],
      PREDEFINED_USER_INTERESTS,
    ),
    ["Kahve", "Yemek", "Çocuk dostu mola"],
  );
});

check("two quick updates applied in order keep both changes", () => {
  // The second update starts from the stored result of the first.
  const before = ["Kahve", "Yemek", "Tatlı"];
  const afterFirst = updateInterestChips(before, ["Yemek"], [], PREDEFINED_USER_INTERESTS);
  const afterSecond = updateInterestChips(afterFirst, ["Tatlı"], [], PREDEFINED_USER_INTERESTS);
  assert.deepEqual(afterSecond, ["Kahve"]);
  // Starting both from the old list (the bug) would have brought "Yemek" back.
  const stale = updateInterestChips(before, ["Tatlı"], [], PREDEFINED_USER_INTERESTS);
  assert.ok(stale.includes("Yemek"));
});

check("an update that changes nothing returns an equal list", () => {
  const current = ["Kahve", "Yemek"];
  assert.deepEqual(
    updateInterestChips(current, ["Spor"], ["Kahve"], PREDEFINED_USER_INTERESTS),
    current,
  );
});

// ── Stored exclusions ─────────────────────────────────────────────────────
check("exclusions are stored per person", () => {
  assert.equal(excludedBreaksPrefKey(7), "excluded_break_categories:7");
  assert.notEqual(excludedBreaksPrefKey(7), excludedBreaksPrefKey(8));
  assert.deepEqual(parseStoredBreakKinds('["food"," Coffee ","nope"]'), ["food", "coffee"]);
  assert.deepEqual(parseStoredBreakKinds("not json"), []);
  assert.deepEqual(parseStoredBreakKinds(null), []);
});

check("the in-memory list notifies only on a real change", () => {
  let calls = 0;
  const unsubscribe = BreakExclusions.subscribe(() => {
    calls += 1;
  });
  BreakExclusions.set(["food"]);
  const first = BreakExclusions.get();
  BreakExclusions.set(["food"]);
  assert.equal(BreakExclusions.get(), first);
  BreakExclusions.set([]);
  unsubscribe();
  BreakExclusions.set(["park"]);
  assert.equal(calls, 2);
  BreakExclusions.set([]);
});

console.log(`\n${passed} checks passed`);
