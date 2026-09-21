import type { BottomSheetBackgroundProps } from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
import React, { memo } from "react";
import { StyleSheet, View } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { getSheetPalette } from "./sheetPalette";

export const SHEET_RADIUS = 32;

/**
 * The route sheet's only blur: one BlurView behind all content, washed with
 * white (light) or deep navy (dark). Cards on top are plain translucent
 * views, so scrolling never composites more than this one effect view.
 */
function SheetGlassBackgroundComponent({ style }: BottomSheetBackgroundProps) {
  const { themeScheme } = useTheme();
  const palette = getSheetPalette(themeScheme === "dark");

  return (
    <View
      pointerEvents="none"
      style={[style, styles.clip, { borderColor: palette.sheetEdge }]}
    >
      <BlurView
        tint={palette.blurTint}
        intensity={palette.blurIntensity}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.wash }]}
      />
    </View>
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
