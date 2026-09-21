import Ionicons from "@expo/vector-icons/Ionicons";
import React, { memo, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";

import { BreakExclusions } from "../../services/breakExclusions";
import type { RoutePlanInterestHighlight } from "../../services/DriveSessionStore";
import {
  breakIconName,
  breakTone,
  formatAlternatives,
  formatPlaceLine,
} from "./breakSuggestion";
import type { SheetPalette } from "./sheetPalette";

type Props = {
  highlight: RoutePlanInterestHighlight;
  palette: SheetPalette;
  /** Small line above the title: "Mola önerisi" inside a stop, the stop's name in a list. */
  caption?: string;
};

/**
 * One break suggestion: category icon in a softly tinted circle, the title,
 * the real place and its distance when there is one, then the ranker's reason.
 */
function BreakSuggestionRowComponent({ highlight, palette, caption }: Props) {
  const tone = breakTone(highlight);
  const iconColor =
    tone === "warm" ? palette.warm : tone === "cool" ? palette.cool : palette.neutral;
  const iconBackground =
    tone === "warm"
      ? palette.warmSoft
      : tone === "cool"
        ? palette.coolSoft
        : palette.neutralSoft;
  const placeLine = formatPlaceLine(highlight);
  // Also covers a plan that was stored before the driver ruled a kind out.
  const excludedKinds = useSyncExternalStore(BreakExclusions.subscribe, BreakExclusions.get);
  const alternativesLine = formatAlternatives(highlight, excludedKinds);
  const reason = highlight.message?.trim();

  return (
    <View style={styles.row}>
      <View style={[styles.iconCircle, { backgroundColor: iconBackground }]}>
        <Ionicons name={breakIconName(highlight.icon)} size={16} color={iconColor} />
      </View>
      <View style={styles.copy}>
        {caption ? (
          <Text
            style={[styles.caption, { color: palette.textSecondary }]}
            numberOfLines={1}
          >
            {caption}
          </Text>
        ) : null}
        <Text style={[styles.title, { color: palette.text }]}>
          {highlight.title || "Mola önerisi"}
        </Text>
        {placeLine ? (
          <Text style={[styles.place, { color: palette.text }]} numberOfLines={1}>
            {placeLine}
          </Text>
        ) : null}
        {reason ? (
          <Text style={[styles.reason, { color: palette.textSecondary }]}>
            {reason}
          </Text>
        ) : null}
        {alternativesLine ? (
          <Text
            style={[styles.alternatives, { color: palette.textSecondary }]}
            numberOfLines={2}
          >
            {alternativesLine}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export const BreakSuggestionRow = memo(BreakSuggestionRowComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    gap: 3,
  },
  caption: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  place: {
    fontSize: 13,
    fontWeight: "600",
    opacity: 0.88,
  },
  reason: {
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "500",
  },
  alternatives: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    opacity: 0.85,
  },
});
