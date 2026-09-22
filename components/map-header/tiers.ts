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

export const TIER_BOLTS: Record<StationType, number> = { HPC: 3, DC: 2, AC: 1 };

export { accentOnGlass } from "../ui/pagePalette";
