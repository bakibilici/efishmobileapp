/**
 * The charger tiers as the map draws them: the pin PNGs' own colours and
 * bolt counts, shared by the pins, the header's chips and its lists.
 *
 * Pure (type-only imports), so scripts/check-map-header.ts runs it under tsx.
 */
import type { StationType } from "../../constants/stations";

export const TIERS: readonly StationType[] = ["HPC", "DC", "AC"];

export const TIER_COLORS: Record<StationType, string> = {
  HPC: "#7C4DFF",
  DC: "#FF8A1F",
  AC: "#4BACE4",
};

/**
 * The fill a *selected* chip is tinted with. The pin colours above are
 * chosen against the map, and white on them fails WCAG AA for text
 * (DC 2,2:1, AC 2,5:1); these are the same hues darkened until white
 * clears 4,5:1. The pins and the unselected chips' bolts keep TIER_COLORS.
 */
export const TIER_SELECTED_COLORS: Record<StationType, string> = {
  HPC: "#7C4DFF",
  DC: "#B35600",
  AC: "#0E6C99",
};

export const TIER_BOLTS: Record<StationType, number> = { HPC: 3, DC: 2, AC: 1 };

// accentOnGlass lives with the page palette (51caf5d). It is not re-exported
// here: pagePalette reaches React Native through the theme context, and that
// would cost this module the purity the header comment promises — tsx cannot
// parse React Native's Flow source, so check-map-header.ts would not run.
// The map header's components import it from "../ui/pagePalette" directly.
