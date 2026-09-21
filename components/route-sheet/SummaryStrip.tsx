import Ionicons from "@expo/vector-icons/Ionicons";
import React, { Fragment, memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TABULAR } from "./Grouped";
import type { SheetPalette } from "./sheetPalette";

export type SummaryItem = {
  /** Already in capitals (Turkish casing). */
  label: string;
  value: string;
  onPress?: () => void;
  accessibilityLabel?: string;
};

/**
 * Equal columns split by hairlines: "SÜRÜŞ / 4 sa 5 dk". Renders only the
 * row; the caller puts it in a Group, above the battery section.
 */
function SummaryStripComponent({
  items,
  palette,
}: {
  items: SummaryItem[];
  palette: SheetPalette;
}) {
  return (
    <View style={styles.strip}>
      {items.map((item, index) => {
        const content = (
          <>
            <Text
              style={[styles.label, { color: palette.secondaryLabel }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <View style={styles.valueRow}>
              <Text
                style={[
                  styles.value,
                  TABULAR,
                  { color: item.onPress ? palette.blue : palette.label },
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {item.value}
              </Text>
              {item.onPress ? (
                <Ionicons
                  name="chevron-forward"
                  size={13}
                  color={palette.blue}
                  style={styles.chevron}
                />
              ) : null}
            </View>
          </>
        );

        return (
          <Fragment key={item.label}>
            {index > 0 ? (
              <View style={[styles.divider, { backgroundColor: palette.separator }]} />
            ) : null}
            {item.onPress ? (
              <Pressable
                onPress={item.onPress}
                accessibilityRole="button"
                accessibilityLabel={item.accessibilityLabel}
                style={({ pressed }) => [
                  styles.column,
                  pressed && { backgroundColor: palette.cellPressed },
                ]}
              >
                {content}
              </Pressable>
            ) : (
              <View
                style={styles.column}
                accessible
                accessibilityLabel={item.accessibilityLabel}
              >
                {content}
              </View>
            )}
          </Fragment>
        );
      })}
    </View>
  );
}

export const SummaryStrip = memo(SummaryStripComponent);

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
  },
  column: {
    flex: 1,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    gap: 3,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    marginVertical: 12,
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  value: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  chevron: {
    marginLeft: 2,
    marginTop: 1,
  },
});
