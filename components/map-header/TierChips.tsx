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
import { TIER_BOLTS, TIER_COLORS, TIER_SELECTED_COLORS, TIERS } from "./tiers";

/**
 * The tier chips under the search field: they filter the map's pins (any
 * number selected, none selected shows every tier). An unselected chip is
 * plain glass with its bolts in the pin's colour; a selected one is glass
 * tinted with that colour darkened for white text, its bolts and label white.
 *
 * The three share the row in equal parts, so the row ends on the header's
 * trailing margin like the search field above it. The set is fixed at three
 * and always fits, so there is nothing to scroll and nothing to leave ragged.
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
              tintColor={isSelected ? TIER_SELECTED_COLORS[tier] : undefined}
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
              <Text
                style={[styles.label, { color: content }]}
                maxFontSizeMultiplier={1.4}
                numberOfLines={1}
              >
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
  },
  // An equal third of the row each, so the three end on the grid's trailing
  // margin; minWidth 0 lets a long label shorten instead of pushing out.
  touch: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
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
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
  },
  bolts: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  overlap: {
    marginLeft: -6,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
  },
});
