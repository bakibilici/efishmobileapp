import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import type { StationType } from "../../constants/stations";
import { GlassSurface } from "../ui/glass";
import { IconSymbol } from "../ui/icon-symbol";
import { usePagePalette } from "../ui/pagePalette";
import { TIER_BOLTS, TIER_COLORS, TIERS } from "./tiers";

/**
 * The tier chips under the search field: they filter the map's pins (any
 * number selected, none selected shows every tier). An unselected chip is
 * plain glass with its bolts in the pin's colour; a selected one is glass
 * tinted with that colour, its bolts and label white.
 */
export function TierChips({
  selected,
  onToggle,
  style,
}: {
  selected: readonly StationType[];
  onToggle: (tier: StationType) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePagePalette();

  return (
    <View pointerEvents="box-none" style={[styles.row, style]}>
      {TIERS.map((tier) => {
        const isSelected = selected.includes(tier);
        const content = isSelected ? "#FFFFFF" : palette.label;
        return (
          <Pressable
            key={tier}
            onPress={() => onToggle(tier)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${tier} istasyonları`}
            accessibilityHint="Haritada yalnızca seçtiğiniz türler gösterilir."
            style={({ pressed }) => [
              styles.touch,
              // Frosted chips do not answer a touch by themselves: they dim.
              pressed && styles.pressed,
            ]}
          >
            <GlassSurface
              radius={18}
              interactive
              material="frosted"
              tintColor={isSelected ? TIER_COLORS[tier] : undefined}
              style={styles.chip}
            >
              <View style={styles.bolts}>
                {Array.from({ length: TIER_BOLTS[tier] }, (_, index) => (
                  <IconSymbol
                    key={index}
                    name="bolt.fill"
                    size={14}
                    color={isSelected ? "#FFFFFF" : TIER_COLORS[tier]}
                    style={index > 0 ? styles.overlap : undefined}
                  />
                ))}
              </View>
              <Text style={[styles.label, { color: content }]} maxFontSizeMultiplier={1.4}>
                {tier}
              </Text>
            </GlassSurface>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
    alignSelf: "flex-start",
  },
  touch: {
    minHeight: 44,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.6,
  },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  bolts: {
    flexDirection: "row",
    alignItems: "center",
  },
  overlap: {
    marginLeft: -6,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
});
