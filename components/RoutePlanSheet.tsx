import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../context/ThemeContext";
import {
  DriveSessionStore,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../services/DriveSessionStore";
import { BreakSuggestionRow } from "./route-sheet/BreakSuggestionRow";
import { SheetGlassBackground } from "./route-sheet/SheetGlassBackground";
import { getSheetPalette, SheetPalette } from "./route-sheet/sheetPalette";

const PANEL_WIDTH = Dimensions.get("window").width - 24;
const CARD_RADIUS = 20;
const HAIRLINE = StyleSheet.hairlineWidth;

type IoniconName = keyof typeof Ionicons.glyphMap;
type Tone = "accent" | "warm" | "cool";

const getSegmentDuration = (
  currentLocation: RoutePlanLocation,
  nextLocation: RoutePlanLocation | null,
) => currentLocation.travel_duration || nextLocation?.travel_duration || 0;

const getSegmentDistance = (
  currentLocation: RoutePlanLocation,
  nextLocation: RoutePlanLocation | null,
) => currentLocation.travel_length || nextLocation?.travel_length || 0;

const getSegmentBatteryFrom = (currentLocation: RoutePlanLocation) => {
  if (currentLocation.type === "station") {
    return (
      currentLocation.battery_status?.to ??
      currentLocation.battery_status?.from ??
      0
    );
  }

  return (
    currentLocation.battery_status?.from ??
    currentLocation.battery_status?.to ??
    0
  );
};

const getSegmentBatteryTo = (
  currentLocation: RoutePlanLocation,
  nextLocation: RoutePlanLocation | null,
) => {
  if (!nextLocation) {
    return (
      currentLocation.battery_status?.to ??
      currentLocation.battery_status?.from ??
      0
    );
  }

  if (nextLocation.type === "station") {
    return (
      nextLocation.battery_status?.from ??
      nextLocation.battery_status?.to ??
      0
    );
  }

  return (
    nextLocation.battery_status?.to ??
    nextLocation.battery_status?.from ??
    currentLocation.battery_status?.to ??
    0
  );
};

const formatDistanceLabel = (distance: number) =>
  `${distance.toFixed(distance >= 100 ? 0 : 1)} km`;

const toneColors = (tone: Tone, palette: SheetPalette) =>
  tone === "warm"
    ? { fg: palette.warm, bg: palette.warmSoft }
    : tone === "cool"
      ? { fg: palette.cool, bg: palette.coolSoft }
      : { fg: palette.accent, bg: palette.accentSoft };

const cardSurface = (palette: SheetPalette) => ({
  backgroundColor: palette.surface,
  borderColor: palette.hairline,
});

const EnergyOverview = memo(function EnergyOverview({
  locations,
  palette,
}: {
  locations: RoutePlanLocation[];
  palette: SheetPalette;
}) {
  if (!locations || locations.length < 2) return null;

  const firstLoc = locations[0];
  const lastLoc = locations[locations.length - 1];
  const originBattery = firstLoc?.battery_status?.from ?? 100;
  const destinationBattery =
    lastLoc?.battery_status?.to ?? lastLoc?.battery_status?.from ?? 0;
  const stationCount = locations.filter(
    (location) => location.type === "station",
  ).length;
  const arrivalColor =
    destinationBattery < 20 ? palette.energyLow : palette.energyHigh;

  return (
    <View style={[styles.card, styles.energyCard, cardSurface(palette)]}>
      <View style={styles.energyHeader}>
        <View style={styles.energyEyebrowRow}>
          <Text style={[styles.eyebrow, { color: palette.textSecondary }]}>
            Enerji Planı
          </Text>
          <View style={[styles.softPill, { backgroundColor: palette.coolSoft }]}>
            <Ionicons name="flash-outline" size={13} color={palette.cool} />
            <Text style={[styles.softPillText, { color: palette.cool }]}>
              {stationCount} şarj durağı
            </Text>
          </View>
        </View>
        <Text style={[styles.energyTitle, { color: palette.text }]}>
          Rota batarya görünümü
        </Text>
      </View>

      <View style={styles.energyStats}>
        <View style={[styles.energyTile, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.energyTileLabel, { color: palette.textSecondary }]}>
            Başlangıç
          </Text>
          <Text style={[styles.energyTileValue, { color: palette.text }]}>
            %{originBattery}
          </Text>
        </View>
        <Ionicons name="arrow-forward" size={16} color={palette.textSecondary} />
        <View style={[styles.energyTile, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.energyTileLabel, { color: palette.textSecondary }]}>
            Varış
          </Text>
          <Text style={[styles.energyTileValue, { color: palette.text }]}>
            %{destinationBattery}
          </Text>
        </View>
      </View>

      <View style={styles.energyTrackBlock}>
        <View style={[styles.energyTrack, { backgroundColor: palette.track }]}>
          <View
            style={[
              styles.energyTrackFill,
              {
                backgroundColor: arrivalColor,
                width: `${Math.max(0, Math.min(destinationBattery, 100))}%`,
              },
            ]}
          />
        </View>
        <View style={styles.energyTrackMeta}>
          <Text style={[styles.energyTrackLabel, { color: palette.textSecondary }]}>
            Rota sonunda kalan tahmini seviye
          </Text>
          <Text style={[styles.energyTrackPercent, { color: arrivalColor }]}>
            %{destinationBattery}
          </Text>
        </View>
      </View>
    </View>
  );
});

const SummaryCard = memo(function SummaryCard({
  icon,
  label,
  value,
  tone,
  palette,
  onPress,
  disabled = false,
  showChevron = false,
}: {
  icon: IoniconName;
  label: string;
  value: string;
  tone: Tone;
  palette: SheetPalette;
  onPress?: () => void;
  disabled?: boolean;
  showChevron?: boolean;
}) {
  const { fg, bg } = toneColors(tone, palette);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      style={({ pressed }) => [
        styles.card,
        styles.summaryCard,
        cardSurface(palette),
        { opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      <View style={[styles.summaryIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <View style={styles.summaryCopy}>
        <Text style={[styles.summaryLabel, { color: palette.textSecondary }]}>
          {label}
        </Text>
        <Text style={[styles.summaryValue, { color: palette.text }]}>
          {value}
        </Text>
      </View>
      {showChevron ? (
        <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
      ) : null}
    </Pressable>
  );
});

const TimelineDot = memo(function TimelineDot({
  type,
  palette,
}: {
  type: RoutePlanLocation["type"];
  palette: SheetPalette;
}) {
  const color = type === "station" ? palette.stationDot : palette.accent;
  const iconName: IoniconName =
    type === "origin" ? "navigate" : type === "station" ? "flash" : "flag";

  return (
    <View style={[styles.timelineDot, { backgroundColor: color }]}>
      <Ionicons name={iconName} size={12} color="#FFFFFF" />
    </View>
  );
});

const TimelineSegment = memo(function TimelineSegment({
  duration,
  distance,
  weather,
  batteryFrom,
  batteryTo,
  palette,
}: {
  duration: number;
  distance: number;
  weather?: { icon: string; temp: number; text: string };
  batteryFrom: number;
  batteryTo: number;
  palette: SheetPalette;
}) {
  return (
    <View style={styles.segment}>
      <View style={styles.segmentRail}>
        <View style={[styles.segmentLine, { borderColor: palette.timeline }]} />
      </View>

      <View style={styles.segmentInfo}>
        <View style={styles.segmentMainRow}>
          <Text style={[styles.segmentTravelText, { color: palette.text }]}>
            {duration} dk · {distance} km
          </Text>
          {weather ? (
            <View style={styles.segmentWeather}>
              <Image source={{ uri: weather.icon }} style={styles.segmentWeatherIcon} />
              <Text style={[styles.segmentWeatherText, { color: palette.textSecondary }]}>
                {weather.temp}°
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.inlineRow}>
          <Text style={[styles.segmentBatteryText, { color: palette.energyHigh }]}>
            {batteryFrom}%
          </Text>
          <Ionicons
            name="arrow-forward"
            size={13}
            color={palette.textSecondary}
            style={styles.mutedIcon}
          />
          <Text style={[styles.segmentBatteryText, { color: palette.energyLow }]}>
            {batteryTo}%
          </Text>
        </View>
      </View>
    </View>
  );
});

const StationCard = memo(function StationCard({
  location,
  palette,
}: {
  location: RoutePlanLocation;
  palette: SheetPalette;
}) {
  const highlight = location.interest_highlight;

  return (
    <View style={[styles.card, styles.stationCard, cardSurface(palette)]}>
      <View style={styles.stationHeader}>
        <View style={styles.stationNameBlock}>
          <Text style={[styles.stationName, { color: palette.text }]} numberOfLines={2}>
            {location.name}
          </Text>
          <View style={styles.stationBadgeRow}>
            {location.cp_type ? (
              <View style={[styles.smallPill, { backgroundColor: palette.accentSoft }]}>
                <Text style={[styles.smallPillText, { color: palette.accent }]}>
                  {location.cp_type}
                </Text>
              </View>
            ) : null}
            {location.brand ? (
              <Text style={[styles.stationBrand, { color: palette.textSecondary }]}>
                {location.brand}
              </Text>
            ) : null}
          </View>
        </View>

        {location.max_power ? (
          <View style={[styles.softPill, { backgroundColor: palette.warmSoft }]}>
            <Ionicons name="flash-outline" size={12} color={palette.warm} />
            <Text style={[styles.softPillText, { color: palette.warm }]}>
              {location.max_power} kW
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.stationFooter}>
        <View style={styles.inlineRow}>
          <Text style={[styles.stationBatteryText, { color: palette.energyLow }]}>
            {location.battery_status?.from}%
          </Text>
          <Ionicons
            name="arrow-forward"
            size={13}
            color={palette.textSecondary}
            style={styles.mutedIcon}
          />
          <Text style={[styles.stationBatteryText, { color: palette.energyCharge }]}>
            {location.battery_status?.to}%
          </Text>
        </View>
        {location.charge_duration ? (
          <View style={styles.stationChargeTime}>
            <Ionicons name="time-outline" size={13} color={palette.textSecondary} />
            <Text style={[styles.stationChargeText, { color: palette.text }]}>
              {location.charge_duration} dk
            </Text>
          </View>
        ) : null}
      </View>

      {highlight ? (
        <View style={[styles.cardDivided, { borderTopColor: palette.hairline }]}>
          <BreakSuggestionRow highlight={highlight} palette={palette} caption="Mola önerisi" />
        </View>
      ) : null}
    </View>
  );
});

const TimelineStop = memo(function TimelineStop({
  location,
  nextLocation,
  palette,
}: {
  location: RoutePlanLocation;
  nextLocation: RoutePlanLocation | null;
  palette: SheetPalette;
}) {
  return (
    <>
      <View style={styles.timelineRow}>
        <TimelineDot type={location.type} palette={palette} />
        <Text
          style={[
            styles.locationName,
            { color: palette.text },
            location.type === "destination" && styles.locationNameStrong,
          ]}
          numberOfLines={2}
        >
          {location.name}
        </Text>
      </View>

      {location.type === "station" ? (
        <StationCard location={location} palette={palette} />
      ) : null}

      {nextLocation ? (
        <TimelineSegment
          duration={getSegmentDuration(location, nextLocation)}
          distance={getSegmentDistance(location, nextLocation)}
          weather={location.weather}
          batteryFrom={getSegmentBatteryFrom(location)}
          batteryTo={getSegmentBatteryTo(location, nextLocation)}
          palette={palette}
        />
      ) : null}
    </>
  );
});

const BreakSuggestionsSection = memo(function BreakSuggestionsSection({
  highlights,
  summary,
  palette,
}: {
  highlights: RoutePlanInterestHighlight[];
  summary: string;
  palette: SheetPalette;
}) {
  // The on-device fallback joins its stops with " | "; read as a sentence here.
  const subtitle = summary
    ? summary.split(" | ").join(" · ")
    : "İlgi alanlarınıza göre, şarj beklerken";

  return (
    <>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: palette.text }]}>
          Mola önerileri
        </Text>
        <Text
          style={[styles.sectionSubtitle, { color: palette.textSecondary }]}
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>
      <View style={[styles.card, styles.listCard, cardSurface(palette)]}>
        {highlights.map((highlight, index) => (
          <View
            key={highlight.id || `${highlight.stationName}-${index}`}
            style={
              index > 0
                ? [styles.listItemDivided, { borderTopColor: palette.hairline }]
                : undefined
            }
          >
            <BreakSuggestionRow
              highlight={highlight}
              palette={palette}
              caption={highlight.stationName || undefined}
            />
          </View>
        ))}
      </View>
    </>
  );
});

const StationDetailCard = memo(function StationDetailCard({
  location,
  palette,
}: {
  location: RoutePlanLocation;
  palette: SheetPalette;
}) {
  const chargeFrom = location.battery_status?.from ?? 0;
  const chargeTo = location.battery_status?.to ?? 0;
  const chargeAdded = Math.max(0, chargeTo - chargeFrom);
  const totalConnectors =
    (location.ac_count ?? 0) + (location.dc_count ?? 0) + (location.hpc_count ?? 0);

  return (
    <View style={[styles.card, styles.detailCard, cardSurface(palette)]}>
      <View style={styles.detailTopRow}>
        <View style={styles.detailTitleBlock}>
          <Text style={[styles.detailTitle, { color: palette.text }]}>
            {location.name}
          </Text>
          {location.address ? (
            <Text
              style={[styles.detailAddress, { color: palette.textSecondary }]}
              numberOfLines={2}
            >
              {location.address}
            </Text>
          ) : null}
        </View>
        <View style={[styles.softPill, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.softPillText, { color: palette.accent }]}>
            {location.cp_type || "Şarj"}
          </Text>
        </View>
      </View>

      <View style={styles.detailMetaRow}>
        {location.brand ? (
          <View style={[styles.metaPill, { backgroundColor: palette.surfaceMuted }]}>
            <Ionicons name="business-outline" size={13} color={palette.textSecondary} />
            <Text style={[styles.metaPillText, { color: palette.textSecondary }]}>
              {location.brand}
            </Text>
          </View>
        ) : null}
        {location.max_power ? (
          <View style={[styles.metaPill, { backgroundColor: palette.surfaceMuted }]}>
            <Ionicons name="flash-outline" size={13} color={palette.warm} />
            <Text style={[styles.metaPillText, { color: palette.textSecondary }]}>
              {location.max_power} kW
            </Text>
          </View>
        ) : null}
        <View style={[styles.metaPill, { backgroundColor: palette.surfaceMuted }]}>
          <Ionicons name="hardware-chip-outline" size={13} color={palette.textSecondary} />
          <Text style={[styles.metaPillText, { color: palette.textSecondary }]}>
            {totalConnectors} soket
          </Text>
        </View>
      </View>

      <View style={styles.detailEnergyGrid}>
        <View style={[styles.detailMetric, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.detailMetricLabel, { color: palette.textSecondary }]}>
            Geliş
          </Text>
          <Text style={[styles.detailMetricValue, { color: palette.text }]}>
            %{chargeFrom}
          </Text>
        </View>
        <View style={[styles.detailMetric, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.detailMetricLabel, { color: palette.textSecondary }]}>
            Ayrılış
          </Text>
          <Text style={[styles.detailMetricValue, { color: palette.text }]}>
            %{chargeTo}
          </Text>
        </View>
        <View style={[styles.detailMetric, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.detailMetricLabel, { color: palette.textSecondary }]}>
            Dolum
          </Text>
          <Text style={[styles.detailMetricValue, { color: palette.energyCharge }]}>
            +%{chargeAdded}
          </Text>
        </View>
        <View style={[styles.detailMetric, { backgroundColor: palette.surfaceMuted }]}>
          <Text style={[styles.detailMetricLabel, { color: palette.textSecondary }]}>
            Süre
          </Text>
          <Text style={[styles.detailMetricValue, { color: palette.text }]}>
            {location.charge_duration ? `${location.charge_duration} dk` : "—"}
          </Text>
        </View>
      </View>

      {location.interest_highlight ? (
        <View style={[styles.cardDivided, { borderTopColor: palette.hairline }]}>
          <BreakSuggestionRow
            highlight={location.interest_highlight}
            palette={palette}
            caption="Mola önerisi"
          />
        </View>
      ) : null}
    </View>
  );
});

/** Shown only for a preview opened from Oturumlar; sits above the scroll view so every snap point reaches it. */
const PreviewBar = memo(function PreviewBar({
  onClose,
  palette,
}: {
  onClose: () => void;
  palette: SheetPalette;
}) {
  return (
    <View style={styles.previewBar}>
      <Pressable
        onPress={onClose}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Oturumlara dön"
        style={({ pressed }) => [
          styles.backPill,
          cardSurface(palette),
          { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Ionicons name="chevron-back" size={16} color={palette.text} />
        <Text style={[styles.backPillText, { color: palette.text }]}>Oturumlar</Text>
      </Pressable>
      <View style={styles.previewTag}>
        <Ionicons name="eye-outline" size={13} color={palette.textSecondary} />
        <Text style={[styles.previewTagText, { color: palette.textSecondary }]}>
          Önizleme
        </Text>
      </View>
    </View>
  );
});

export function RoutePlanSheet({
  onSheetIndexChange,
  onClosePreview,
}: {
  onSheetIndexChange?: (index: number) => void;
  /** Set while a stored session is only previewed; renders the "‹ Oturumlar" control. */
  onClosePreview?: () => void;
}) {
  const { themeScheme } = useTheme();
  const palette = getSheetPalette(themeScheme === "dark");
  const { top: topInset } = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const lastHandledRouteIdRef = useRef<string | null>(null);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslate = useRef(new Animated.Value(0)).current;

  const snapPoints = useMemo(() => ["15%", "55%", "85%"], []);
  const [routePlanData, setRoutePlanData] = useState(
    DriveSessionStore.getRoutePlanData(),
  );
  const [activePanel, setActivePanel] = useState<"overview" | "stations">(
    "overview",
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      onSheetIndexChange?.(index);
    },
    [onSheetIndexChange],
  );

  useEffect(() => {
    const unsub = DriveSessionStore.onStateChange(() => {
      const context = DriveSessionStore.getContext();
      const planData = context?.routePlanData;
      const currentRouteId = context?.route?.routeId || null;

      setRoutePlanData(planData);

      if (
        planData &&
        currentRouteId &&
        currentRouteId !== lastHandledRouteIdRef.current
      ) {
        lastHandledRouteIdRef.current = currentRouteId;
        setActivePanel("overview");
        setTimeout(() => {
          onSheetIndexChange?.(1);
          bottomSheetRef.current?.snapToIndex(1);
        }, 300);
      }
    });
    return unsub;
  }, [onSheetIndexChange]);

  useEffect(() => {
    onSheetIndexChange?.(1);
  }, [onSheetIndexChange, routePlanData]);

  const animatePanelChange = useCallback(
    (nextPanel: "overview" | "stations", direction: "forward" | "backward") => {
      if (nextPanel === activePanel) return;

      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslate, {
          toValue: direction === "forward" ? -18 : 18,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActivePanel(nextPanel);
        contentTranslate.setValue(direction === "forward" ? 18 : -18);
        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.timing(contentTranslate, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [activePanel, contentOpacity, contentTranslate],
  );

  const openStations = useCallback(
    () => animatePanelChange("stations", "forward"),
    [animatePanelChange],
  );
  const openOverview = useCallback(
    () => animatePanelChange("overview", "backward"),
    [animatePanelChange],
  );

  const locations = routePlanData?.locations;
  const stationLocations = useMemo(
    () => (locations ?? []).filter((location) => location.type === "station"),
    [locations],
  );
  // Server highlights first; a plan that only embeds them in its stops still shows them.
  const highlights = useMemo(() => {
    const listed = routePlanData?.interest_highlights ?? [];
    if (listed.length) return listed;
    return stationLocations
      .map((location) => location.interest_highlight)
      .filter((highlight): highlight is RoutePlanInterestHighlight => !!highlight);
  }, [routePlanData?.interest_highlights, stationLocations]);

  if (!routePlanData || !locations || locations.length < 2) return null;

  const { summary } = routePlanData;
  const optimizationSummary = routePlanData.route_optimization_summary ?? "";
  const hasStations = stationLocations.length > 0;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      // Dynamic sizing (the library default) adds a full-height stop; keep it
      // below the status bar so the preview bar never sits under the clock.
      topInset={topInset}
      onChange={handleSheetChange}
      enablePanDownToClose={false}
      backgroundComponent={SheetGlassBackground}
      handleIndicatorStyle={[styles.handleIndicator, { backgroundColor: palette.handle }]}
      style={styles.sheet}
    >
      {onClosePreview ? <PreviewBar onClose={onClosePreview} palette={palette} /> : null}

      <BottomSheetScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={[
            styles.panel,
            {
              opacity: contentOpacity,
              transform: [{ translateX: contentTranslate }],
            },
          ]}
        >
          {activePanel === "overview" ? (
            <>
              <EnergyOverview locations={locations} palette={palette} />

              <View style={styles.summaryRow}>
                <SummaryCard
                  icon="time-outline"
                  label="Sürüş süresi"
                  value={`${summary.total_travel_duration} dk`}
                  tone="cool"
                  palette={palette}
                />
                <SummaryCard
                  icon="resize-outline"
                  label="Toplam mesafe"
                  value={formatDistanceLabel(summary.total_travel_length)}
                  tone="cool"
                  palette={palette}
                />
              </View>

              <View style={styles.summaryRow}>
                <SummaryCard
                  icon="flash-outline"
                  label="Şarj süresi"
                  value={
                    summary.total_charge_duration > 0
                      ? `${summary.total_charge_duration} dk`
                      : "—"
                  }
                  tone="warm"
                  palette={palette}
                />
                <SummaryCard
                  icon="battery-charging-outline"
                  label="Şarj durakları"
                  value={`${summary.total_station_count}`}
                  tone="accent"
                  palette={palette}
                  onPress={openStations}
                  disabled={!hasStations}
                  showChevron
                />
              </View>

              {highlights.length > 0 ? (
                <BreakSuggestionsSection
                  highlights={highlights}
                  summary={optimizationSummary}
                  palette={palette}
                />
              ) : null}

              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: palette.text }]}>
                  Rota akışı
                </Text>
                <Text style={[styles.sectionSubtitle, { color: palette.textSecondary }]}>
                  Duraklar ve beklenen enerji geçişleri
                </Text>
              </View>

              <View style={styles.timeline}>
                {locations.map((location, idx) => (
                  <TimelineStop
                    key={`${location.type}-${location.name}-${idx}`}
                    location={location}
                    nextLocation={
                      idx < locations.length - 1 ? locations[idx + 1] : null
                    }
                    palette={palette}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.stationPanelHeader}>
                <Pressable
                  onPress={openOverview}
                  accessibilityRole="button"
                  accessibilityLabel="Rota özetine dön"
                  style={({ pressed }) => [
                    styles.roundButton,
                    cardSurface(palette),
                    { opacity: pressed ? 0.7 : 1 },
                  ]}
                >
                  <Ionicons name="chevron-back" size={18} color={palette.text} />
                </Pressable>
                <View style={styles.stationPanelCopy}>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>
                    Şarj noktaları
                  </Text>
                  <Text style={[styles.sectionSubtitle, { color: palette.textSecondary }]}>
                    Dolum planı ve istasyon detayları
                  </Text>
                </View>
              </View>

              {hasStations ? (
                <View style={styles.stationDetailList}>
                  {stationLocations.map((location, index) => (
                    <StationDetailCard
                      key={`${location.name}-${index}`}
                      location={location}
                      palette={palette}
                    />
                  ))}
                </View>
              ) : (
                <View style={[styles.card, styles.emptyCard, cardSurface(palette)]}>
                  <Ionicons
                    name="battery-dead-outline"
                    size={24}
                    color={palette.textSecondary}
                  />
                  <Text style={[styles.emptyTitle, { color: palette.text }]}>
                    Şarj durağı gerekmiyor
                  </Text>
                  <Text style={[styles.emptyBody, { color: palette.textSecondary }]}>
                    Bu rota için ek şarj noktası planlanmadı.
                  </Text>
                </View>
              )}
            </>
          )}
        </Animated.View>

        <View style={[styles.footer, { borderTopColor: palette.hairline }]}>
          <Text style={[styles.footerText, { color: palette.textTertiary }]}>
            Electrip Maps © 2026
          </Text>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    zIndex: 20000,
    elevation: 80,
  },
  handleIndicator: {
    width: 40,
    height: 4,
    borderRadius: 999,
  },
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 60,
  },
  panel: {
    width: PANEL_WIDTH,
    alignSelf: "center",
  },
  card: {
    borderRadius: CARD_RADIUS,
    borderWidth: HAIRLINE,
  },
  cardDivided: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: HAIRLINE,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  mutedIcon: {
    opacity: 0.6,
  },
  // Sentence case on purpose: textTransform "uppercase" turns Turkish i into I.
  eyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  softPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  softPillText: {
    fontSize: 12,
    fontWeight: "700",
  },
  smallPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  smallPillText: {
    fontSize: 11,
    fontWeight: "700",
  },

  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 36,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 18,
    borderWidth: HAIRLINE,
  },
  backPillText: {
    fontSize: 14,
    fontWeight: "600",
  },
  previewTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  previewTagText: {
    fontSize: 12,
    fontWeight: "600",
  },

  energyCard: {
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 18,
    gap: 16,
  },
  energyHeader: {
    gap: 6,
  },
  energyEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  energyTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  energyStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  energyTile: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 2,
  },
  energyTileLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  energyTileValue: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  energyTrackBlock: {
    gap: 8,
  },
  energyTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
  },
  energyTrackFill: {
    height: "100%",
    borderRadius: 999,
  },
  energyTrackMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  energyTrackLabel: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "500",
  },
  energyTrackPercent: {
    fontSize: 13,
    fontWeight: "700",
  },

  summaryRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    gap: 10,
    marginBottom: 10,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryCopy: {
    flex: 1,
    gap: 2,
  },
  summaryLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "700",
  },

  sectionHeader: {
    paddingHorizontal: 12,
    marginTop: 18,
    marginBottom: 10,
    gap: 2,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: "500",
  },
  listCard: {
    marginHorizontal: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  listItemDivided: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: HAIRLINE,
  },

  timeline: {
    paddingHorizontal: 12,
    marginTop: 4,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  timelineDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  locationName: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  locationNameStrong: {
    fontSize: 16.5,
    fontWeight: "700",
  },
  segment: {
    flexDirection: "row",
    minHeight: 64,
  },
  segmentRail: {
    width: 26,
    alignItems: "center",
  },
  segmentLine: {
    flex: 1,
    width: 0,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  segmentInfo: {
    flex: 1,
    paddingLeft: 14,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 5,
  },
  segmentMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  segmentTravelText: {
    fontSize: 13.5,
    fontWeight: "600",
  },
  segmentWeather: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  segmentWeatherIcon: {
    width: 22,
    height: 22,
  },
  segmentWeatherText: {
    fontSize: 13,
    fontWeight: "600",
  },
  segmentBatteryText: {
    fontSize: 13.5,
    fontWeight: "700",
  },

  stationCard: {
    marginLeft: 40,
    marginVertical: 6,
    padding: 16,
  },
  stationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  stationNameBlock: {
    flex: 1,
    gap: 6,
  },
  stationName: {
    fontSize: 14,
    fontWeight: "700",
  },
  stationBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  stationBrand: {
    fontSize: 11.5,
    fontWeight: "600",
  },
  stationFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  stationBatteryText: {
    fontSize: 14.5,
    fontWeight: "700",
  },
  stationChargeTime: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stationChargeText: {
    fontSize: 13.5,
    fontWeight: "700",
  },

  stationPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: HAIRLINE,
    alignItems: "center",
    justifyContent: "center",
  },
  stationPanelCopy: {
    flex: 1,
    gap: 2,
  },
  stationDetailList: {
    paddingHorizontal: 12,
    gap: 12,
  },
  detailCard: {
    padding: 16,
    gap: 14,
  },
  detailTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  detailTitleBlock: {
    flex: 1,
    gap: 4,
  },
  detailTitle: {
    fontSize: 16.5,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  detailAddress: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  detailMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  metaPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailEnergyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  detailMetric: {
    width: "48%",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 2,
  },
  detailMetricLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  detailMetricValue: {
    fontSize: 21,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  emptyCard: {
    marginHorizontal: 12,
    padding: 24,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyBody: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 18,
  },

  footer: {
    alignItems: "center",
    paddingVertical: 28,
    borderTopWidth: HAIRLINE,
    marginTop: 20,
    marginHorizontal: 20,
  },
  footerText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
});
