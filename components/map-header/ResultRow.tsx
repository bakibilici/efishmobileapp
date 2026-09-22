import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { IconSymbol } from "../ui/icon-symbol";
import { usePagePalette } from "../ui/pagePalette";

/** Where a list of ResultRows starts its hairlines: 16 padding, the 28 pt glyph, 12 gap. */
export const RESULT_SEPARATOR_INSET = 56;

/**
 * One search result, a station or a place, in one design: a round 28 pt
 * glyph, then the title and the subtitle on one line each.
 */
export function ResultRow({
  glyph,
  title,
  subtitle,
}: {
  glyph: { kind: "station"; color: string } | { kind: "place" };
  title: string;
  subtitle?: string | null;
}) {
  const palette = usePagePalette();

  return (
    <View style={styles.row}>
      {glyph.kind === "station" ? (
        <View style={[styles.stationGlyph, { backgroundColor: glyph.color }]}>
          <IconSymbol name="bolt.fill" size={15} color="#FFFFFF" />
        </View>
      ) : (
        <IconSymbol name="mappin.circle.fill" size={28} color={palette.red} />
      )}
      <View style={styles.copy}>
        <Text
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
          style={[styles.title, { color: palette.label }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={[styles.subtitle, { color: palette.secondaryLabel }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  stationGlyph: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
});
