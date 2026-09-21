import React, { memo, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BreakExclusions } from "../../services/breakExclusions";
import type { RoutePlanInterestHighlight } from "../../services/DriveSessionStore";
import {
  breakTile,
  formatAlternatives,
  placeName,
  shortWalkDistance,
} from "./breakSuggestion";
import { IconTile, TABULAR } from "./Grouped";
import { spoken } from "./routeFormat";
import type { SheetPalette } from "./sheetPalette";

/**
 * One break suggestion as a Settings-style row: category tile, the title,
 * "place · distance · stop", the ranker's reason and the other options.
 * The separator sits on the text column, so it starts where the text does.
 */
function BreakSuggestionRowComponent({
  highlight,
  palette,
  divided,
}: {
  highlight: RoutePlanInterestHighlight;
  palette: SheetPalette;
  /** Draws the hairline above the row; false for the first row of a group. */
  divided: boolean;
}) {
  const tile = breakTile(highlight, palette);
  // Also covers a plan that was stored before the driver ruled a kind out.
  const excludedKinds = useSyncExternalStore(BreakExclusions.subscribe, BreakExclusions.get);
  const alternatives = formatAlternatives(highlight, excludedKinds);
  const place = placeName(highlight);
  const where = [
    place,
    place ? shortWalkDistance(highlight.distanceM) : null,
    highlight.stationName?.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
  const reason = highlight.message?.trim();
  const title = highlight.title || "Mola önerisi";
  const accessibilityLabel = [title, where ? spoken(where) : null, reason, alternatives]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
      <View style={styles.tileSlot}>
        <IconTile glyph={tile.glyph} color={tile.color} />
      </View>
      <View
        style={[
          styles.copy,
          divided && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.separator,
          },
        ]}
      >
        <Text style={[styles.title, { color: palette.label }]} numberOfLines={1}>
          {title}
        </Text>
        {where ? (
          <Text
            style={[styles.line, TABULAR, { color: palette.secondaryLabel }]}
            numberOfLines={1}
          >
            {where}
          </Text>
        ) : null}
        {reason ? (
          <Text
            style={[styles.line, { color: palette.secondaryLabel }]}
            numberOfLines={2}
          >
            {reason}
          </Text>
        ) : null}
        {alternatives ? (
          <Text
            style={[styles.line, { color: palette.secondaryLabel }]}
            numberOfLines={1}
          >
            {alternatives}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const BreakSuggestionRow = memo(BreakSuggestionRowComponent);

/** The same suggestion folded into a stop's row: small tile, "Kahve molası · Keddy's Cafe". */
function BreakSuggestionInlineComponent({
  highlight,
  palette,
}: {
  highlight: RoutePlanInterestHighlight;
  palette: SheetPalette;
}) {
  const tile = breakTile(highlight, palette);
  const place = placeName(highlight);

  return (
    <View style={styles.inline}>
      <IconTile glyph={tile.glyph} color={tile.color} size={20} />
      <Text style={[styles.inlineText, { color: palette.label }]} numberOfLines={1}>
        {highlight.title || "Mola önerisi"}
        {place ? (
          <Text style={{ color: palette.secondaryLabel }}>{` · ${place}`}</Text>
        ) : null}
      </Text>
    </View>
  );
}

export const BreakSuggestionInline = memo(BreakSuggestionInlineComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 16,
  },
  // Centres the 30 pt tile on the title's first line.
  tileSlot: {
    paddingTop: 7,
    marginRight: 12,
  },
  copy: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 12,
    paddingRight: 16,
    gap: 2,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  line: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  inline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 7,
  },
  inlineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
});
