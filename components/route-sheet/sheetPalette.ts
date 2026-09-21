import { Platform } from "react-native";

import { Colors } from "../../constants/theme";

/**
 * Colours for the frosted route sheet. Text and accent come from the app
 * theme; the warm and cool accents are the assistant orb's ribbons, used at
 * low opacity so the sheet stays calm. Both palettes are module constants, so
 * memoised rows receive the same object on every render.
 */
export type SheetPalette = {
  isDark: boolean;
  text: string;
  textSecondary: string;
  textTertiary: string;
  accent: string;
  accentSoft: string;
  /** Card surface over the blurred sheet. */
  surface: string;
  /** Tiles nested inside a card. */
  surfaceMuted: string;
  hairline: string;
  handle: string;
  blurTint: "light" | "dark";
  blurIntensity: number;
  /** Colour laid over the blur; near-opaque on Android, where expo-blur does not blur. */
  wash: string;
  sheetEdge: string;
  warm: string;
  warmSoft: string;
  cool: string;
  coolSoft: string;
  neutral: string;
  neutralSoft: string;
  energyHigh: string;
  energyLow: string;
  energyCharge: string;
  track: string;
  timeline: string;
  stationDot: string;
};

const isAndroid = Platform.OS === "android";

export const ORB_WARM = "#F5A25D";
export const ORB_COOL = "#6FA8FF";

const LIGHT: SheetPalette = {
  isDark: false,
  text: Colors.light.text,
  textSecondary: Colors.light.textSecondary,
  textTertiary: Colors.light.textTertiary,
  accent: Colors.light.primary,
  accentSoft: "rgba(0,147,201,0.10)",
  surface: isAndroid ? "rgba(255,255,255,0.78)" : "rgba(255,255,255,0.62)",
  surfaceMuted: "rgba(0,35,49,0.035)",
  hairline: "rgba(0,35,49,0.08)",
  handle: "rgba(0,35,49,0.18)",
  blurTint: "light",
  blurIntensity: 80,
  wash: isAndroid ? "rgba(246,248,251,0.97)" : "rgba(248,250,252,0.72)",
  sheetEdge: "rgba(0,35,49,0.10)",
  warm: "#C8712C",
  warmSoft: "rgba(245,162,93,0.18)",
  cool: "#3D7FE0",
  coolSoft: "rgba(111,168,255,0.18)",
  neutral: Colors.light.textSecondary,
  neutralSoft: "rgba(88,122,153,0.12)",
  energyHigh: "#1F9D6B",
  energyLow: "#D9793A",
  energyCharge: Colors.light.primary,
  track: "rgba(0,35,49,0.07)",
  timeline: "rgba(0,35,49,0.16)",
  stationDot: "#E3894A",
};

const DARK: SheetPalette = {
  isDark: true,
  text: Colors.dark.text,
  textSecondary: Colors.dark.textSecondary,
  textTertiary: Colors.dark.textTertiary,
  accent: Colors.dark.primary,
  accentSoft: "rgba(0,147,201,0.18)",
  surface: isAndroid ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.06)",
  surfaceMuted: "rgba(255,255,255,0.045)",
  hairline: "rgba(255,255,255,0.09)",
  handle: "rgba(255,255,255,0.24)",
  blurTint: "dark",
  blurIntensity: 70,
  wash: isAndroid ? "rgba(13,19,32,0.97)" : "rgba(13,19,32,0.72)",
  sheetEdge: "rgba(255,255,255,0.10)",
  warm: "#F5B27A",
  warmSoft: "rgba(245,162,93,0.16)",
  cool: "#9CC3FF",
  coolSoft: "rgba(111,168,255,0.16)",
  neutral: Colors.dark.textSecondary,
  neutralSoft: "rgba(155,161,166,0.14)",
  energyHigh: "#4ACB93",
  energyLow: ORB_WARM,
  energyCharge: ORB_COOL,
  track: "rgba(255,255,255,0.08)",
  timeline: "rgba(255,255,255,0.18)",
  stationDot: "#E3894A",
};

export const getSheetPalette = (isDark: boolean): SheetPalette =>
  isDark ? DARK : LIGHT;
