import Ionicons from "@expo/vector-icons/Ionicons";
import React, { Fragment, memo } from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import type { RoutePlanLocation } from "../../services/DriveSessionStore";
import { Group, TABULAR } from "./Grouped";
import {
  formatKm,
  formatMinutes,
  formatPercent,
  spoken,
  spokenStationCharge,
  stationChargeLine,
  stationPower,
  type Leg,
} from "./routeFormat";
import type { SheetPalette } from "./sheetPalette";

const RAIL_WIDTH = 30;
const GLYPH = 22;
const ROW_PADDING = 10;
const TITLE_LINE = 20;
const RAIL_GAP = 3;
// Puts the glyph's centre on the title's first line.
const RAIL_TOP = ROW_PADDING + TITLE_LINE / 2 - GLYPH / 2 - RAIL_GAP;

/** Same marks as the map: green origin pin head, orange bolt stations, red flag destination. */
const StopGlyph = memo(function StopGlyph({
  type,
  palette,
}: {
  type: RoutePlanLocation["type"];
  palette: SheetPalette;
}) {
  if (type === "origin") {
    return (
      <View style={[styles.glyphBox, styles.glyphCircle, { backgroundColor: palette.green }]}>
        <View style={styles.originDot} />
      </View>
    );
  }
  const isStation = type === "station";
  return (
    <View
      style={[
        styles.glyphBox,
        styles.glyphCircle,
        { backgroundColor: isStation ? palette.station : palette.red },
      ]}
    >
      <Ionicons name={isStation ? "flash" : "flag"} size={12} color="#FFFFFF" />
    </View>
  );
});

const Rail = memo(function Rail({
  top,
  bottom,
  type,
  palette,
}: {
  top: boolean;
  bottom: boolean;
  type: RoutePlanLocation["type"];
  palette: SheetPalette;
}) {
  return (
    <View style={styles.rail}>
      <View
        style={[styles.railTop, top && { backgroundColor: palette.rail }]}
      />
      <StopGlyph type={type} palette={palette} />
      <View
        style={[styles.railBottom, bottom && { backgroundColor: palette.rail }]}
      />
    </View>
  );
});

/** The drive between two stops: the line continues, the caption says how long. */
const LegRow = memo(function LegRow({
  leg,
  palette,
}: {
  leg: Leg;
  palette: SheetPalette;
}) {
  const caption = [formatMinutes(leg.duration), formatKm(leg.distance)]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.railFull, { backgroundColor: palette.rail }]} />
      </View>
      <View style={styles.legCopy}>
        {caption ? (
          <Text
            style={[styles.legText, TABULAR, { color: palette.secondaryLabel }]}
            numberOfLines={1}
            accessibilityLabel={`${spoken(caption)} sürüş`}
          >
            {caption}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

const StopRow = memo(function StopRow({
  location,
  isFirst,
  isLast,
  palette,
}: {
  location: RoutePlanLocation;
  isFirst: boolean;
  isLast: boolean;
  palette: SheetPalette;
}) {
  const level =
    location.type === "origin"
      ? location.battery_status?.from ?? location.battery_status?.to
      : location.battery_status?.to ?? location.battery_status?.from;
  const hasLevel = typeof level === "number" && Number.isFinite(level);
  const temp = location.weather ? Math.round(location.weather.temp) : null;

  let meta: string | null;
  let spokenMeta: (string | null)[];
  if (location.type === "station") {
    // "31 dk şarj · %24 → %80 · DC 180 kW"; the stations panel keeps the brand and counts.
    const power = stationPower(location);
    meta = [stationChargeLine(location), power].filter(Boolean).join(" · ") || null;
    spokenMeta = ["şarj durağı", spokenStationCharge(location), power ? spoken(power) : null];
  } else {
    const role = location.type === "origin" ? "Çıkış" : "Varış";
    meta = hasLevel ? `${role} · ${formatPercent(level)}` : role;
    spokenMeta = [role.toLocaleLowerCase("tr-TR"), hasLevel ? `batarya yüzde ${Math.round(level)}` : null];
  }
  const accessibilityLabel = [
    location.name,
    ...spokenMeta,
    temp != null ? `${temp} derece` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
      <Rail top={!isFirst} bottom={!isLast} type={location.type} palette={palette} />
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={[styles.name, { color: palette.label }]} numberOfLines={2}>
            {location.name}
          </Text>
          {location.weather ? (
            <View style={styles.weather}>
              <Image source={{ uri: location.weather.icon }} style={styles.weatherIcon} />
              <Text style={[styles.meta, TABULAR, { color: palette.secondaryLabel }]}>
                {temp}°
              </Text>
            </View>
          ) : null}
        </View>
        {meta ? (
          <Text
            style={[styles.meta, TABULAR, { color: palette.secondaryLabel }]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

/** Apple Maps style step list: stops on a rail, the drives between them as captions. */
function RouteStepsComponent({
  locations,
  legs,
  palette,
}: {
  locations: RoutePlanLocation[];
  legs: Leg[];
  palette: SheetPalette;
}) {
  return (
    <Group palette={palette} style={styles.group}>
      {locations.map((location, index) => (
        <Fragment key={`${location.type}-${location.name}-${index}`}>
          {index > 0 && legs[index - 1] ? (
            <LegRow leg={legs[index - 1]} palette={palette} />
          ) : null}
          <StopRow
            location={location}
            isFirst={index === 0}
            isLast={index === locations.length - 1}
            palette={palette}
          />
        </Fragment>
      ))}
    </Group>
  );
}

export const RouteSteps = memo(RouteStepsComponent);

const styles = StyleSheet.create({
  group: {
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    paddingLeft: 16,
  },
  rail: {
    width: RAIL_WIDTH,
    alignItems: "center",
    marginRight: 12,
  },
  railTop: {
    width: 2,
    height: RAIL_TOP,
    marginBottom: RAIL_GAP,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1,
  },
  railBottom: {
    width: 2,
    flex: 1,
    marginTop: RAIL_GAP,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
  },
  railFull: {
    width: 2,
    flex: 1,
  },
  glyphBox: {
    width: GLYPH,
    height: GLYPH,
    alignItems: "center",
    justifyContent: "center",
  },
  glyphCircle: {
    borderRadius: GLYPH / 2,
  },
  originDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  copy: {
    flex: 1,
    paddingTop: ROW_PADDING,
    paddingBottom: ROW_PADDING,
    paddingRight: 16,
    gap: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  name: {
    flex: 1,
    fontSize: 15,
    lineHeight: TITLE_LINE,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  weather: {
    flexDirection: "row",
    alignItems: "center",
    height: TITLE_LINE,
  },
  weatherIcon: {
    width: 20,
    height: 20,
  },
  meta: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  legCopy: {
    flex: 1,
    justifyContent: "center",
    minHeight: 22,
    paddingRight: 16,
  },
  legText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
});
