import { brandBlue } from "../../constants/theme";
import { useTheme } from "../../context/ThemeContext";
import { getSheetPalette, type SheetPalette } from "../route-sheet/sheetPalette";

/**
 * Colours for full pages (Hesabım, Oturumlar, their subpages): the route
 * sheet's iOS semantic colours, with the opaque grouped background and cells
 * of a Settings-style page instead of the sheet's see-through ones, and the
 * brand blue as the accent.
 */
export type PagePalette = SheetPalette & {
  /** systemGroupedBackground. */
  background: string;
  accent: string;
  /** The accent at low alpha, behind an accent glyph. */
  accentFill: string;
};

// Module constants, so memoised rows receive the same object on every render.
const LIGHT: PagePalette = {
  ...getSheetPalette(false),
  background: "#F2F2F7",
  cell: "#FFFFFF",
  cellPressed: "#D1D1D6",
  separator: "rgba(60,60,67,0.29)",
  accent: brandBlue,
  accentFill: "rgba(0,147,201,0.12)",
};

const DARK: PagePalette = {
  ...getSheetPalette(true),
  background: "#000000",
  cell: "#1C1C1E",
  cellPressed: "#3A3A3C",
  separator: "rgba(84,84,88,0.6)",
  accent: brandBlue,
  accentFill: "rgba(0,147,201,0.22)",
};

export const getPagePalette = (isDark: boolean): PagePalette => (isDark ? DARK : LIGHT);

/**
 * The accent for a glyph or label drawn ON a glass control (the tab bar's
 * selected tab, the header's active glyphs). The brand blue is too dark on
 * light glass (about 2.5:1) and too dim on dark glass over a dark map (about
 * 4:1), so each scheme gets the brand hue at a luminance that reads: about
 * 5:1 on light glass and about 6:1 on dark.
 */
export const accentOnGlass = (isDark: boolean) => (isDark ? "#4DB6DE" : "#00729C");

/** The page palette for the app's own light/dark setting (Görünüm), not the system's. */
export function usePagePalette(): PagePalette {
  const { themeScheme } = useTheme();
  return getPagePalette(themeScheme === "dark");
}
