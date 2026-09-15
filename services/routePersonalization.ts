import type {
  RoutePlanData,
  RoutePlanInterestHighlight,
} from "./DriveSessionStore";

type InterestTemplate = {
  key: string;
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
    interestLabel: "Yürüyüş",
    icon: "walk-outline",
    shortLabel: "Yürüyüş",
    title: "Kısa yürüyüş molası",
    message:
      "Şarj boyunca kısa bir yürüyüş ya da esneme molası yapmak için iyi bir durak olabilir.",
    matchers: ["yürüyüş", "walk", "spor", "fitness"],
  },
  {
    key: "family",
    interestLabel: "Ailece rota",
    icon: "people-outline",
    shortLabel: "Ailece",
    title: "Aile dostu mola",
    message:
      "Bu şarj durağı, aileyle birlikte daha rahat bir mola vermek için uygun görünüyor.",
    matchers: ["ailece", "çocuk", "family", "çocuk dostu"],
  },
];

const FALLBACK_TEMPLATES: InterestTemplate[] = [
  {
    key: "comfort",
    interestLabel: "Konfor",
    icon: "cafe-outline",
    shortLabel: "Mola",
    title: "Konforlu mola",
    message:
      "Araciniz sarj olurken burada kisa bir mola verip yolun geri kalani icin hazirlanabilirsiniz.",
    matchers: [],
  },
];

const normalizeInterest = (value: string) =>
  value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .trim();

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

export const personalizeRoutePlan = (
  routePlanData: RoutePlanData,
  interests: string[],
): RoutePlanData => {
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
  ];

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
    ? highlights
        .map((highlight) => `${highlight.stationName}: ${highlight.title}`)
        .join(" | ")
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
