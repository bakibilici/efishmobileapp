import Ionicons from "@expo/vector-icons/Ionicons";
import BottomSheet, {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "../context/ThemeContext";
import {
  DriveSessionStore,
  RoutePlanInterestHighlight,
} from "../services/DriveSessionStore";
import { BatteryCard, hasBatteryLevels } from "./route-sheet/BatteryCard";
import { BreakSuggestionRow } from "./route-sheet/BreakSuggestionRow";
import {
  BackPill,
  Group,
  GroupFooter,
  SectionHeader,
  TitleBlock,
} from "./route-sheet/Grouped";
import {
  arrivalLevel,
  batteryTrajectory,
  computeLegs,
  formatKm,
  formatMinutes,
  startLevel,
  withAblative,
} from "./route-sheet/routeFormat";
import { RouteSteps } from "./route-sheet/RouteSteps";
import { scrollHandlersReportingScrolled } from "./route-sheet/scrolledUnderBar";
import { SheetGlassBackground } from "./route-sheet/SheetGlassBackground";
import { getSheetPalette, SheetPalette } from "./route-sheet/sheetPalette";
import { StationsPanel } from "./route-sheet/StationsPanel";
import { SummaryStrip, type SummaryItem } from "./route-sheet/SummaryStrip";

/**
 * Shown only for a preview opened from Oturumlar; sits above the scroll view
 * so every snap point reaches it. Works like a navigation bar: "‹ Oturumlar"
 * on the overview, "‹ Rota" on the stations panel, and a hairline under it
 * once content scrolls beneath.
 */
const PreviewBar = memo(function PreviewBar({
  label,
  accessibilityLabel,
  onPress,
  scrolled,
  palette,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  scrolled: boolean;
  palette: SheetPalette;
}) {
  return (
    <View
      style={[
        styles.previewBar,
        { borderBottomColor: scrolled ? palette.separator : "transparent" },
      ]}
    >
      <BackPill
        label={label}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        palette={palette}
      />
      <View style={styles.previewTag}>
        <Ionicons name="eye-outline" size={13} color={palette.textSecondary} />
        <Text style={[styles.previewTagText, { color: palette.textSecondary }]}>
          Önizleme
        </Text>
      </View>
    </View>
  );
});

/**
 * "Kadıköy, İstanbul'dan · şarj dahil 4 sa 50 dk": the strip below already
 * counts the stops, so the subtitle gives the one number it lacks, the trip
 * time with charging. Without charging it names only the origin.
 */
const routeSubtitle = (origin: string | undefined, tripWithCharging: string | null) => {
  const trip = tripWithCharging ? `şarj dahil ${tripWithCharging}` : null;
  const name = origin?.trim();
  if (!name) return trip && trip.charAt(0).toLocaleUpperCase("tr-TR") + trip.slice(1);
  const from = withAblative(name) ?? `${name} çıkışlı`;
  return trip ? `${from} · ${trip}` : from;
};


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
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
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
  // Content under the preview bar: shows the bar's hairline, as in iOS.
  const [scrolled, setScrolled] = useState(false);
  const scrollEventsHandlersHook = useMemo(
    () => scrollHandlersReportingScrolled(setScrolled),
    [],
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
        // A pushed or popped panel starts at its top, while it is faded out.
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        setScrolled(false);
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
  const summary = routePlanData?.summary;
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

  const legs = useMemo(
    () => computeLegs(locations ?? [], summary?.total_travel_length ?? 0),
    [locations, summary?.total_travel_length],
  );
  const battery = useMemo(() => {
    const list = locations ?? [];
    return {
      start: startLevel(list),
      end: arrivalLevel(list),
      trajectory: batteryTrajectory(list, legs),
    };
  }, [locations, legs]);

  const hasStations = stationLocations.length > 0;
  const stopCount = summary?.total_station_count ?? stationLocations.length;
  const summaryItems = useMemo<SummaryItem[]>(() => {
    const drive = formatMinutes(summary?.total_travel_duration) ?? "—";
    const distance = formatKm(summary?.total_travel_length) ?? "—";
    const items: SummaryItem[] = [
      { label: "SÜRÜŞ", value: drive, accessibilityLabel: `Sürüş süresi ${drive}` },
      { label: "MESAFE", value: distance, accessibilityLabel: `Toplam mesafe ${distance}` },
    ];
    if (hasStations) {
      const charge = formatMinutes(summary?.total_charge_duration) ?? "—";
      items.push(
        { label: "ŞARJ", value: charge, accessibilityLabel: `Şarj süresi ${charge}` },
        {
          label: "DURAK",
          value: `${stopCount}`,
          onPress: openStations,
          accessibilityLabel: `${stopCount} şarj durağı, durakları göster`,
        },
      );
    } else {
      items.push({
        label: "DURAK",
        value: "Yok",
        accessibilityLabel: "Şarj durağı yok",
      });
    }
    return items;
  }, [summary, hasStations, stopCount, openStations]);

  if (!routePlanData || !locations || locations.length < 2 || !summary) return null;

  const destinationName =
    locations[locations.length - 1]?.name?.trim() ||
    routePlanData.waypoints?.destination ||
    "Rota";
  const chargeMinutes = summary.total_charge_duration;
  const tripWithCharging =
    hasStations && formatMinutes(chargeMinutes)
      ? formatMinutes((summary.total_travel_duration || 0) + chargeMinutes)
      : null;
  const subtitle = routeSubtitle(
    locations[0]?.name || routePlanData.waypoints?.origin,
    tripWithCharging,
  );
  const showBattery = hasBatteryLevels(battery.start, battery.end);
  // The on-device fallback joins its stops with " | "; read as a sentence here.
  const optimizationSummary = routePlanData.route_optimization_summary?.trim();
  const breakFooter = optimizationSummary
    ? optimizationSummary.split(" | ").join(" · ")
    : "İlgi alanlarınıza göre, şarj beklerken yapabilecekleriniz.";

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
      {onClosePreview ? (
        activePanel === "stations" ? (
          <PreviewBar
            label="Rota"
            accessibilityLabel="Rota özetine dön"
            onPress={openOverview}
            scrolled={scrolled}
            palette={palette}
          />
        ) : (
          <PreviewBar
            label="Oturumlar"
            accessibilityLabel="Oturumlara dön"
            onPress={onClosePreview}
            scrolled={scrolled}
            palette={palette}
          />
        )
      ) : null}

      <BottomSheetScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventsHandlersHook={scrollEventsHandlersHook}
      >
        <Animated.View
          style={{
            opacity: contentOpacity,
            transform: [{ translateX: contentTranslate }],
          }}
        >
          {activePanel === "overview" ? (
            <>
              <TitleBlock title={destinationName} subtitle={subtitle} palette={palette} />

              <Group palette={palette}>
                <SummaryStrip items={summaryItems} palette={palette} />
                {showBattery ? (
                  <>
                    <View
                      style={[styles.groupSeparator, { backgroundColor: palette.separator }]}
                    />
                    <BatteryCard
                      start={battery.start}
                      end={battery.end}
                      trajectory={battery.trajectory}
                      palette={palette}
                    />
                  </>
                ) : null}
              </Group>

              {highlights.length > 0 ? (
                <>
                  <SectionHeader title="MOLA ÖNERİLERİ" palette={palette} />
                  <Group palette={palette}>
                    {highlights.map((highlight, index) => (
                      <BreakSuggestionRow
                        key={highlight.id || `${highlight.stationName}-${index}`}
                        highlight={highlight}
                        palette={palette}
                        divided={index > 0}
                      />
                    ))}
                  </Group>
                  <GroupFooter text={breakFooter} palette={palette} />
                </>
              ) : null}

              <SectionHeader title="ROTA" palette={palette} />
              <RouteSteps locations={locations} legs={legs} palette={palette} />
            </>
          ) : (
            <StationsPanel
              stations={stationLocations}
              totalChargeMinutes={summary.total_charge_duration}
              onBack={openOverview}
              showBack={!onClosePreview}
              palette={palette}
            />
          )}
        </Animated.View>

        <Text style={[styles.footerText, { color: palette.tertiaryLabel }]}>
          Electrip Maps © 2026
        </Text>
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
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
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
  footerText: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "400",
    letterSpacing: 0,
  },
});
