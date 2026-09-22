import { LinearGradient } from "expo-linear-gradient";
import React, { type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassSurface, hasLiquidGlass } from "./glass";
import { usePagePalette } from "./pagePalette";

const BUTTON_HEIGHT = 50;
const BAR_TOP = 24;
const BAR_GAP = 8;
const MIN_BOTTOM = 16;

/**
 * A page's one main action, pinned at the bottom (BottomActionBar): a
 * full-width Liquid Glass capsule tinted with the brand blue, or red for a
 * destructive action, with a white label. Disabled it is plain glass with a
 * grey label; loading it shows a spinner with `loadingTitle` and ignores
 * presses. The glass never changes opacity (it would stop drawing).
 */
export function GlassCapsuleButton({
  title,
  onPress,
  tone = "accent",
  disabled = false,
  loading = false,
  loadingTitle,
  accessibilityHint,
  style,
}: {
  title: string;
  onPress: () => void;
  tone?: "accent" | "destructive";
  disabled?: boolean;
  loading?: boolean;
  loadingTitle?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePagePalette();
  const tint = disabled ? undefined : tone === "destructive" ? palette.red : palette.accent;
  const labelColor = disabled ? palette.tertiaryLabel : "#FFFFFF";
  const shownTitle = loading && loadingTitle ? loadingTitle : title;

  return (
    <Pressable
      onPress={loading || disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={shownTitle}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        // Liquid Glass answers a touch by itself; the fallback dims.
        !hasLiquidGlass && pressed && !loading && !disabled && styles.pressed,
        style,
      ]}
    >
      <GlassSurface
        radius={BUTTON_HEIGHT / 2}
        tintColor={tint}
        interactive={!disabled}
        style={styles.capsule}
      >
        {loading ? <ActivityIndicator color={labelColor} /> : null}
        <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>
          {shownTitle}
        </Text>
      </GlassSurface>
    </Pressable>
  );
}

/** `#RRGGBB` at alpha 0: a gradient from it stays in its hue instead of passing through grey. */
function clearOf(hex: string): string {
  const value = parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255},${(value >> 8) & 255},${value & 255},0)`;
}

/**
 * Holds a page's pinned actions at the bottom, over the scrolling content:
 * the page background fades in behind them, so the last rows slide under
 * the button instead of meeting it at a hard edge. Children stack
 * vertically. Pair the page's scroll padding with useBottomActionBarInset().
 */
export function BottomActionBar({ children }: { children: ReactNode }) {
  const palette = usePagePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, MIN_BOTTOM) }]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[clearOf(palette.background), palette.background]}
        locations={[0, 0.45]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

/**
 * Bottom padding for a scroll view under a BottomActionBar holding one
 * button. On iOS the scroll view already adds the bottom safe area
 * (contentInsetAdjustmentBehavior "automatic"): it is taken off.
 */
export function useBottomActionBarInset(): number {
  const insets = useSafeAreaInsets();
  const inset = BAR_TOP + BUTTON_HEIGHT + Math.max(insets.bottom, MIN_BOTTOM) + BAR_GAP;
  return Platform.OS === "ios" ? inset - insets.bottom : inset;
}

const styles = StyleSheet.create({
  button: {
    alignSelf: "stretch",
    height: BUTTON_HEIGHT,
  },
  pressed: {
    opacity: 0.7,
  },
  capsule: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  label: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: -0.4,
  },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: BAR_TOP,
    gap: BAR_GAP,
  },
});
