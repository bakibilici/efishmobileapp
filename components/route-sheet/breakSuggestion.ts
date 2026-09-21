import Ionicons from "@expo/vector-icons/Ionicons";

import type { RoutePlanInterestHighlight } from "../../services/DriveSessionStore";
import { keptAlternatives } from "../../services/routePersonalization";

export type BreakTone = "warm" | "cool" | "neutral";

type IoniconName = keyof typeof Ionicons.glyphMap;

// Food and drink read warm, outdoor and movement read cool, like the orb's two
// ribbons. Matched on the Ionicons name first, then on the interest key.
const WARM_ICON_PREFIXES = [
  "cafe",
  "restaurant",
  "ice-cream",
  "pizza",
  "fast-food",
  "beer",
  "wine",
  "nutrition",
  "fish",
];
const COOL_ICON_PREFIXES = [
  "walk",
  "leaf",
  "image",
  "fitness",
  "barbell",
  "bicycle",
  "football",
  "tennisball",
  "basketball",
  "trail-sign",
  "flower",
  "partly-sunny",
  "sunny",
  "water",
  "boat",
];
const WARM_INTEREST_KEYS = new Set(["coffee", "food", "meal", "dessert"]);
const COOL_INTEREST_KEYS = new Set([
  "walk",
  "park",
  "scenic",
  "view",
  "viewpoint",
  "sport",
]);

export const breakTone = (highlight: RoutePlanInterestHighlight): BreakTone => {
  const icon = (highlight.icon || "").toLowerCase();
  if (WARM_ICON_PREFIXES.some((prefix) => icon.startsWith(prefix))) return "warm";
  if (COOL_ICON_PREFIXES.some((prefix) => icon.startsWith(prefix))) return "cool";

  const key = (highlight.interestKey || "").toLowerCase();
  if (WARM_INTEREST_KEYS.has(key)) return "warm";
  if (COOL_INTEREST_KEYS.has(key)) return "cool";
  return "neutral";
};

/** The highlight's own category icon; a missing, unknown or sparkles name falls back to a plain pin. */
export const breakIconName = (icon?: string): IoniconName => {
  if (icon && !icon.startsWith("sparkles") && icon in Ionicons.glyphMap) {
    return icon as IoniconName;
  }
  return "location-outline";
};

/**
 * Whether the highlight names a place that exists. The gateway sends
 * poi_source 'none' with an empty name when it only has a generic suggestion;
 * a highlight mapped without the flag is trusted only when it carries a name.
 */
export const hasRealPlace = (highlight: RoutePlanInterestHighlight): boolean => {
  if (!highlight.poiName?.trim()) return false;
  return highlight.poiSource ? highlight.poiSource === "places" : true;
};

export const formatWalkDistance = (meters?: number): string | null => {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  if (meters < 1000) return `~${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `~${(meters / 1000).toFixed(1).replace(".", ",")} km`;
};

/** "Keddy's Cafe · ~350 m", or null when the place is not a real one. */
export const formatPlaceLine = (
  highlight: RoutePlanInterestHighlight,
): string | null => {
  if (!hasRealPlace(highlight)) return null;
  const name = highlight.poiName!.trim();
  const distance = formatWalkDistance(highlight.distanceM);
  return distance ? `${name} · ${distance}` : name;
};

/** "Diğer seçenekler: …", leaving out every alternative of a kind the driver ruled out. */
export const formatAlternatives = (
  highlight: RoutePlanInterestHighlight,
  excludedKinds: readonly string[] = [],
): string | null => {
  const names = (keptAlternatives(highlight.alternatives, excludedKinds) ?? [])
    .map((alternative) => (alternative?.name || alternative?.title || "").trim())
    .filter(Boolean);
  if (!names.length) return null;
  return `Diğer seçenekler: ${names.join(", ")}`;
};
