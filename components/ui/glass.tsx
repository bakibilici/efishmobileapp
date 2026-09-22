import { BlurView } from "expo-blur";
import { requireOptionalNativeModule } from "expo";
import type { GlassViewProps } from "expo-glass-effect";
import React, { type ComponentType, type ReactNode } from "react";
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "../../context/ThemeContext";

/**
 * iOS 26's Liquid Glass view, or null. Loaded defensively: a dev client
 * built before expo-glass-effect was added has no ExpoGlassEffect native
 * module, and importing the package there would throw, so the module is
 * only required once the native side is known to exist. Beta builds of
 * iOS 26 without the glass API (expo/expo#40911) also get null.
 */
export const LiquidGlassView: ComponentType<GlassViewProps> | null = (() => {
  if (Platform.OS !== "ios") return null;
  try {
    if (!requireOptionalNativeModule("ExpoGlassEffect")) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const glass = require("expo-glass-effect") as typeof import("expo-glass-effect");
    return glass.isGlassEffectAPIAvailable() && glass.isLiquidGlassAvailable()
      ? glass.GlassView
      : null;
  } catch {
    return null;
  }
})();

/** Whether this build draws real Liquid Glass (false: the frosted fallback). */
export const hasLiquidGlass = LiquidGlassView !== null;

/** iOS 26 or later: the system draws its own glass chrome (nav bars, search). */
export const isIOS26 =
  Platform.OS === "ios" && parseInt(String(Platform.Version), 10) >= 26;

/**
 * A Liquid Glass shape for the control layer only (tab bar, floating
 * actions, a sheet's close button), never for content. Children sit inside
 * the glass.
 *
 * Where the system has no Liquid Glass it falls back: on older iOS a blur
 * with a light or dark wash and a hairline edge; on Android, where expo-blur
 * does not blur, an opaque fill lifted by elevation. With `tintColor` the
 * fallback is filled with that colour instead.
 *
 * Never put it under an ancestor whose opacity is 0 or animated: the glass
 * then stops drawing (expo/expo#41024). Animate transforms only.
 */
export function GlassSurface({
  radius,
  style,
  tintColor,
  interactive = false,
  children,
}: {
  radius: number;
  style?: StyleProp<ViewStyle>;
  tintColor?: string;
  interactive?: boolean;
  children?: ReactNode;
}) {
  const { themeScheme } = useTheme();
  const isDark = themeScheme === "dark";
  const Glass = LiquidGlassView;

  if (Glass) {
    return (
      <Glass
        // Props do not re-apply to a glass view already drawn
        // (expo/expo#43743): a change of scheme or tint makes a new one.
        key={`${themeScheme}-${tintColor ?? "none"}-${interactive ? 1 : 0}`}
        glassEffectStyle="regular"
        tintColor={tintColor}
        isInteractive={interactive}
        // The app has its own light/dark switch; follow it, not the system.
        colorScheme={themeScheme}
        style={[{ borderRadius: radius }, style]}
      >
        {children}
      </Glass>
    );
  }

  if (Platform.OS === "android") {
    return (
      <View
        style={[
          styles.androidLift,
          {
            borderRadius: radius,
            backgroundColor: tintColor ?? (isDark ? "#1C1C1E" : "#FFFFFF"),
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.frostedShadow, { borderRadius: radius }, style]}>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.clip,
          {
            borderRadius: radius,
            borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)",
          },
        ]}
      >
        {/* A tinted shape is filled with its colour: no blur shows through. */}
        {tintColor ? null : (
          <BlurView
            tint={isDark ? "dark" : "light"}
            intensity={80}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor:
                tintColor ?? (isDark ? "rgba(28,28,30,0.6)" : "rgba(255,255,255,0.6)"),
            },
          ]}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Lifts the frosted shape off the content; Liquid Glass brings its own depth.
  frostedShadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  androidLift: {
    elevation: 8,
  },
  clip: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
