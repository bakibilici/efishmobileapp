import { Platform } from "react-native";

import { Colors } from "../../constants/theme";

/**
 * Colours for the frosted route sheet. The chrome (glass, handle, preview
 * bar) keeps the app theme; the content uses iOS semantic colours so it reads
 * like a grouped inset list. Both palettes are module constants, so memoised
 * rows receive the same object on every render.
 */
export type SheetPalette = {
  isDark: boolean;

  // Chrome: the preview bar, the handle and the one blur behind everything.
  text: string;
  textSecondary: string;
  textTertiary: string;
  /** The back pills' surface. */
  surface: string;
  hairline: string;
  handle: string;
  blurTint: "light" | "dark";
  blurIntensity: number;
  /** Colour laid over the blur; near-opaque on Android, where expo-blur does not blur. */
  wash: string;
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
  text: Colors.light.text,
  textSecondary: Colors.light.textSecondary,
  textTertiary: Colors.light.textTertiary,
  surface: isAndroid ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.62)",
  hairline: "rgba(0,35,49,0.08)",
  handle: "rgba(0,35,49,0.18)",
  blurTint: "light",
  blurIntensity: 80,
  wash: isAndroid ? "rgba(246,248,251,0.97)" : "rgba(248,250,252,0.72)",
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
  text: Colors.dark.text,
  textSecondary: Colors.dark.textSecondary,
  textTertiary: Colors.dark.textTertiary,
  surface: isAndroid ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.06)",
  hairline: "rgba(255,255,255,0.09)",
  handle: "rgba(255,255,255,0.24)",
  blurTint: "dark",
  blurIntensity: 70,
  wash: isAndroid ? "rgba(13,19,32,0.97)" : "rgba(13,19,32,0.72)",
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
