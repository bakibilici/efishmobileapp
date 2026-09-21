import type {
  RoutePlanData,
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
} from "./DriveSessionStore";

/**
 * The kinds of break the driver can tell AKBA never to suggest ("yemek
 * molası önerme"). The agent owns the list and sends it back in
 * preference_update and in planEvRoute's tool_end; these are its names.
 */
export const BREAK_KINDS = [
  "coffee",
  "food",
  "dessert",
  "shopping",
  "worship",
  "restroom",
  "park",
  "viewpoint",
  "sport",
] as const;
export type BreakKind = (typeof BREAK_KINDS)[number];

const isBreakKind = (value: string): value is BreakKind =>
  (BREAK_KINDS as readonly string[]).includes(value);

/** Keeps only known kinds, lower-cased and de-duplicated; anything else is ignored. */
export const normalizeBreakKinds = (raw: unknown): BreakKind[] => {
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<BreakKind>();
  raw.forEach((value) => {
    if (typeof value !== "string") return;
    const kind = value.trim().toLowerCase();
    if (isBreakKind(kind)) kinds.add(kind);
  });
  return Array.from(kinds);
};

type InterestTemplate = {
  key: string;
  /** What this suggestion is, for honouring the driver's exclusions. */
  kind: BreakKind;
  interestLabel: string;
  icon: string;
  shortLabel: string;
  title: string;
  message: string;
  matchers: string[];
};

const INTEREST_TEMPLATES: InterestTemplate[] = [
  {
    key: "coffee",
    kind: "coffee",
    interestLabel: "Kahve",
    icon: "cafe-outline",
    shortLabel: "Kahve",
    title: "Kahve molası",
    message:
      "Aracınız şarj edilirken burada sıcak bir kahve molası verebilirsiniz.",
    matchers: ["kahve", "coffee", "latte", "espresso"],
  },
  {
    key: "meal",
    kind: "food",
    interestLabel: "Yemek",
    icon: "restaurant-outline",
    shortLabel: "Yemek",
    title: "Yemek molası",
    message:
      "Bu durak, şarj süresini kısa bir yemek molasına çevirmek için uygun görünüyor.",
    matchers: ["yemek", "food", "restoran", "restaurant"],
  },
  {
    key: "dessert",
    kind: "dessert",
    interestLabel: "Tatlı",
    icon: "ice-cream-outline",
    shortLabel: "Tatlı",
    title: "Tatlı molası",
    message:
      "Şarj sırasında burada küçük bir tatlı ya da atıştırmalık molası düşünebilirsiniz.",
    matchers: ["tatlı", "dessert", "pasta"],
  },
  {
    key: "shopping",
    kind: "shopping",
    interestLabel: "Alışveriş",
    icon: "bag-handle-outline",
    shortLabel: "Alışveriş",
    title: "Kısa alışveriş molası",
    message:
      "Bu istasyon çevresi, şarj olurken hızlı bir alışveriş molası için uygun olabilir.",
    matchers: ["alışveriş", "shopping", "mağaza", "market"],
  },
  {
    key: "view",
    kind: "viewpoint",
    interestLabel: "Manzara",
    icon: "image-outline",
    shortLabel: "Manzara",
    title: "Kısa manzara molası",
    message:
      "Şarj sırasında burada kısa bir nefes molası verip çevreyi değerlendirebilirsiniz.",
    matchers: ["manzara", "view", "scenic"],
  },
  // Both of these must stay ABOVE the "quiet" template. Matching is forward-only
  // (interest.includes(matcher)), so any label ending in "molası" is captured by
  // a broader "mola"-style matcher listed earlier — which is exactly what used to
  // send "İhtiyaç molası" to "Sessiz mola noktası".
  {
    key: "restroom",
    kind: "restroom",
    interestLabel: "İhtiyaç molası",
    icon: "accessibility-outline",
    shortLabel: "İhtiyaç",
    title: "İhtiyaç molası",
    message:
      "Bu durak yakınında kısa bir ihtiyaç ve dinlenme molası vermek daha kolay olabilir.",
    // "tuvalet" stays so profiles saved under the old label still resolve.
    matchers: ["ihtiyaç", "tuvalet", "wc"],
  },
  {
    key: "worship",
    kind: "worship",
    interestLabel: "İbadet alanı",
    icon: "moon",
    shortLabel: "İbadet",
    title: "İbadet molası",
    message:
      "Şarj molasında ibadet için yakında bir cami veya mescit bulunabilir.",
    // "badet" covers the runtime where lowercasing "İ" without Turkish locale
    // rules leaves a combining dot, which plain "ibadet" would not match.
    matchers: ["ibadet", "badet", "cami", "mescit", "namaz"],
  },
  {
    key: "quiet",
    // The gateway looks for a park for "Sessiz mola" too.
    kind: "park",
    interestLabel: "Sessiz mola",
    icon: "moon-outline",
    shortLabel: "Sessiz",
    title: "Sessiz mola noktası",
    message:
      "Bu durak, yolun temposunu düşürüp daha sakin bir mola vermek için uygun olabilir.",
    // No bare "mola" here: matching is forward containment, so it also swallowed
    // "Çocuk dostu mola" (and would swallow "İhtiyaç molası"). "Sessiz mola" is
    // already covered by "sessiz".
    matchers: ["sessiz", "sakin", "quiet"],
  },
  {
    key: "walk",
    kind: "park",
    interestLabel: "Yürüyüş",
    icon: "walk-outline",
    shortLabel: "Yürüyüş",
    title: "Kısa yürüyüş molası",
    message:
      "Şarj boyunca kısa bir yürüyüş ya da esneme molası yapmak için iyi bir durak olabilir.",
    matchers: ["yürüyüş", "walk", "spor", "fitness"],
  },
  // Above "family", like the gateway: "Çocuk dostu mola" is a park there
  // (family_kids → park), not the family restaurant "Ailece rota" gets.
  {
    key: "family_kids",
    kind: "park",
    interestLabel: "Çocuk dostu mola",
    icon: "happy-outline",
    shortLabel: "Çocuk",
    title: "Çocuk dostu mola",
    message:
      "Bu şarj durağı, çocuklarla birlikte rahat bir mola vermek için uygun görünüyor.",
    matchers: ["çocuk"],
  },
  {
    key: "family",
    // The gateway resolves "Ailece rota" to a family restaurant.
    kind: "food",
    interestLabel: "Ailece rota",
    icon: "people-outline",
    shortLabel: "Ailece",
    title: "Aile dostu mola",
    message:
      "Bu şarj durağı, aileyle birlikte daha rahat bir mola vermek için uygun görünüyor.",
    matchers: ["ailece", "family"],
  },
];

