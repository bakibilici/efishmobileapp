import Ionicons from "@expo/vector-icons/Ionicons";

import type {
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
} from "../../services/DriveSessionStore";
import { highlightKind, type BreakKind } from "../../services/routePersonalization";
import {
  alternativeKindOf,
  formatWalkDistance,
  hasRealPlace,
  listedAlternatives,
} from "./breakDetail";
import type { SheetPalette } from "./sheetPalette";

// The plain helpers live in breakDetail.ts (checked under tsx); callers keep importing them here.
export {
  formatWalkDistance,
  hasRealPlace,
  placeName,
  shortWalkDistance,
} from "./breakDetail";

type IoniconName = keyof typeof Ionicons.glyphMap;

type TintKey = "orange" | "brown" | "pink" | "green" | "teal" | "indigo" | "gray" | "red";

/** Settings-style tile colour per kind of break. */
const KIND_TINT: Record<BreakKind, TintKey> = {
  food: "orange",
  coffee: "brown",
  dessert: "pink",
  park: "green",
  viewpoint: "teal",
  worship: "indigo",
  restroom: "gray",
  shopping: "pink",
  sport: "red",
};

const KIND_GLYPH: Record<BreakKind, IoniconName> = {
  food: "restaurant",
  coffee: "cafe",
  dessert: "ice-cream",
  park: "walk",
  viewpoint: "image",
  worship: "moon",
  restroom: "accessibility",
  shopping: "bag-handle",
  sport: "barbell",
};

// A highlight whose key and POI category say nothing is read off its icon.
const ICON_KIND: [prefix: string, kind: BreakKind][] = [
  ["cafe", "coffee"],
  ["restaurant", "food"],
  ["pizza", "food"],
  ["fast-food", "food"],
  ["fish", "food"],
  ["ice-cream", "dessert"],
  ["walk", "park"],
  ["leaf", "park"],
  ["trail-sign", "park"],
  ["happy", "park"],
  ["image", "viewpoint"],
  ["camera", "viewpoint"],
  ["binoculars", "viewpoint"],
  ["bag", "shopping"],
  ["cart", "shopping"],
  ["fitness", "sport"],
  ["barbell", "sport"],
  ["bicycle", "sport"],
];

/** The highlight's own icon name; a missing, unknown or sparkles name falls back to a plain pin. */
export const breakIconName = (icon?: string): IoniconName => {
  if (icon && !icon.startsWith("sparkles") && icon in Ionicons.glyphMap) {
    return icon as IoniconName;
  }
  return "location-outline";
};

const filledGlyph = (icon?: string): IoniconName | null => {
  if (!icon || icon.startsWith("sparkles")) return null;
  const filled = icon.replace(/-(outline|sharp)$/, "");
  if (filled in Ionicons.glyphMap) return filled as IoniconName;
  return icon in Ionicons.glyphMap ? (icon as IoniconName) : null;
};

const breakKind = (highlight: RoutePlanInterestHighlight): BreakKind | null => {
  const kind = highlightKind(highlight);
  if (kind) return kind;
  const icon = (highlight.icon || "").toLowerCase();
  return ICON_KIND.find(([prefix]) => icon.startsWith(prefix))?.[1] ?? null;
};

/** The tile a break suggestion is drawn with: category colour and a filled white glyph. */
export const breakTile = (
  highlight: RoutePlanInterestHighlight,
  palette: SheetPalette,
): { color: string; glyph: IoniconName } => {
  const kind = breakKind(highlight);
  return {
    color: kind ? palette[KIND_TINT[kind]] : palette.gray,
    glyph: filledGlyph(highlight.icon) ?? (kind ? KIND_GLYPH[kind] : "location"),
  };
};

/** An alternative's tile: its category's colour and glyph, a grey pin when the category is unknown. */
export const alternativeTile = (
  alternative: RoutePlanHighlightAlternative,
  palette: SheetPalette,
): { color: string; glyph: IoniconName } => {
  const kind = alternativeKindOf(alternative);
  return kind
    ? { color: palette[KIND_TINT[kind]], glyph: KIND_GLYPH[kind] }
    : { color: palette.gray, glyph: "location" };
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

/**
 * "Diğer: …", leaving out every alternative of a kind the driver ruled out:
 * the same options the detail page lists (listedAlternatives).
 */
export const formatAlternatives = (
  highlight: RoutePlanInterestHighlight,
  excludedKinds: readonly string[] = [],
): string | null => {
  const names = listedAlternatives(highlight.alternatives, excludedKinds)
    .map((alternative) => (alternative.name?.trim() || alternative.title?.trim() || ""))
    .filter(Boolean);
  if (!names.length) return null;
  return `Diğer: ${names.join(", ")}`;
};
