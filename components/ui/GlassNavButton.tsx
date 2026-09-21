import { BlurView } from "expo-blur";
import { requireOptionalNativeModule } from "expo";
import type { GlassViewProps } from "expo-glass-effect";
import React, { memo, useEffect, useRef, type ComponentType } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { IconSymbol } from "./icon-symbol";

const DEFAULT_SIZE = 44;
const GLYPH_SIZE = 18;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 140;

/**
 * iOS 26's Liquid Glass view, or null. Loaded defensively: a dev client
 * built before expo-glass-effect was added has no ExpoGlassEffect native
 * module, and importing the package there would throw, so the module is
 * only required once the native side is known to exist. Beta builds of
 * iOS 26 without the glass API (expo/expo#40911) also get null.
 */
const LiquidGlassView: ComponentType<GlassViewProps> | null = (() => {
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

/**
 * A circular toolbar button with a chevron (44 pt unless `size` says
 * otherwise), the back button of a floating navigation bar: Liquid Glass
 * (regular, interactive) on iOS 26, else a frosted circle with a hairline
 * edge. Icon only, so it always needs `accessibilityLabel` ("Oturumlara dön").
 *
 * `visible` fades it in and out; while hidden it takes no touches and is
 * hidden from VoiceOver.
 */
function GlassNavButtonComponent({
  onPress,
  accessibilityLabel,
  accessibilityHint,
  onAccessibilityEscape,
  visible = true,
  size = DEFAULT_SIZE,
  style,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** VoiceOver's two-finger scrub while the button has focus. */
  onAccessibilityEscape?: () => void;
  visible?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { themeScheme } = useTheme();
  const isDark = themeScheme === "dark";
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? FADE_IN_MS : FADE_OUT_MS,
      useNativeDriver: true,
    }).start();
  }, [opacity, visible]);

  // iOS label colour: black on light glass, white on dark.
  const glyphColor = isDark ? "#FFFFFF" : "#000000";
  const glyph = (
    <IconSymbol name="chevron.left" size={GLYPH_SIZE} weight="semibold" color={glyphColor} />
  );
  const circle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[
        circle,
        !LiquidGlassView && styles.fallbackShadow,
        // A glass view under a changing opacity (or one that starts at 0)
        // stops drawing its glass (expo/expo#41024): the glass fades through
        // its own style and only the chevron through opacity.
        !LiquidGlassView && { opacity },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onAccessibilityEscape={onAccessibilityEscape}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [
          circle,
          // The glass answers a touch by itself; the fallback dims.
          !LiquidGlassView && pressed && styles.pressed,
        ]}
      >
        {LiquidGlassView ? (
          <LiquidGlassView
            // A theme change does not re-apply to a glass view already drawn
            // (expo/expo#43743): a new one is made instead.
            key={isDark ? "glass-dark" : "glass-light"}
            glassEffectStyle={{
              style: visible ? "regular" : "none",
              animate: true,
              animationDuration: (visible ? FADE_IN_MS : FADE_OUT_MS) / 1000,
            }}
            isInteractive
            // The app has its own light/dark switch; follow it, not the system.
            colorScheme={isDark ? "dark" : "light"}
            style={[circle, styles.center]}
          >
            <Animated.View style={{ opacity }}>{glyph}</Animated.View>
          </LiquidGlassView>
        ) : (
          <View
            style={[
              circle,
              styles.clip,
              {
                borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.10)",
              },
            ]}
          >
            <BlurView
              tint={isDark ? "dark" : "light"}
              intensity={Platform.OS === "ios" ? 60 : 0}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                styles.center,
                {
                  backgroundColor: isDark
                    ? Platform.OS === "ios"
                      ? "rgba(44,44,46,0.55)"
                      : "rgba(44,44,46,0.94)"
                    : Platform.OS === "ios"
                      ? "rgba(255,255,255,0.55)"
                      : "rgba(255,255,255,0.94)",
                },
              ]}
            >
              {glyph}
            </View>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

export const GlassNavButton = memo(GlassNavButtonComponent);

const styles = StyleSheet.create({
  // Lifts the frosted circle off a busy map; Liquid Glass brings its own depth.
  fallbackShadow: {
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  clip: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
});
