import { Platform } from "react-native";

/**
 * Colours for the frosted route sheet. The chrome (glass, handle) keeps the
 * app's look; the content uses iOS semantic colours so it reads like a
 * grouped inset list. Both palettes are module constants, so memoised rows
 * receive the same object on every render.
 */
export type SheetPalette = {
  isDark: boolean;

  // Chrome: the handle and the one blur behind everything.
  handle: string;
  blurTint: "light" | "dark";
  blurIntensity: number;
  /** Colour laid over the blur; near-opaque on Android, where expo-blur does not blur. */
  wash: string;
  /**
   * The sheet at its highest stop, as Find My's full-height sheet: the glass
   * gives way to an almost opaque fill (faded in over the wash as the sheet
   * rises from the middle stop): the grouped background in light, the
   * wash's own navy in dark, so the sheet does not change colour as it rises.
   */
  topFill: string;
  sheetEdge: string;

  // Content: iOS semantic colours.
  label: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  separator: string;
  /** Grouped cell over the blur. */
  cell: string;
  cellPressed: string;
  /** Unfilled capsule track, chart baseline. */
  fill: string;
  /** The route list's connecting line. */
  rail: string;

  blue: string;
  green: string;
  orange: string;
  red: string;
  teal: string;
  indigo: string;
  brown: string;
  pink: string;
  gray: string;
  /** Charging stops, matching the map's station markers. */
  station: string;
};

const isAndroid = Platform.OS === "android";

const LIGHT: SheetPalette = {
  isDark: false,
  handle: "rgba(0,35,49,0.18)",
  blurTint: "light",
  blurIntensity: 80,
  wash: isAndroid ? "rgba(246,248,251,0.97)" : "rgba(248,250,252,0.72)",
  // systemGroupedBackground: the white cells stand out on it as in Settings.
  topFill: "rgba(242,242,247,0.96)",
  sheetEdge: "rgba(0,35,49,0.10)",

  label: "#1C1C1E",
  secondaryLabel: "rgba(60,60,67,0.6)",
  tertiaryLabel: "rgba(60,60,67,0.3)",
  separator: "rgba(60,60,67,0.18)",
  cell: isAndroid ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.72)",
  cellPressed: "rgba(120,120,128,0.16)",
  fill: "rgba(120,120,128,0.16)",
  rail: "rgba(60,60,67,0.2)",

  blue: "#007AFF",
  green: "#34C759",
  orange: "#FF9500",
  red: "#FF3B30",
  teal: "#30B0C7",
  indigo: "#5856D6",
  brown: "#A2845E",
  pink: "#FF2D55",
  gray: "#8E8E93",
  station: "#FF6B35",
};

const DARK: SheetPalette = {
  isDark: true,
  handle: "rgba(255,255,255,0.24)",
  blurTint: "dark",
  blurIntensity: 70,
  wash: isAndroid ? "rgba(13,19,32,0.97)" : "rgba(13,19,32,0.72)",
  // The wash's own navy, almost opaque: rising, the sheet only loses its
  // see-through and keeps its colour (a neutral grey here shifted it in hue).
  topFill: "rgba(13,19,32,0.96)",
  sheetEdge: "rgba(255,255,255,0.10)",

  label: "#FFFFFF",
  secondaryLabel: "rgba(235,235,245,0.6)",
  tertiaryLabel: "rgba(235,235,245,0.3)",
  separator: "rgba(84,84,88,0.55)",
  cell: isAndroid ? "rgba(44,44,46,0.92)" : "rgba(44,44,46,0.62)",
  cellPressed: "rgba(120,120,128,0.32)",
  fill: "rgba(118,118,128,0.24)",
  rail: "rgba(235,235,245,0.2)",

  blue: "#0A84FF",
  green: "#30D158",
  orange: "#FF9F0A",
  red: "#FF453A",
  teal: "#40C8E0",
  indigo: "#5E5CE6",
  brown: "#AC8E68",
  pink: "#FF375F",
  gray: "#8E8E93",
  station: "#FF6B35",
};

export const getSheetPalette = (isDark: boolean): SheetPalette =>
  isDark ? DARK : LIGHT;

/**
 * The same content on the system sheet (iOS 26, app/route-sheet.tsx), which
 * draws its own material: Liquid Glass at the lower stops, opaque white
 * (#1C1C1E in dark) at the full height. White cells vanished on that white,
 * so the grouped cells are the system's translucent grey fill instead,
 * readable on the glass and on the opaque top alike. The chrome fields
 * (handle, blur, wash, topFill, edge) are unused there.
 */
const NATIVE_LIGHT: SheetPalette = {
  ...LIGHT,
  cell: "rgba(118,118,128,0.12)",
  cellPressed: "rgba(118,118,128,0.24)",
};

const NATIVE_DARK: SheetPalette = {
  ...DARK,
  cell: "rgba(118,118,128,0.24)",
  cellPressed: "rgba(118,118,128,0.36)",
};

export const getNativeSheetPalette = (isDark: boolean): SheetPalette =>
  isDark ? NATIVE_DARK : NATIVE_LIGHT;