const FALLBACK_TEMPLATES: InterestTemplate[] = [
  {
    key: "comfort",
    // Shown with a coffee cup, so a driver who ruled out coffee must not get it.
    kind: "coffee",
    interestLabel: "Konfor",
    icon: "cafe-outline",
    shortLabel: "Mola",
    title: "Konforlu mola",
    message:
      "Araciniz sarj olurken burada kisa bir mola verip yolun geri kalani icin hazirlanabilirsiniz.",
    matchers: [],
  },
];

/** Gateway interest_key values (rule path and ranker path) → kind. */
const HIGHLIGHT_KEY_KIND: Record<string, BreakKind> = {
  coffee: "coffee",
  comfort: "coffee",
  food: "food",
  meal: "food",
  family: "food",
  dessert: "dessert",
  shopping: "shopping",
  worship: "worship",
  restroom: "restroom",
  park: "park",
  walk: "park",
  quiet: "park",
  family_kids: "park",
  viewpoint: "viewpoint",
  view: "viewpoint",
  scenic: "viewpoint",
  sport: "sport",
};

/** Gateway poi_category values → kind, for a highlight whose key says nothing. */
const POI_CATEGORY_KIND: Record<string, BreakKind> = {
  cafe: "coffee",
  coffee: "coffee",
  restaurant: "food",
  family_restaurant: "food",
  food: "food",
  bakery: "dessert",
  dessert: "dessert",
  mall: "shopping",
  shopping_mall: "shopping",
  supermarket: "shopping",
  shopping: "shopping",
  mosque: "worship",
  worship: "worship",
  rest_area: "restroom",
  gas_station: "restroom",
  restroom: "restroom",
  park: "park",
  tourist_attraction: "viewpoint",
  viewpoint: "viewpoint",
  gym: "sport",
  sport: "sport",
};

/** What kind of break a highlight suggests, or null when it cannot be told. */
export const highlightKind = (
  highlight: Pick<RoutePlanInterestHighlight, "interestKey" | "poiCategory">,
): BreakKind | null => {
  const key = (highlight.interestKey || "").trim().toLowerCase();
  if (HIGHLIGHT_KEY_KIND[key]) return HIGHLIGHT_KEY_KIND[key];
  const category = (highlight.poiCategory || "").trim().toLowerCase();
  return POI_CATEGORY_KIND[category] ?? null;
};

/**
 * What kind of break an alternative is. The ranker sends its own category
 * (the same names as BREAK_KINDS); a Places type is understood as well.
 */
export const alternativeKind = (
  alternative: Pick<RoutePlanHighlightAlternative, "category">,
): BreakKind | null =>
  highlightKind({ interestKey: alternative.category ?? "", poiCategory: alternative.category });

