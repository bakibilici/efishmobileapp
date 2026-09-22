import type { BottomSheetBackgroundProps } from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { useTheme } from "../../context/ThemeContext";
import { useSheetMotion } from "./sheetMotion";
import { getSheetPalette } from "./sheetPalette";

export const SHEET_RADIUS = 32;
/** The corners at the highest stop: a full-height iOS sheet rounds less. */
const TOP_STOP_RADIUS = 24;

/**
 * The route sheet's only blur: one BlurView behind all content, washed with
 * white (light) or deep navy (dark). Cards on top are plain translucent
 * views, so scrolling never composites more than this one effect view.
 *
 * Rising from the middle stop to the highest one, an almost opaque fill
 * (palette.topFill) fades in over the glass (Find My's full-height sheet), and the
 * corners tighten a little. Both follow the sheet's position on the UI
 * thread; the blur itself never changes.
 */
function SheetGlassBackgroundComponent({ style }: BottomSheetBackgroundProps) {
  const { themeScheme } = useTheme();
  const palette = getSheetPalette(themeScheme === "dark");
  const motion = useSheetMotion();
  // Outside a route sheet (no motion given) the glass stays as it is.
  const resting = useSharedValue(0);
  const progress = motion?.topProgress ?? resting;

  const shapeStyle = useAnimatedStyle(() => {
    const radius = interpolate(progress.value, [0, 1], [SHEET_RADIUS, TOP_STOP_RADIUS]);
    return { borderTopLeftRadius: radius, borderTopRightRadius: radius };
  });
  const fillStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[style, styles.clip, { borderColor: palette.sheetEdge }, shapeStyle]}
    >
      <BlurView
        tint={palette.blurTint}
        intensity={palette.blurIntensity}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.wash }]}
      />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.topFill }, fillStyle]}
      />
    </Animated.View>
  );
}

export const SheetGlassBackground = memo(SheetGlassBackgroundComponent);

const styles = StyleSheet.create({
  clip: {
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
});
