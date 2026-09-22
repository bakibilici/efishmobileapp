import {
  StackActions,
  useNavigation,
  useRoute,
  type ParamListBase,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSharedValue, withTiming } from "react-native-reanimated";

import { hasRouteSheet } from "@/components/RoutePlanSheet";
import { BatteryCard, hasBatteryLevels } from "@/components/route-sheet/BatteryCard";
import { stationForHighlight } from "@/components/route-sheet/breakDetail";
import { BreakDetailPanel } from "@/components/route-sheet/BreakDetailPanel";
import { BreakSuggestionRow } from "@/components/route-sheet/BreakSuggestionRow";
import {
  DestructiveRow,
  Group,
  GroupFooter,
  SectionHeader,
  SIDE_MARGIN,
  TitleBlock,
} from "@/components/route-sheet/Grouped";
import {
  levelOfIndex,
  MIDDLE_LEVEL,
  routeSheetModeOf,
  supportsNativeRouteSheet,
} from "@/components/route-sheet/nativeRouteSheet";
import {
  arrivalLevel,
  batteryTrajectory,
  computeLegs,
  formatKm,
  formatMinutes,
  fromOrigin,
  startLevel,
} from "@/components/route-sheet/routeFormat";
import { routeSheetBridge } from "@/components/route-sheet/routeSheetBridge";
import { RouteSteps } from "@/components/route-sheet/RouteSteps";
import {
  SHEET_BACK_INSET,
  SHEET_BACK_SIZE,
  SheetMotionContext,
  type SheetMotion,
} from "@/components/route-sheet/sheetMotion";
import { getNativeSheetPalette } from "@/components/route-sheet/sheetPalette";
import { StationsPanel } from "@/components/route-sheet/StationsPanel";
import { SummaryStrip, type SummaryItem } from "@/components/route-sheet/SummaryStrip";
import { GlassNavButton } from "@/components/ui/GlassNavButton";
import { useTheme } from "@/context/ThemeContext";
import {
  DriveSessionState,
  DriveSessionStore,
  type RoutePlanInterestHighlight,
  type RoutePlanLocation,
} from "@/services/DriveSessionStore";
import { destinationTitle, isCoordinatePair } from "@/services/placeTitle";

/**
 * The route panel as the system's own sheet, on iOS 26 (a formSheet of the
 * root stack, presented by RouteSheetPresenter; options in
 * nativeRouteSheet): Liquid Glass at the middle and the peek, opaque and
 * edge to edge at the full height, glass again when dragged down. The
 * system draws all of it, so nothing here has a background.
 *
 * The content and its panels are the gorhom sheet's (RoutePlanSheet),
 * which Android and older iOS keep; this screen repeats its orchestration
 * (panels, fades, the back ladder) around the same sheet-agnostic parts.
 *
 * react-native-screens 4.16 lays a form sheet's scroll view out right only
 * when it is the screen's one top-level view: a header beside it breaks
 * for good once the sheet visits a stop shorter than the header. So the
 * back button is the scroll view's first child, pinned as a sticky header.
 */

/** Room under the system grabber before the back button and the title's first line. */
const TOP_PADDING = 22;
/** Around the button inside its sticky slot, so its 44 pt touch area stays inside the slot. */
const BACK_SLOT_SLACK = 6;
const STICKY_BACK_SLOT = [0];
const TITLE_SHIFT_MS = 180;

/** As RoutePlanSheet: every panel change fades and slides this way. */
const PANEL_FADE_OUT_MS = 150;
const PANEL_FADE_IN_MS = 200;
const PANEL_SLIDE = 18;

type Panel = "overview" | "stations" | "break";
type OpenBreak = {
  highlight: RoutePlanInterestHighlight;
  station: RoutePlanLocation | null;
  stationIndex: number | null;
  from: "overview" | "stations";
};

/** As RoutePlanSheet's: "Kadıköy, İstanbul'dan · şarj dahil 4 sa 50 dk". */
const routeSubtitle = (origin: string | undefined, tripWithCharging: string | null) => {
  const trip = tripWithCharging ? `şarj dahil ${tripWithCharging}` : null;
  const from = origin && !isCoordinatePair(origin) ? fromOrigin(origin) : null;
  if (!from) return trip && trip.charAt(0).toLocaleUpperCase("tr-TR") + trip.slice(1);
  return trip ? `${from} · ${trip}` : from;
};

