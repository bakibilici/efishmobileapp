import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useCallback, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

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

const OPEN_HINT = "Mola önerisinin ayrıntılarını açar.";

/**
 * One break suggestion as a Settings-style row: category tile, the title,
 * "place · distance · stop", the ranker's reason and the other options,
 * each on at most two lines, the place first so a long name is never the
 * part that is cut. A chevron says it opens: the detail page shows it all.
 * The separator sits on the text column, so it starts where the text does
 * and runs under the chevron to the edge.
 */
function BreakSuggestionRowComponent({
  highlight,
  palette,
  divided,
  onPress,
}: {
  highlight: RoutePlanInterestHighlight;
  palette: SheetPalette;
  /** Draws the hairline above the row; false for the first row of a group. */
  divided: boolean;
  /** Opens the suggestion's detail page. */
  onPress?: (highlight: RoutePlanInterestHighlight) => void;
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
  const handlePress = useCallback(() => onPress?.(highlight), [highlight, onPress]);

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onPress ? OPEN_HINT : undefined}
      style={({ pressed }) => [
        styles.row,
        pressed && !!onPress && { backgroundColor: palette.cellPressed },
      ]}
    >
      <View style={styles.tileSlot}>
        <IconTile glyph={tile.glyph} color={tile.color} />
      </View>
      <View
        style={[
          styles.cell,
          !onPress && styles.cellWithoutChevron,
          divided && {
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: palette.separator,
          },
        ]}
      >
        <View style={styles.copy}>
          <Text style={[styles.title, { color: palette.label }]} numberOfLines={1}>
            {title}
          </Text>
          {where ? (
            <Text
              style={[styles.line, TABULAR, { color: palette.secondaryLabel }]}
              numberOfLines={2}
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
              numberOfLines={2}
            >
              {alternatives}
            </Text>
          ) : null}
        </View>
        {onPress ? (
          <Ionicons
            name="chevron-forward"
            size={17}
            color={palette.tertiaryLabel}
            style={styles.chevron}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export const BreakSuggestionRow = memo(BreakSuggestionRowComponent);

/**
 * The same suggestion folded into a stop's row: small tile, "Kahve molası ·
 * Keddy's Cafe" on at most two lines, and a chevron when it opens.
 */
function BreakSuggestionInlineComponent({
  highlight,
  palette,
  onPress,
}: {
  highlight: RoutePlanInterestHighlight;
  palette: SheetPalette;
  /** Opens the suggestion's detail page. */
  onPress?: (highlight: RoutePlanInterestHighlight) => void;
}) {
  const tile = breakTile(highlight, palette);
  const place = placeName(highlight);
  const title = highlight.title || "Mola önerisi";
  const handlePress = useCallback(() => onPress?.(highlight), [highlight, onPress]);

  return (
    <Pressable
      onPress={onPress ? handlePress : undefined}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`Mola önerisi: ${[title, place].filter(Boolean).join(", ")}`}
      accessibilityHint={onPress ? OPEN_HINT : undefined}
      // The touch reaches past the text column's padding, as a row would.
      hitSlop={{ top: 4, bottom: 10, left: 8, right: 16 }}
      style={({ pressed }) => [styles.inline, pressed && !!onPress && styles.inlinePressed]}
    >
      <IconTile glyph={tile.glyph} color={tile.color} size={20} />
      <Text style={[styles.inlineText, { color: palette.label }]} numberOfLines={2}>
        {title}
        {place ? (
          <Text style={{ color: palette.secondaryLabel }}>{` · ${place}`}</Text>
        ) : null}
      </Text>
      {onPress ? (
        <Ionicons name="chevron-forward" size={15} color={palette.tertiaryLabel} />
      ) : null}
    </Pressable>
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
  cell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
  },
  cellWithoutChevron: {
    paddingRight: 16,
  },
  copy: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 2,
  },
  // iOS's disclosure indicator: 8 pt off the text, 12 pt in from the edge.
  chevron: {
    marginLeft: 8,
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
  inlinePressed: {
    opacity: 0.5,
  },
  inlineText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
});
