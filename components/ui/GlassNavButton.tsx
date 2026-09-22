import { BlurView } from "expo-blur";
import React, { memo, useEffect, useRef } from "react";
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
import { LiquidGlassView } from "./glass";
import { IconSymbol } from "./icon-symbol";

const DEFAULT_SIZE = 44;
/** The smallest touch target (HIG): a smaller circle is tapped anywhere in a square this big around it. */
const MIN_TOUCH_SIZE = 44;
/** The xmark is wider than the chevron at the same size: drawn a little smaller, it weighs the same. */
const GLYPH_SIZE = { "chevron.left": 18, xmark: 15 } as const;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 140;

/**
 * A circular toolbar button (44 pt unless `size` says otherwise): the
 * standard Back (a chevron, the default) or Close (`symbol="xmark"`) of a
 * floating navigation bar or a sheet: Liquid Glass (regular, interactive) on
 * iOS 26, else a frosted circle with a hairline edge. Icon only, so it always
 * needs `accessibilityLabel` ("Oturumlara dön", "Kapat").
 *
 * `material="frosted"` always draws the frosted circle: for a button inside
 * another material (a blurred header) or under an ancestor whose opacity
 * animates, where Liquid Glass does not draw (expo/expo#41024) and glass on
 * a blur would be a material on a material.
 *
 * It lays out as a `size` circle, but a smaller one is tapped anywhere in the
 * 44 pt square around it: the touch area is the button's own frame, pulled
 * back to `size` by negative margins. A hitSlop would not do, because the
 * New Architecture's hit test drops touches outside a parent's bounds.
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
  material = "auto",
  symbol = "chevron.left",
  style,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  /** VoiceOver's two-finger scrub while the button has focus. */
  onAccessibilityEscape?: () => void;
  visible?: boolean;
  size?: number;
  /** "auto": Liquid Glass where the system draws it, else frosted. "frosted": always frosted. */
  material?: "auto" | "frosted";
  /** "chevron.left": one level back. "xmark": closes a sheet or a modal view. */
  symbol?: "chevron.left" | "xmark";
  style?: StyleProp<ViewStyle>;
}) {
  const { themeScheme } = useTheme();
  const isDark = themeScheme === "dark";
  const Glass = material === "auto" ? LiquidGlassView : null;
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
    <IconSymbol name={symbol} size={GLYPH_SIZE[symbol]} weight="semibold" color={glyphColor} />
  );
  const circle = { width: size, height: size, borderRadius: size / 2 };
  const touchSize = Math.max(size, MIN_TOUCH_SIZE);
  const touchArea = { width: touchSize, height: touchSize };

  return (
    <Animated.View
      pointerEvents={visible ? "box-none" : "none"}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
      style={[
        touchArea,
        { margin: -(touchSize - size) / 2 },
        // A glass view under a changing opacity (or one that starts at 0)
        // stops drawing its glass (expo/expo#41024): the glass fades through
        // its own style and only the chevron through opacity.
        !Glass && { opacity },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onAccessibilityEscape={onAccessibilityEscape}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        style={({ pressed }) => [
          touchArea,
          styles.center,
          // The glass answers a touch by itself; the frosted circle dims.
          !Glass && pressed && styles.pressed,
        ]}
      >
        {Glass ? (
          <Glass
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
          </Glass>
        ) : (
          <View style={[circle, styles.fallbackShadow]}>
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