export default function RouteSheetScreen() {
  const params = useLocalSearchParams();
  const mode = routeSheetModeOf(params);
  const isPreviewSheet = mode === "preview";
  const navigation = useNavigation<NativeStackNavigationProp<ParamListBase>>();
  const route = useRoute();
  const router = useRouter();
  const { themeScheme } = useTheme();
  const palette = getNativeSheetPalette(themeScheme === "dark");
  const scrollRef = useRef<ScrollView>(null);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslate = useRef(new Animated.Value(0)).current;

  // The last plan stays on screen while the sheet slides away after its
  // route went (removed, the preview left, the drive ended).
  const [routePlanData, setRoutePlanData] = useState(() => DriveSessionStore.getRoutePlanData());
  const [driveState, setDriveState] = useState(() => DriveSessionStore.getState());
  const [isStorePreview, setIsStorePreview] = useState(
    () => !!DriveSessionStore.getContext()?.isPreviewMode,
  );
  const lastHandledRouteIdRef = useRef(DriveSessionStore.getContext()?.route?.routeId || null);
  const [activePanel, setActivePanel] = useState<Panel>("overview");
  const [openBreak, setOpenBreak] = useState<OpenBreak | null>(null);
  /** The stop the sheet settled at, as a level; it opens at the middle. */
  const [level, setLevel] = useState(MIDDLE_LEVEL);
  /** Set from a panel change's first frame until its fade-in ends (RoutePlanSheet). */
  const panelTransitionRef = useRef(false);
  const [panelSwaps, setPanelSwaps] = useState(0);

  // Registers how to close exactly this screen, and reports the stop the
  // driver settles on: iOS reports a stop only once a drag has settled,
  // never while presenting or closing.
  useEffect(() => {
    const stackKey = navigation.getState()?.key;
    const close = () =>
      navigation.dispatch({ ...StackActions.pop(), source: route.key, target: stackKey });
    routeSheetBridge.sheetDidMount(route.key, mode, close);
    const unsubscribe = navigation.addListener("sheetDetentChange", (event) => {
      const next = levelOfIndex(event.data.index, isPreviewSheet);
      setLevel(next);
      DriveSessionStore.setRoutePlanSheetIndex(next);
    });
    return () => {
      unsubscribe();
      routeSheetBridge.sheetDidUnmount(route.key);
    };
  }, [navigation, route.key, mode, isPreviewSheet]);

  // Opened where it has nothing to show (a device without the system sheet,
  // a route already gone): it closes itself.
  const [isValidAtMount] = useState(
    () => supportsNativeRouteSheet() && hasRouteSheet(DriveSessionStore.getRoutePlanData()),
  );
  useEffect(() => {
    if (!isValidAtMount) routeSheetBridge.requestDismiss("route-gone");
  }, [isValidAtMount]);

  useEffect(
    () =>
      DriveSessionStore.onStateChange((state) => {
        const context = DriveSessionStore.getContext();
        const planData = context?.routePlanData;
        const currentRouteId = context?.route?.routeId || null;
        if (planData) setRoutePlanData(planData);
        setDriveState(state);
        setIsStorePreview(!!context?.isPreviewMode);

        // A new route while the sheet is up starts again at its overview,
        // scrolled to the top. The sheet stays at its stop: iOS 26's sheet
        // cannot be moved from here once it is up.
        if (planData && currentRouteId && currentRouteId !== lastHandledRouteIdRef.current) {
          lastHandledRouteIdRef.current = currentRouteId;
          setActivePanel("overview");
          scrollRef.current?.scrollTo({ y: 0, animated: true });
        }
      }),
    [],
  );

  /** "Haritaya dön": the map, header and orb come back; the capsule reopens the sheet. */
  const closeSheet = useCallback(() => routeSheetBridge.requestDismiss("user"), []);

  // A preview AKBA is not live in can be left for Oturumlar (the map
  // screen's rule). The sheet goes first: navigating with it on top would
  // stack a second tab navigator.
  const canClosePreview =
    isStorePreview && driveState === DriveSessionState.NAVIGATION_ONLY;
  const closePreview = useCallback(() => {
    routeSheetBridge.requestDismiss("leave");
    DriveSessionStore.closePreview();
    router.navigate("/(tabs)/sessions");
  }, [router]);

  const confirmRemoveRoute = useCallback(() => {
    Alert.alert(
      "Rota kaldırılsın mı?",
      "Harita ve rota özeti temizlenir. Sürüş ve AKBA açık kalır.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kaldır",
          style: "destructive",
          // The sheet slides away first; the route is cleared once it has
          // gone (routeSheetBridge), 700 ms later at the latest.
          onPress: () => routeSheetBridge.requestDismiss("remove"),
        },
      ],
    );
  }, []);

  const locations = routePlanData?.locations;
  const stationLocations = useMemo(
    () => (locations ?? []).filter((location) => location.type === "station"),
    [locations],
  );

  const animatePanelChange = useCallback(
    (nextPanel: Panel, direction: "forward" | "backward") => {
      if (panelTransitionRef.current || nextPanel === activePanel) return;
      panelTransitionRef.current = true;

      Animated.parallel([
        Animated.timing(contentOpacity, {
          toValue: 0,
          duration: PANEL_FADE_OUT_MS,
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslate, {
          toValue: direction === "forward" ? -PANEL_SLIDE : PANEL_SLIDE,
          duration: PANEL_FADE_OUT_MS,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActivePanel(nextPanel);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        contentTranslate.setValue(direction === "forward" ? PANEL_SLIDE : -PANEL_SLIDE);
        setPanelSwaps((count) => count + 1);
      });
    },
    [activePanel, contentOpacity, contentTranslate],
  );

  useEffect(() => {
    if (!panelSwaps) return;
    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: PANEL_FADE_IN_MS,
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslate, {
        toValue: 0,
        duration: PANEL_FADE_IN_MS,
        useNativeDriver: true,
      }),
    ]).start(() => {
      panelTransitionRef.current = false;
    });
  }, [panelSwaps, contentOpacity, contentTranslate]);

  const openStations = useCallback(
    () => animatePanelChange("stations", "forward"),
    [animatePanelChange],
  );
  const openOverview = useCallback(
    () => animatePanelChange("overview", "backward"),
    [animatePanelChange],
  );
  const openBreakDetail = useCallback(
    (highlight: RoutePlanInterestHighlight, station?: RoutePlanLocation) => {
      if (panelTransitionRef.current || activePanel === "break") return;
      const stationIndex = station ? stationLocations.indexOf(station) : -1;
      setOpenBreak({
        highlight,
        station: station ?? null,
        stationIndex: stationIndex >= 0 ? stationIndex : null,
        from: activePanel,
      });
      animatePanelChange("break", "forward");
    },
    [activePanel, animatePanelChange, stationLocations],
  );
  const breakBackTo = openBreak?.from ?? "overview";
  const closeBreakDetail = useCallback(
    () => animatePanelChange(breakBackTo, "backward"),
    [animatePanelChange, breakBackTo],
  );

  /** One level up, as in RoutePlanSheet: break → its panel, stops → overview, overview → Oturumlar or the map. */
  const backAction =
    activePanel === "break"
      ? {
          label: breakBackTo === "stations" ? "Şarj duraklarına dön" : "Rota özetine dön",
          onPress: closeBreakDetail,
        }
      : activePanel === "stations"
        ? { label: "Rota özetine dön", onPress: openOverview }
        : isPreviewSheet
          ? canClosePreview
            ? { label: "Oturumlara dön", onPress: closePreview }
            : null
          : { label: "Haritaya dön", onPress: closeSheet };

  const backPress = backAction?.onPress;
  const goBack = useCallback(() => {
    if (panelTransitionRef.current) return;
    backPress?.();
  }, [backPress]);

  // At a preview's peek the car-mode header above the sheet holds its own
  // "Oturumlara dön": the sheet's would be a second one, so it steps aside
  // there, and the title slides back into its room.
  const hasBackAction = !!backAction;
  const showBackButton =
    hasBackAction && !(isPreviewSheet && level === 0 && activePanel === "overview");

  // The gorhom sheet's motion at its highest stop, held there: the title
  // keeps the back button's room and sits beside it. Only the slide follows
  // the button in and out.
  const topProgress = useSharedValue(1);
  const titleShift = useSharedValue(showBackButton ? SHEET_BACK_INSET : 0);
  useEffect(() => {
    titleShift.value = withTiming(showBackButton ? SHEET_BACK_INSET : 0, {
      duration: TITLE_SHIFT_MS,
    });
  }, [showBackButton, titleShift]);
  const sheetMotion = useMemo<SheetMotion>(
    () => ({ topProgress, hasBack: hasBackAction, titleShift }),
    [topProgress, hasBackAction, titleShift],
  );

  const summary = routePlanData?.summary;
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

  const destination = useMemo(() => destinationTitle(routePlanData), [routePlanData]);

  const breakStation = useMemo(
    () =>
      openBreak ? stationForHighlight(openBreak.highlight, stationLocations, openBreak) : null,
    [openBreak, stationLocations],
  );
  const breakHighlight = useMemo(() => {
    if (!openBreak) return null;
    const opened = openBreak.highlight;
    const held =
      highlights.includes(opened) ||
      stationLocations.some((location) => location.interest_highlight === opened);
    if (held) return opened;
    const id = opened.id?.trim();
    if (!id) return opened;
    const own = breakStation?.interest_highlight;
    if (own?.id?.trim() === id) return own;
    const sameId = highlights.filter((highlight) => highlight.id?.trim() === id);
    const current =
      sameId.length === 1
        ? sameId[0]
        : sameId.find((highlight) => highlight.stationName === opened.stationName);
    return current ?? opened;
  }, [openBreak, highlights, stationLocations, breakStation]);

  if (!isValidAtMount || !routePlanData || !locations || locations.length < 2 || !summary) {
    return null;
  }

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
  const optimizationSummary = routePlanData.route_optimization_summary?.trim();
  const breakFooter = optimizationSummary
    ? optimizationSummary.split(" | ").join(" · ")
    : "İlgi alanlarınıza göre, şarj beklerken yapabilecekleriniz.";

  return (
    <SheetMotionContext.Provider value={sheetMotion}>
      {/* The screen's one top-level view (see above), with no background:
          the system's glass and its opaque top show through. */}
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={STICKY_BACK_SLOT}
        // VoiceOver's two-finger scrub anywhere in the sheet: the back button.
        onAccessibilityEscape={backAction ? goBack : undefined}
      >
        {/* Pinned under the grabber, left of the title's first line. */}
        <View style={styles.backSlot} pointerEvents="box-none">
          {backAction ? (
            <GlassNavButton
              visible={showBackButton}
              size={SHEET_BACK_SIZE}
              onPress={goBack}
              onAccessibilityEscape={goBack}
              accessibilityLabel={backAction.label}
            />
          ) : null}
        </View>

        <Animated.View
          style={[
            styles.panel,
            { opacity: contentOpacity, transform: [{ translateX: contentTranslate }] },
          ]}
        >
          {activePanel === "overview" ? (
            <>
              <TitleBlock
                title={destination?.title ?? "Rota"}
                address={destination?.address}
                subtitle={subtitle}
                palette={palette}
              />

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
                        onPress={openBreakDetail}
                      />
                    ))}
                  </Group>
                  <GroupFooter text={breakFooter} palette={palette} />
                </>
              ) : null}

              <SectionHeader title="ROTA" palette={palette} />
              <RouteSteps
                locations={locations}
                legs={legs}
                destination={destination}
                palette={palette}
              />

              {!isPreviewSheet ? (
                <DestructiveRow
                  label="Rotayı kaldır"
                  accessibilityHint="Onay sorar. Sürüş ve AKBA açık kalır."
                  onPress={confirmRemoveRoute}
                  palette={palette}
                />
              ) : null}
            </>
          ) : activePanel === "stations" ? (
            <StationsPanel
              stations={stationLocations}
              totalChargeMinutes={summary.total_charge_duration}
              palette={palette}
              onOpenBreak={openBreakDetail}
            />
          ) : breakHighlight ? (
            <BreakDetailPanel
              highlight={breakHighlight}
              station={breakStation}
              palette={palette}
            />
          ) : null}

          <Text style={[styles.footerText, { color: palette.tertiaryLabel }]}>
            AKBA © 2026
          </Text>
        </Animated.View>
      </ScrollView>
    </SheetMotionContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 60,
  },
  // Only as wide as the button: the slot stays over the title's first line.
  // Sized explicitly: the sticky header gives its child flex 1, which
  // without a fixed size stretched the slot to the whole sheet. The sticky
  // header also moves this style onto its own wrapper view, so pointerEvents
  // goes here (a prop would stay on the inner view): only the button takes
  // touches, and rows scrolled under the slot stay tappable.
  backSlot: {
    pointerEvents: "box-none",
    alignSelf: "flex-start",
    width: SIDE_MARGIN + SHEET_BACK_SIZE + BACK_SLOT_SLACK,
    height: TOP_PADDING + SHEET_BACK_SIZE + BACK_SLOT_SLACK,
    paddingTop: TOP_PADDING,
    paddingLeft: SIDE_MARGIN,
  },
  // Up beside the pinned button: the title's first line centres on it.
  panel: {
    marginTop: -(SHEET_BACK_SIZE + BACK_SLOT_SLACK),
  },
  groupSeparator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 16,
  },
  footerText: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "400",
    letterSpacing: 0,
  },
});