/** The alternatives of a kind the driver did not rule out; the same array when none is dropped. */
export const keptAlternatives = (
  alternatives: readonly RoutePlanHighlightAlternative[] | undefined,
  excludedKinds: readonly string[],
): RoutePlanHighlightAlternative[] | undefined => {
  if (!alternatives?.length || !excludedKinds.length) {
    return alternatives as RoutePlanHighlightAlternative[] | undefined;
  }
  const kept = alternatives.filter((alternative) => {
    const kind = alternativeKind(alternative);
    return kind === null || !excludedKinds.includes(kind);
  });
  return kept.length === alternatives.length
    ? (alternatives as RoutePlanHighlightAlternative[])
    : kept;
};

/** The kind of a local template, by its key (exported for the pure-function checks). */
export const templateKind = (key: string): BreakKind | null =>
  [...INTEREST_TEMPLATES, ...FALLBACK_TEMPLATES].find((template) => template.key === key)
    ?.kind ?? null;

/** tr-TR lower-case with Turkish letters folded, for comparing interest labels. */
export const normalizeInterest = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();

/**
 * The profile chips after AKBA stopped using some (`removed`) and the driver
 * allowed some again (`restored`). Removals match by folded label. Only chips
 * the app offers (`known`) come back, under the app's own spelling, at the
 * end and never twice.
 */
export const updateInterestChips = (
  current: readonly string[],
  removed: readonly string[],
  restored: readonly string[],
  known: readonly string[],
): string[] => {
  const removedKeys = new Set(removed.map(normalizeInterest));
  const next = current.filter((interest) => !removedKeys.has(normalizeInterest(interest)));
  const present = new Set(next.map(normalizeInterest));
  restored.forEach((label) => {
    const key = normalizeInterest(label);
    const chip = known.find((entry) => normalizeInterest(entry) === key);
    if (!chip || present.has(key)) return;
    next.push(chip);
    present.add(key);
  });
  return next;
};

const pickSpreadIndexes = (itemCount: number, selectionCount: number) => {
  if (selectionCount <= 0 || itemCount <= 0) return [];
  if (selectionCount >= itemCount) {
    return Array.from({ length: itemCount }, (_, index) => index);
  }

  const indexes = new Set<number>();
  for (let i = 0; i < selectionCount; i += 1) {
    const index = Math.round((i * (itemCount - 1)) / (selectionCount - 1 || 1));
    indexes.add(index);
  }

  return Array.from(indexes).sort((a, b) => a - b);
};

const resolveTemplatesFromInterests = (interests: string[]) => {
  const seen = new Set<string>();
  const matchedTemplates: InterestTemplate[] = [];

  interests.forEach((interest) => {
    const normalizedInterest = normalizeInterest(interest);
    const template = INTEREST_TEMPLATES.find((entry) =>
      entry.matchers.some((matcher) =>
        normalizedInterest.includes(normalizeInterest(matcher)),
      ),
    );

    if (template && !seen.has(template.key)) {
      matchedTemplates.push(template);
      seen.add(template.key);
    }
  });

  return matchedTemplates;
};

export const buildDriverRouteOptimizationContext = (interests: string[]) => {
  if (!interests.length) {
    return "Rota oluştuktan sonra uygun şarj duraklarında kısa ve doğal mola önerileri sun.";
  }

  return [
    `Sürücünün ilgi alanları: ${interests.join(", ")}.`,
    "Rota oluştuktan sonra en fazla 2 şarj durağı için kişiselleştirilmiş mola önerisi sun.",
    "Öneriler doğal, kısa ve desteklenmeyen detay uydurmadan verilmelidir.",
  ].join(" ");
};

const summarizeHighlights = (highlights: RoutePlanInterestHighlight[]) =>
  highlights
    .map((highlight) => `${highlight.stationName}: ${highlight.title}`)
    .join(" | ");

/**
 * Drops gateway highlights of a kind the driver ruled out, and the ruled-out
 * alternatives of the ones that stay. The gateway is asked to honour the
 * exclusions itself; this is the app not trusting that.
 */
