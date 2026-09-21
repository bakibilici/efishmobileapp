import React, { memo, useCallback, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";

import { SIDE_MARGIN, TABULAR } from "./Grouped";
import { formatPercent, levelColor, type BatteryPoint } from "./routeFormat";
import type { SheetPalette } from "./sheetPalette";

const CHART_HEIGHT = 44;
const CHART_PAD = 4;
const CELL_PADDING = 16;
const INITIAL_WIDTH = Dimensions.get("window").width - SIDE_MARGIN * 2 - CELL_PADDING * 2;

/**
 * The battery level along the route on a 0–100 scale: discharge on each
 * drive, a vertical step at each charge. One stroke in the arrival level's
 * colour over a faint area (the charge left, as in Settings › Battery), a dot
 * at each stop's low point and at the arrival, a faint 0 % baseline.
 */
const Trajectory = memo(function Trajectory({
  points,
  total,
  color,
  palette,
}: {
  points: BatteryPoint[];
  total: number;
  color: string;
  palette: SheetPalette;
}) {
  const [width, setWidth] = useState(INITIAL_WIDTH);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next > 0) setWidth(next);
  }, []);

  const x = (at: number) => CHART_PAD + (at / total) * (width - CHART_PAD * 2);
  const y = (level: number) =>
    CHART_PAD + (1 - level / 100) * (CHART_HEIGHT - CHART_PAD * 2);
  const path = points
    .map((point, index) => `${index ? "L" : "M"}${x(point.at).toFixed(1)} ${y(point.level).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1];
  const area = `${path} L${x(total).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;

  return (
    <View style={styles.chart} onLayout={handleLayout}>
      <Svg width={width} height={CHART_HEIGHT}>
        <Line
          x1={CHART_PAD}
          x2={width - CHART_PAD}
          y1={CHART_HEIGHT - CHART_PAD}
          y2={CHART_HEIGHT - CHART_PAD}
          stroke={palette.separator}
          strokeWidth={1}
        />
        <Path
          d={area}
          fill={color}
          fillOpacity={palette.isDark ? 0.2 : 0.12}
          stroke="none"
        />
        <Path
          d={path}
          stroke={color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          fill="none"
        />
        {points.map((point, index) =>
          point.kind === "arrive" ? (
            <Circle
              key={index}
              cx={x(point.at)}
              cy={y(point.level)}
              r={2.5}
              fill={color}
            />
          ) : null,
        )}
        <Circle cx={x(last.at)} cy={y(last.level)} r={3.5} fill={color} />
      </Svg>
    </View>
  );
});

/** Slim capsule at the arrival level, for a plan whose stops carry no levels. */
const Capsule = memo(function Capsule({
  level,
  color,
  palette,
}: {
  level: number;
  color: string;
  palette: SheetPalette;
}) {
  return (
    <View style={[styles.capsule, { backgroundColor: palette.fill }]}>
      <View
        style={[
          styles.capsuleFill,
          { backgroundColor: color, width: `${Math.max(2, Math.min(level, 100))}%` },
        ]}
      />
    </View>
  );
});

/** Whether the battery section has anything to show; the caller draws its separator on this. */
export const hasBatteryLevels = (start: number | null, end: number | null) =>
  start != null || end != null;

/** The battery section of the summary group: sentence, then the trajectory or a capsule. */
function BatteryCardComponent({
  start,
  end,
  trajectory,
  palette,
}: {
  start: number | null;
  end: number | null;
  trajectory: { points: BatteryPoint[]; total: number } | null;
  palette: SheetPalette;
}) {
  if (!hasBatteryLevels(start, end)) return null;

  const parts = [
    start != null ? `${formatPercent(start)} ile çıkış` : null,
    end != null ? `varışta ${formatPercent(end)}` : null,
  ].filter(Boolean) as string[];
  const detail = parts.join(" · ");
  const sentence = detail.charAt(0).toLocaleUpperCase("tr-TR") + detail.slice(1);
  const color = levelColor(end ?? start ?? 0, palette);

  return (
    <View style={styles.cell}>
      <View accessible accessibilityLabel={`Batarya. ${sentence}`}>
        <Text style={[styles.title, { color: palette.label }]}>Batarya</Text>
        <Text style={[styles.detail, TABULAR, { color: palette.secondaryLabel }]}>
          {sentence}
        </Text>
      </View>
      {trajectory ? (
        <Trajectory
          points={trajectory.points}
          total={trajectory.total}
          color={color}
          palette={palette}
        />
      ) : end != null ? (
        <Capsule level={end} color={color} palette={palette} />
      ) : null}
    </View>
  );
}

export const BatteryCard = memo(BatteryCardComponent);

const styles = StyleSheet.create({
  cell: {
    paddingHorizontal: CELL_PADDING,
    paddingTop: 11,
    paddingBottom: 12,
  },
  title: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  detail: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
  },
  chart: {
    marginTop: 10,
    height: CHART_HEIGHT,
  },
  capsule: {
    marginTop: 10,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  capsuleFill: {
    height: "100%",
    borderRadius: 3,
  },
});
