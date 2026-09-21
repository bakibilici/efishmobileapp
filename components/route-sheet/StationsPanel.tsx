import React, { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import type { RoutePlanLocation } from "../../services/DriveSessionStore";
import { placeName } from "./breakSuggestion";
import { BreakSuggestionInline } from "./BreakSuggestionRow";
import {
  BackPill,
  Group,
  IconTile,
  SIDE_MARGIN,
  TABULAR,
  TitleBlock,
} from "./Grouped";
import {
  formatMinutes,
  spoken,
  spokenStationCharge,
  stationChargeLine,
  stationHardware,
} from "./routeFormat";
import type { SheetPalette } from "./sheetPalette";

const StationRow = memo(function StationRow({
  location,
  divided,
  palette,
}: {
  location: RoutePlanLocation;
  divided: boolean;
  palette: SheetPalette;
}) {
  // Same wording as the route list: "31 dk şarj · %24 → %80".
  const charge = stationChargeLine(location);
  // "180 kW · 4 DC · 2 AC", plus the brand when the name does not carry it.
  const hardware = stationHardware(location);
  const address = location.address?.trim();
  const highlight = location.interest_highlight;
  const accessibilityLabel = [
    location.name,
    spokenStationCharge(location),
    hardware ? spoken(hardware) : null,
    address,
    highlight ? `mola önerisi: ${highlight.title || "Mola önerisi"}` : null,
    highlight && placeName(highlight),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
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
        {highlight ? <BreakSuggestionInline highlight={highlight} palette={palette} /> : null}
      </View>
    </View>
  );
});

function StationsPanelComponent({
  stations,
  totalChargeMinutes,
  onBack,
  showBack,
  palette,
}: {
  stations: RoutePlanLocation[];
  totalChargeMinutes: number;
  onBack: () => void;
  /** False when the sheet's fixed bar already shows "‹ Rota" (a preview). */
  showBack: boolean;
  palette: SheetPalette;
}) {
  const totalCharge = formatMinutes(totalChargeMinutes);
  const subtitle = stations.length
    ? [`${stations.length} durak`, totalCharge ? `toplam ${totalCharge} şarj` : null]
        .filter(Boolean)
        .join(" · ")
    : null;

  return (
    <>
      {showBack ? (
        <View style={styles.backRow}>
          <BackPill
            label="Rota"
            accessibilityLabel="Rota özetine dön"
            onPress={onBack}
            palette={palette}
          />
        </View>
      ) : null}
      <TitleBlock title="Şarj durakları" subtitle={subtitle} palette={palette} />

      {stations.length ? (
        <Group palette={palette}>
          {stations.map((location, index) => (
            <StationRow
              key={`${location.name}-${index}`}
              location={location}
              divided={index > 0}
              palette={palette}
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
  backRow: {
    marginHorizontal: SIDE_MARGIN,
    marginBottom: 12,
  },
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
