import React, { Fragment } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";

import type { StationType } from "../../constants/stations";
import { GlassSurface } from "../ui/glass";
import { Row, SwitchRow, TEXT_INSET } from "../ui/GroupedList";
import { usePagePalette } from "../ui/pagePalette";
import { TIER_COLORS, TIERS } from "./tiers";

const MAX_WIDTH = 300;

/**
 * The filter circle's popover, a temporary glass surface under the top row
 * as iOS 26 menus are: "Yalnızca AKBA istasyonları" while the efish feed has
 * stations, then a row per tier that opens that tier's station list. The
 * rows sit directly on the glass.
 */
export function FilterPopover({
  showOnlyAkba,
  onlyAkba,
  onOnlyAkbaChange,
  onOpenList,
}: {
  showOnlyAkba: boolean;
  onlyAkba: boolean;
  onOnlyAkbaChange: (value: boolean) => void;
  onOpenList: (tier: StationType) => void;
}) {
  const palette = usePagePalette();
  const { width } = useWindowDimensions();

  return (
    <GlassSurface
      radius={22}
      material="frosted"
      style={[styles.popover, { width: Math.min(width - 32, MAX_WIDTH) }]}
    >
      {showOnlyAkba ? (
        <>
          <SwitchRow
            palette={palette}
            title="Yalnızca AKBA istasyonları"
            tile={{ symbol: "checkmark.seal.fill", color: palette.accent }}
            value={onlyAkba}
            onValueChange={onOnlyAkbaChange}
          />
          <View style={[styles.band, { backgroundColor: palette.fill }]} />
        </>
      ) : null}
      {TIERS.map((tier, index) => (
        <Fragment key={tier}>
          {index > 0 ? (
            <View style={[styles.separator, { backgroundColor: palette.separator }]} />
          ) : null}
          <Row
            palette={palette}
            title={`${tier} istasyonları`}
            tile={{ symbol: "bolt.fill", color: TIER_COLORS[tier] }}
            onPress={() => onOpenList(tier)}
          />
        </Fragment>
      ))}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  popover: {
    alignSelf: "flex-end",
    marginTop: 8,
    overflow: "hidden",
    elevation: 12,
  },
  band: {
    height: 6,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: TEXT_INSET,
  },
});
