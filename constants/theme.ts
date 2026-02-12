/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from "react-native";

const brandGreen = "#2CDD9D";
const tintColorLight = brandGreen;
const tintColorDark = brandGreen;

const navy = "#0f2f4f";
const navyDark = "#E6FFF5";

export const Colors = {
  light: {
    text: "#0f2f4f",
    textSecondary: "#64748b",
    textTertiary: "#94a3b8",
    background: "#ffffff",
    backgroundSecondary: "#f8fafc",
    card: "#ffffff",
    cardBorder: "#f1f5f9",
    border: "#e2e8f0",
    primary: brandGreen,
    primaryText: "#fff",
    tint: tintColorLight,
    icon: "#0F4733",
    inputBackground: "#f8f9fa",
    inputBorder: "#e9ecef",
    tabIconDefault: "#98B2A7",
    tabIconSelected: tintColorLight,
    shadow: navy,
    shadowOpacity: 0.12,
    success: "#34C759",
    warning: "#FF9500",
    danger: "#FF3B30",
  },
  dark: {
    text: "#ECEDEE",
    textSecondary: "#9BA1A6",
    textTertiary: "#6d7d86",
    background: "#000000",
    backgroundSecondary: "#121212",
    card: "#121212",
    cardBorder: "#2C2C2E",
    border: "#2C2C2E",
    primary: brandGreen,
    primaryText: "#000000",
    tint: tintColorDark,
    icon: "#6e6e6e",
    inputBackground: "#1C1C1E",
    inputBorder: "#2C2C2E",
    tabIconDefault: "#6e6e6e",
    tabIconSelected: tintColorDark,
    shadow: "#000",
    shadowOpacity: 0.3,
    success: "#34C759",
    warning: "#FF9F2E",
    danger: "#FF453A",
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: "system-ui",
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: "ui-serif",
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: "ui-rounded",
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded:
      "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