const dropExcludedServerHighlights = (
  routePlanData: RoutePlanData,
  excluded: Set<BreakKind>,
): RoutePlanData => {
  if (!excluded.size) return routePlanData;
  const excludedKinds = Array.from(excluded);
  const isExcluded = (highlight?: RoutePlanInterestHighlight) => {
    if (!highlight) return false;
    const kind = highlightKind(highlight);
    return kind !== null && excluded.has(kind);
  };
  let droppedAny = false;
  let trimmedAny = false;
  /** A kept highlight without its ruled-out alternatives (the same object when it has none). */
  const trimAlternatives = (highlight: RoutePlanInterestHighlight) => {
    const alternatives = keptAlternatives(highlight.alternatives, excludedKinds);
    if (alternatives === highlight.alternatives) return highlight;
    trimmedAny = true;
    return { ...highlight, alternatives };
  };

  const listed = routePlanData.interest_highlights ?? [];
  const keptListed = listed
    .filter((highlight) => !isExcluded(highlight))
    .map(trimAlternatives);
  if (keptListed.length !== listed.length) droppedAny = true;
  const locations = routePlanData.locations.map((location) => {
    const highlight = location.interest_highlight;
    if (!highlight) return location;
    if (isExcluded(highlight)) {
      droppedAny = true;
      return { ...location, interest_highlight: undefined };
    }
    const trimmed = trimAlternatives(highlight);
    return trimmed === highlight ? location : { ...location, interest_highlight: trimmed };
  });
  if (!droppedAny && !trimmedAny) return routePlanData;
  // Alternatives are not in the summary; it only needs rewriting for a dropped highlight.
  if (!droppedAny) {
    return { ...routePlanData, locations, interest_highlights: keptListed };
  }

  const kept = keptListed.length
    ? keptListed
    : locations
        .map((location) => location.interest_highlight)
        .filter((highlight): highlight is RoutePlanInterestHighlight => !!highlight);
  return {
    ...routePlanData,
    locations,
    interest_highlights: keptListed,
    // The gateway's summary may still name a dropped suggestion.
    route_optimization_summary: kept.length ? summarizeHighlights(kept) : "",
  };
};

/**
 * `excludedKinds`: kinds the driver told AKBA never to suggest. They are
 * binding: no local template of such a kind is added, and gateway highlights
 * of such a kind are dropped.
 */
export const personalizeRoutePlan = (
  sourcePlan: RoutePlanData,
  interests: string[],
  excludedKinds: readonly string[] = [],
): RoutePlanData => {
  const excluded = new Set(normalizeBreakKinds(excludedKinds));
  const routePlanData = dropExcludedServerHighlights(sourcePlan, excluded);

  const hasServerHighlights =
    Array.isArray(routePlanData.interest_highlights) &&
    routePlanData.interest_highlights.length > 0;
  const hasEmbeddedStationHighlight = routePlanData.locations.some(
    (location) => location.type === "station" && location.interest_highlight,
  );

  if (hasServerHighlights || hasEmbeddedStationHighlight) {
    return routePlanData;
  }

  const stationLocations = routePlanData.locations.filter(
    (location) => location.type === "station",
  );

  if (!stationLocations.length) {
    return {
      ...routePlanData,
      interest_highlights: [],
      route_optimization_summary: buildDriverRouteOptimizationContext(interests),
    };
  }

  const matchedTemplates = resolveTemplatesFromInterests(interests);
  const candidateTemplates = [
    ...matchedTemplates,
    ...FALLBACK_TEMPLATES.filter(
      (template) => !matchedTemplates.some((entry) => entry.key === template.key),
    ),
  ].filter((template) => !excluded.has(template.kind));

  const suggestionCount = Math.min(
    stationLocations.length,
    candidateTemplates.length,
    stationLocations.length > 1 ? 2 : 1,
  );

  const stationIndexes = pickSpreadIndexes(stationLocations.length, suggestionCount);
  const highlights: RoutePlanInterestHighlight[] = [];
  let stationCursor = 0;

  const personalizedLocations = routePlanData.locations.map((location) => {
    if (location.type !== "station") {
      return { ...location, interest_highlight: undefined };
    }

    const pickedStationIndex = stationIndexes.indexOf(stationCursor);
    const template =
      pickedStationIndex >= 0 ? candidateTemplates[pickedStationIndex] : null;
    stationCursor += 1;

    if (!template) {
      return { ...location, interest_highlight: undefined };
    }

    const highlight: RoutePlanInterestHighlight = {
      id: `${template.key}-${stationCursor}`,
      interestKey: template.key,
      interestLabel: template.interestLabel,
      icon: template.icon,
      shortLabel: template.shortLabel,
      title: template.title,
      message: template.message,
      stationName: location.name,
    };

    highlights.push(highlight);

    return {
      ...location,
      interest_highlight: highlight,
    };
  });

  const routeOptimizationSummary = highlights.length
    ? summarizeHighlights(highlights)
    : buildDriverRouteOptimizationContext(interests);

  return {
    ...routePlanData,
    locations: personalizedLocations,
    interest_highlights: highlights,
    route_optimization_summary: routeOptimizationSummary,
  };
};

export const buildRouteInterestHighlightsText = (
  routePlanData?: RoutePlanData | null,
) => {
  const highlights = routePlanData?.interest_highlights ?? [];
  if (!highlights.length) {
    return routePlanData?.route_optimization_summary ?? "";
  }

  return highlights
    .map((highlight) => `${highlight.stationName}: ${highlight.title}`)
    .join(" | ");
};
