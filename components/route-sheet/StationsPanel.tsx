import React, { memo, useCallback } from "react";
import { StyleSheet, Text, View } from "react-native";

import type {
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../../services/DriveSessionStore";
import { BreakSuggestionInline } from "./BreakSuggestionRow";
import { Group, IconTile, TABULAR, TitleBlock } from "./Grouped";
import {
  formatMinutes,
  spoken,
  spokenStationCharge,
  stationChargeLine,
  stationHardware,
} from "./routeFormat";
import type { SheetPalette } from "./sheetPalette";

/** Opens a break suggestion's detail page, with the stop whose row it was tapped in. */
export type OpenBreakAtStop = (
  highlight: RoutePlanInterestHighlight,
  station: RoutePlanLocation,
) => void;

const StationRow = memo(function StationRow({
  location,
  divided,
  palette,
  onOpenBreak,
}: {
  location: RoutePlanLocation;
  divided: boolean;
  palette: SheetPalette;
  onOpenBreak?: OpenBreakAtStop;
}) {
  // Same wording as the route list: "31 dk şarj · %24 → %80".
  const charge = stationChargeLine(location);
  // "180 kW · 4 DC · 2 AC", plus the brand when the name does not carry it.
  const hardware = stationHardware(location);
  const address = location.address?.trim();
  const highlight = location.interest_highlight;
  // The stop reads as one element; its break suggestion is a button of its own.
  const accessibilityLabel = [
    location.name,
    spokenStationCharge(location),
    hardware ? spoken(hardware) : null,
    address,
  ]
    .filter(Boolean)
    .join(", ");
  // The detail page is told which stop it was opened from: two stops can
  // share a name, or a suggestion's id.
  const openBreak = useCallback(
    (opened: RoutePlanInterestHighlight) => onOpenBreak?.(opened, location),
    [onOpenBreak, location],
  );

  return (
    <View style={styles.row}>
      <View style={styles.tileSlot}>
        <IconTile glyph="flash" color={palette.station} />
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
        <View style={styles.stationCopy} accessible accessibilityLabel={accessibilityLabel}>
          <Text style={[styles.title, { color: palette.label }]} numberOfLines={2}>
            {location.name}
          </Text>
          {charge ? (
            <Text style={[styles.line, TABULAR, { color: palette.secondaryLabel }]}>
              {charge}
            </Text>
          ) : null}
          {hardware ? (
            <Text
              style={[styles.line, TABULAR, { color: palette.secondaryLabel }]}
              numberOfLines={1}
            >
              {hardware}
            </Text>
          ) : null}
          {address ? (
            <Text
              style={[styles.line, { color: palette.secondaryLabel }]}
              numberOfLines={2}
            >
              {address}
            </Text>
          ) : null}
        </View>
        {highlight ? (
          <BreakSuggestionInline
            highlight={highlight}
            palette={palette}
            onPress={onOpenBreak ? openBreak : undefined}
          />
        ) : null}
      </View>
    </View>
  );
});

/**
 * The stops in full. The screen's back button ("Rota özetine dön") leads
 * back; a stop's break suggestion opens its detail page.
 */
function StationsPanelComponent({
  stations,
  totalChargeMinutes,
  palette,
  onOpenBreak,
}: {
  stations: RoutePlanLocation[];
  totalChargeMinutes: number;
  palette: SheetPalette;
  onOpenBreak?: OpenBreakAtStop;
}) {
  const totalCharge = formatMinutes(totalChargeMinutes);
  const subtitle = stations.length
    ? [`${stations.length} durak`, totalCharge ? `toplam ${totalCharge} şarj` : null]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <>
      <TitleBlock title="Şarj durakları" subtitle={subtitle} palette={palette} />

      {stations.length ? (
        <Group palette={palette}>
          {stations.map((location, index) => (
            <StationRow
              key={`${location.name}-${index}`}
              location={location}
              divided={index > 0}
              palette={palette}
              onOpenBreak={onOpenBreak}
            />
          ))}
        </Group>
      ) : (
        <Group palette={palette} style={styles.empty}>
          <Text style={[styles.title, { color: palette.label }]}>
            Şarj durağı gerekmiyor
          </Text>
          <Text style={[styles.line, styles.emptyBody, { color: palette.secondaryLabel }]}>
            Bu rota için ek şarj noktası planlanmadı.
          </Text>
        </Group>
      )}
    </>
  );
}

export const StationsPanel = memo(StationsPanelComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 16,
  },
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
  stationCopy: {
    gap: 2,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 4,
  },
  emptyBody: {
    textAlign: "center",
  },
});
