import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { GlassSurface, hasLiquidGlass } from "../ui/glass";
import { IconSymbol } from "../ui/icon-symbol";
import { usePagePalette } from "../ui/pagePalette";
import { GlassIconButton } from "./GlassIconButton";
import { accentOnGlass } from "./tiers";

/** Where the map's bottom controls stand: clear of the tab bar (tabBarMetrics' MAP_BUTTONS_BOTTOM). */
const MAP_BUTTONS_BOTTOM = 120;

/**
 * The manual way into car mode: a glass capsule tinted with the brand blue,
 * centred above the tab bar, its centre in line with the locate circle.
 */
export function DriveModeButton({
  onPress,
  bottom = MAP_BUTTONS_BOTTOM,
}: {
  onPress: () => void;
  bottom?: number;
}) {
  const palette = usePagePalette();

  return (
    <View pointerEvents="box-none" style={[styles.driveWrapper, { bottom }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Sürüş Modu"
        accessibilityHint="Sürüş ekranını açar"
        style={({ pressed }) => [!hasLiquidGlass && pressed && styles.pressed]}
      >
        <GlassSurface radius={24} interactive tintColor={palette.accent} style={styles.drive}>
          <IconSymbol name="car.fill" size={20} weight="semibold" color="#FFFFFF" />
          <Text maxFontSizeMultiplier={1.4} style={styles.driveLabel}>
            Sürüş Modu
          </Text>
        </GlassSurface>
      </Pressable>
    </View>
  );
}

/** Brings the map back to the driver's position: a 48 pt glass circle at the right. */
export function LocateButton({
  onPress,
  bottom,
  zIndex,
}: {
  onPress: () => void;
  bottom: number;
  zIndex: number;
}) {
  const palette = usePagePalette();

  return (
    <View pointerEvents="box-none" style={[styles.locateWrapper, { bottom, zIndex }]}>
      <GlassIconButton
        symbol="location.fill"
        glyphColor={accentOnGlass(palette.isDark)}
        accessibilityLabel="Konumum"
        accessibilityHint="Haritayı konumunuza getirir"
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  driveWrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 70,
  },
  pressed: {
    opacity: 0.6,
  },
  drive: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
  },
  driveLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  locateWrapper: {
    position: "absolute",
    right: 20,
  },
});
