import BottomSheet, {
  BottomSheetScrollView,
  type BottomSheetScrollViewMethods,
} from "@gorhom/bottom-sheet";
import { useFocusEffect } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  BackHandler,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Extrapolation,
  interpolate,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";

import { useTheme } from "../context/ThemeContext";
import {
  DriveSessionStore,
  RoutePlanData,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../services/DriveSessionStore";
import { destinationTitle, isCoordinatePair } from "../services/placeTitle";
import { getRoutePlanGatewayUrl } from "../services/routePlanGateway";
import { BatteryCard, hasBatteryLevels } from "./route-sheet/BatteryCard";
import { photoCreditLine, stationForHighlight } from "./route-sheet/breakDetail";
import { BreakDetailPanel } from "./route-sheet/BreakDetailPanel";
import { BreakSuggestionRow } from "./route-sheet/BreakSuggestionRow";
import {
  DestructiveRow,
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
  fromOrigin,
  startLevel,
} from "./route-sheet/routeFormat";
import { useReportRouteSheetPanel } from "./route-sheet/routeSheetPanel";
import { RouteSteps } from "./route-sheet/RouteSteps";
import { SheetBackButton, SheetCloseButton } from "./route-sheet/SheetBackButton";
import { SheetGlassBackground } from "./route-sheet/SheetGlassBackground";
import {
  FLOATING_BACK_LEFT,
  FLOATING_BACK_TOP,
  SHEET_BACK_INSET,
  SHEET_BACK_REVEAL_START,
  SheetMotionContext,
  TOP_HANDOVER,
  type SheetMotion,
} from "./route-sheet/sheetMotion";
import { getSheetPalette } from "./route-sheet/sheetPalette";
import { StationsPanel } from "./route-sheet/StationsPanel";
import { SummaryStrip, type SummaryItem } from "./route-sheet/SummaryStrip";
import { useDestinationPhoto } from "./route-sheet/useDestinationPhoto";
import { GlassNavButton } from "./ui/GlassNavButton";

/**
 * A live route closes all the way (the back button, a swipe down) and has
 * no low peek: that stop left the title half under the orb. A preview keeps
 * it: the car-mode header, with "Sürüşü Başlat", shows above it.
 *
 * The stops count from under the safe area (topInset), so the highest,
 * 100 %, reaches just under the Dynamic Island, as Find My's full-height
 * sheet: there the glass turns almost opaque and a preview's "Oturumlara
 * dön" moves into the sheet (sheetMotion). There is no stop in between, and
 * no stop sized to the content, so the highest is always the last and the
 * full height.
 *
 * The controls follow the HIG, as the system sheet's (app/route-sheet) do:
 * an inner panel's Back is a step inside the sheet, at its top-leading edge
 * at every stop; a live route's sheet has the standard Close at its
 * top-trailing corner; a preview's "Oturumlara dön" leaves the sheet, so it
 * floats outside it at the screen's top-leading corner (the car-mode
 * header's own at the peek) until the sheet covers that corner.
 */
/** The middle stop, in percent of the sheet's container (the screen under the safe area). */
const MIDDLE_SNAP_PERCENT = 55;
const LIVE_SNAP_POINTS = [`${MIDDLE_SNAP_PERCENT}%`, "100%"];
const PREVIEW_SNAP_POINTS = ["15%", `${MIDDLE_SNAP_PERCENT}%`, "100%"];
/** Where a new route and a reopened sheet land. */
const MIDDLE_LEVEL = 1;

/**
 * Every panel change, the stops and a break's page alike and every way back:
 * the panel fades out sliding this far away, the next fades in from the
 * other side. Quick, as a pushed page: a slower fade reads as the sheet
 * hanging.
 */
const PANEL_FADE_OUT_MS = 150;
const PANEL_FADE_IN_MS = 200;
const PANEL_SLIDE = 18;

type Panel = "overview" | "stations" | "break";
/**
 * The break suggestion the detail panel shows, the stop's row it was opened
 * from (null from the overview) with that stop's place among the stops, and
 * the panel its back button returns to.
 */
type OpenBreak = {
  highlight: RoutePlanInterestHighlight;
  station: RoutePlanLocation | null;
  stationIndex: number | null;
  from: "overview" | "stations";
};

/**
 * How tall the sheet stands at its middle stop on a screen this tall (the
 * sheet's parent): the map screen fits a new route into the space above it.
 */
export const routeSheetMiddleHeight = (screenHeight: number, safeTop: number) =>
  (Math.max(0, screenHeight - safeTop) * MIDDLE_SNAP_PERCENT) / 100;

/**
 * Whether a plan gives the route sheet something to show. The map screen
 * asks the same, so Android's back key always has exactly one handler: the
 * sheet's while it is mounted, the map screen's otherwise.
 */
export const hasRouteSheet = (plan: RoutePlanData | null | undefined) =>
  !!plan?.summary && (plan.locations?.length ?? 0) >= 2;

/**
 * The store keeps the sheet's position as a level that means the same with
 * both snap-point sets: -1 closed, 0 the peek (previews only), 1 the middle,
 * 2 and up higher. CarModeView and the map screen read "> 0" as "the sheet
 * covers the lower screen".
 */
const levelOfIndex = (index: number, isPreview: boolean) =>
  index < 0 ? -1 : isPreview ? index : index + 1;
const indexOfLevel = (level: number, isPreview: boolean) =>
  level < 0 ? -1 : isPreview ? level : Math.max(0, level - 1);

/**
 * "Kadıköy, İstanbul'dan · şarj dahil 4 sa 50 dk", "Konumunuzdan · şarj
 * dahil 47 dk": the strip below already counts the stops, so the subtitle
 * gives the one number it lacks, the trip time with charging. Without
 * charging it names only the origin.
 */
const routeSubtitle = (origin: string | undefined, tripWithCharging: string | null) => {
  const trip = tripWithCharging ? `şarj dahil ${tripWithCharging}` : null;
  // A dropped pin's origin is "lat,lng": no name to give.
  const from = origin && !isCoordinatePair(origin) ? fromOrigin(origin) : null;
  if (!from) return trip && trip.charAt(0).toLocaleUpperCase("tr-TR") + trip.slice(1);
  return trip ? `${from} · ${trip}` : from;
};

export function RoutePlanSheet({
  onSheetIndexChange,
  onClosePreview,
}: {
  /** Receives the sheet's level: -1 closed, 0 peek, 1 middle, 2 and up higher. */
  onSheetIndexChange?: (level: number) => void;
  /** Set while a stored session is only previewed and can be left: the back button goes to Oturumlar. */
  onClosePreview?: () => void;
}) {
  const { themeScheme } = useTheme();
  const palette = getSheetPalette(themeScheme === "dark");
  const { top: safeTop } = useSafeAreaInsets();
  const bottomSheetRef = useRef<BottomSheet>(null);
  const scrollRef = useRef<BottomSheetScrollViewMethods>(null);
  const lastHandledRouteIdRef = useRef<string | null>(null);
  /** "Rotayı kaldır" was confirmed: the close that follows clears the route. */
  const removingRouteRef = useRef(false);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  const contentTranslate = useRef(new Animated.Value(0)).current;

  const [routePlanData, setRoutePlanData] = useState(
    DriveSessionStore.getRoutePlanData(),
  );
  const [isPreview, setIsPreview] = useState(
    () => !!DriveSessionStore.getContext()?.isPreviewMode,
  );
  const [activePanel, setActivePanel] = useState<Panel>("overview");
  const [openBreak, setOpenBreak] = useState<OpenBreak | null>(null);
  /**
   * The level the sheet is at or on its way to (onAnimate), so the back
   * button leaves as the sheet starts to close rather than after it has.
   */
  const [targetLevel, setTargetLevel] = useState(-1);

  const hasSheet = hasRouteSheet(routePlanData);
  const sheetMode: "preview" | "live" = isPreview ? "preview" : "live";
  // Where the sheet opens, fixed while it is mounted: BottomSheet's `index`
  // prop is live, and a new value would move the sheet. The sheet mounts
  // again (keyed by mode) when a preview turns into a drive, since the two
  // modes have different snap points. A sheet the driver put away mounts
  // closed.
  const [mounted, setMounted] = useState<{
    mode: "preview" | "live";
    index: number;
  } | null>(null);
  if (!hasSheet) {
    if (mounted) setMounted(null);
  } else if (mounted?.mode !== sheetMode) {
    const dismissed = !isPreview && DriveSessionStore.isRouteSheetDismissed();
    setMounted({
      mode: sheetMode,
      index: dismissed ? -1 : indexOfLevel(MIDDLE_LEVEL, isPreview),
    });
  }
  const mountedMode = mounted?.mode ?? null;
  const sheetModeRef = useRef(sheetMode);
  useEffect(() => {
    sheetModeRef.current = sheetMode;
  }, [sheetMode]);

  // The level a sheet mounts at counts at once: the car-mode view makes way
  // for it without waiting for the opening animation to end.
  useEffect(() => {
    const level = mounted ? levelOfIndex(mounted.index, mounted.mode === "preview") : -1;
    setTargetLevel(level);
    onSheetIndexChange?.(level);
  }, [mounted, onSheetIndexChange]);

  // The store hears the target level as the sheet sets off, not once it has
  // settled: rising from a preview's peek, the car-mode header starts leaving
  // as the back button starts to appear, instead of the button showing under
  // the header for the length of the animation.
  const handleSheetAnimate = useCallback(
    (_fromIndex: number, toIndex: number) => {
      const level = levelOfIndex(toIndex, mountedMode === "preview");
      setTargetLevel(level);
      onSheetIndexChange?.(level);
    },
    [mountedMode, onSheetIndexChange],
  );

  const handleSheetChange = useCallback(
    (index: number) => {
      const level = levelOfIndex(index, mountedMode === "preview");
      setTargetLevel(level);
      onSheetIndexChange?.(level);
      if (level >= 0) return;
      if (removingRouteRef.current) {
        removingRouteRef.current = false;
        DriveSessionStore.clearRoute();
      } else {
        // Close ("Kapat") or a swipe down: the car-mode
        // view offers it back.
        DriveSessionStore.dismissRouteSheet();
      }
    },
    [mountedMode, onSheetIndexChange],
  );

  useEffect(() => {
    let wasDismissed = DriveSessionStore.isRouteSheetDismissed();
    let openTimer: ReturnType<typeof setTimeout> | null = null;
    const openToMiddle = () => {
      setTargetLevel(MIDDLE_LEVEL);
      onSheetIndexChange?.(MIDDLE_LEVEL);
      bottomSheetRef.current?.snapToIndex(
        indexOfLevel(MIDDLE_LEVEL, sheetModeRef.current === "preview"),
      );
    };

    const unsub = DriveSessionStore.onStateChange(() => {
      const context = DriveSessionStore.getContext();
      const planData = context?.routePlanData;
      const currentRouteId = context?.route?.routeId || null;
      // The capsule or the header's trip asked for the sheet back.
      const dismissed = DriveSessionStore.isRouteSheetDismissed();
      const reopened = wasDismissed && !dismissed;
      wasDismissed = dismissed;

      setRoutePlanData(planData);
      setIsPreview(!!context?.isPreviewMode);

      if (
        planData &&
        currentRouteId &&
        currentRouteId !== lastHandledRouteIdRef.current
      ) {
        lastHandledRouteIdRef.current = currentRouteId;
        setActivePanel("overview");
        if (openTimer) clearTimeout(openTimer);
        openTimer = setTimeout(openToMiddle, 300);
      } else if (reopened && planData) {
        openToMiddle();
      }
    });
    return () => {
      unsub();
      if (openTimer) clearTimeout(openTimer);
    };
  }, [onSheetIndexChange]);

  /** The Close button: the map, header and orb come back; the capsule reopens the sheet. */
  const closeSheet = useCallback(() => {
    bottomSheetRef.current?.close();
  }, []);

  const confirmRemoveRoute = useCallback(() => {
    Alert.alert(
      "Rota kaldırılsın mı?",
      "Harita ve rota özeti temizlenir. Sürüş ve AKBA açık kalır.",
      [
        { text: "Vazgeç", style: "cancel" },
        {
          text: "Kaldır",
          style: "destructive",
          onPress: () => {
            // Close first and clear once closed (handleSheetChange), so the
            // sheet slides away instead of vanishing. The timer covers a close
            // that reports nothing.
            removingRouteRef.current = true;
            bottomSheetRef.current?.close();
            setTimeout(() => {
              if (!removingRouteRef.current) return;
              removingRouteRef.current = false;
              DriveSessionStore.clearRoute();
            }, 700);
          },
        },
      ],
    );
  }, []);

  const locations = routePlanData?.locations;
  const stationLocations = useMemo(
    () => (locations ?? []).filter((location) => location.type === "station"),
    [locations],
  );

  /**
   * Set from a panel change's first frame until its fade-in ends. A second
   * tap meanwhile would act on the panel on its way out or the one just in:
   * a quick double tap on back would go two levels up (and could leave the
   * preview), one on a row would push its page twice. Every panel change and
   * every way back waits for it.
   */
  const panelTransitionRef = useRef(false);
  /**
   * Counts the panel swaps: the fade-in starts from the effect below, once
   * the new panel is rendered. Started straight after setActivePanel, it
   * ran a frame or two ahead of the render and showed the old panel again,
   * faintly, before the new one replaced it.
   */
  const [panelSwaps, setPanelSwaps] = useState(0);

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
        // A pushed or popped panel starts at its top, while it is faded out.
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        contentTranslate.setValue(direction === "forward" ? PANEL_SLIDE : -PANEL_SLIDE);
        setPanelSwaps((count) => count + 1);
      });
    },
    [activePanel, contentOpacity, contentTranslate],
  );

  // The new panel is on screen, still faded out: it fades in from the side
  // the change set above. Every swap runs this, so the lock always ends.
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
  /**
   * A break suggestion's row, in the overview or a stop's row: its detail
   * page, one level down. A stop's row names its stop, so the page shows
   * that stop even when two share a name or a suggestion id.
   */
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

  /**
   * Back, one level up as in a navigation stack: a break suggestion's page
   * goes back to where it was opened (the overview or the stops), the
   * stations panel back to the route overview (a step inside the sheet); a
   * preview's overview leaves for Oturumlar. A preview AKBA is live in has
   * no way back yet (see mainpage), so its overview has none. A live route's
   * overview has no Back: its sheet has Close instead.
   */
  const isPreviewSheet = mounted?.mode === "preview";
  const isInnerPanel = !!mounted && activePanel !== "overview";
  useReportRouteSheetPanel(isInnerPanel);
  const panelBack = !mounted
    ? null
    : activePanel === "break"
      ? {
          label: breakBackTo === "stations" ? "Şarj duraklarına dön" : "Rota özetine dön",
          onPress: closeBreakDetail,
        }
      : activePanel === "stations"
        ? { label: "Rota özetine dön", onPress: openOverview }
        : null;
  const backAction =
    panelBack ??
    (isPreviewSheet && onClosePreview
      ? { label: "Oturumlara dön", onPress: onClosePreview }
      : null);
  /** A live route's sheet closes (Close, a swipe down); a preview's has no Close. */
  const hasClose = !!mounted && !isPreviewSheet;
  const isSheetOpen = targetLevel >= 0;

  /**
   * The back action as both buttons, VoiceOver's escape and Android's back
   * key run it: ignored while a panel change is under way, so a quick second
   * tap does not run the action of the level above.
   */
  const backPress = backAction?.onPress;
  const goBack = useCallback(() => {
    if (panelTransitionRef.current) return;
    backPress?.();
  }, [backPress]);
  /** VoiceOver's escape and Android's back key: Back, else Close. */
  const escape = backAction ? goBack : hasClose ? closeSheet : null;

  /**
   * The sheet's position for the parts that follow it frame by frame, all on
   * the UI thread: the index the library animates (fractional between stops)
   * turned into 0 at the middle stop and 1 at the highest. The background
   * fades its opaque fill with it; the title slides right for a preview's
   * "Oturumlara dön" as that fades into the sheet (an inner panel's Back
   * stands there at every stop, its title beside it). React hears only the
   * handover itself.
   */
  const sheetIndex = useSharedValue(-1);
  const topIndex =
    (mountedMode === "preview" ? PREVIEW_SNAP_POINTS : LIVE_SNAP_POINTS).length - 1;
  const topProgress = useDerivedValue(
    () =>
      interpolate(sheetIndex.value, [topIndex - 1, topIndex], [0, 1], Extrapolation.CLAMP),
    [topIndex],
  );
  const hasBackAction = !!backAction;
  const backPinned = !!panelBack;
  const titleShift = useDerivedValue(
    () =>
      backPinned
        ? SHEET_BACK_INSET
        : hasBackAction
          ? interpolate(
              topProgress.value,
              [SHEET_BACK_REVEAL_START, 1],
              [0, SHEET_BACK_INSET],
              Extrapolation.CLAMP,
            )
          : 0,
    [hasBackAction, backPinned],
  );
  const sheetMotion = useMemo<SheetMotion>(
    () => ({ topProgress, hasBack: hasBackAction, hasClose, titleShift }),
    [topProgress, hasBackAction, hasClose, titleShift],
  );
  const [isNearTop, setIsNearTop] = useState(false);
  useAnimatedReaction(
    () => topProgress.value >= TOP_HANDOVER,
    (nearTop, previous) => {
      if (nearTop !== previous) scheduleOnRN(setIsNearTop, nearTop);
    },
    [topProgress],
  );

  // Only a preview overview's "Oturumlara dön" floats outside the sheet. Its
  // low peek leaves the top of the screen to the car-mode header (it holds
  // "Sürüşü Başlat" and its own "Oturumlara dön" chevron), which is drawn
  // above this screen; the header leaves as the sheet rises past it. Near
  // the highest stop the sheet would run into the floating button: the
  // sheet's own button (SheetBackButton) takes over there.
  const floatsBack = !!backAction && !backPinned;
  const showFloatingBack = floatsBack && targetLevel >= 1 && !isNearTop;

  // Android's back key follows the buttons, and also works at a preview's
  // peek. With the sheet put away it is left to the system.
  const hardwareBackRef = useRef<(() => void) | null>(null);
  hardwareBackRef.current = escape && isSheetOpen ? escape : null;
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        const goBack = hardwareBackRef.current;
        if (!goBack) return false;
        goBack();
        return true;
      });
      return () => subscription.remove();
    }, []),
  );

  const summary = routePlanData?.summary;
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

  // "Alemdağ Cd. No:940" (or the agent's "Metrogarden AVM") as the title, the
  // full address under it: never a two-line postal address as the title.
  // Shared with the ROTA list's destination row.
  const destination = useMemo(() => destinationTitle(routePlanData), [routePlanData]);
  /** Null for a plan without one, which is the header exactly as it was. */
  const destinationPhoto = useDestinationPhoto(routePlanData);

  // The open suggestion's stop: the stop's row it was opened from while the
  // plan holds it, else its carrier, its id, its place, its name
  // (stationForHighlight). Then the suggestion as the plan has it now: the
  // object itself while the plan holds it; after the plan is saved again
  // (new objects, same ids), that stop's own suggestion of the same id, else
  // the one listed suggestion of that id.
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

  if (!mounted || !routePlanData || !locations || locations.length < 2 || !summary) {
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
  // The on-device fallback joins its stops with " | "; read as a sentence here.
  const optimizationSummary = routePlanData.route_optimization_summary?.trim();
  const summaryLine = optimizationSummary
    ? optimizationSummary.split(" | ").join(" · ")
    : "İlgi alanlarınıza göre, şarj beklerken yapabilecekleriniz.";
  // Google's credit belongs on the screen the photo is on, on its own quiet
  // line rather than run on to a sentence that is already full.
  const photoCredits = photoCreditLine(highlights, getRoutePlanGatewayUrl());
  const breakFooter = photoCredits ? `${summaryLine}\n${photoCredits}` : summaryLine;

  const isLive = mounted.mode === "live";

  return (
    <>
      <SheetMotionContext.Provider value={sheetMotion}>
        <BottomSheet
          key={mounted.mode}
          ref={bottomSheetRef}
          index={mounted.index}
          snapPoints={isLive ? LIVE_SNAP_POINTS : PREVIEW_SNAP_POINTS}
          // The stops count from under the safe area; 100 % is the full height
          // under the Dynamic Island. No stop sized to the content.
          topInset={safeTop}
          enableDynamicSizing={false}
          animatedIndex={sheetIndex}
          onAnimate={handleSheetAnimate}
          onChange={handleSheetChange}
          // Swiping a live route's sheet down does what Close ("Kapat") does.
          enablePanDownToClose={isLive}
          backgroundComponent={SheetGlassBackground}
          // The library makes its content one "Bottom Sheet" element
          // (adjustable), which hides the rows and the sheet's own back
          // button from VoiceOver and swallows its escape: the content stays
          // a plain container. The handle keeps its own element.
          accessible={false}
          accessibilityRole={null}
          accessibilityLabel={null}
          handleIndicatorStyle={[styles.handleIndicator, { backgroundColor: palette.handle }]}
          style={styles.sheet}
        >
          <BottomSheetScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            // VoiceOver's two-finger scrub anywhere in the sheet: Back, else Close.
            onAccessibilityEscape={escape ?? undefined}
          >
            <Animated.View
              style={{
                opacity: contentOpacity,
                transform: [{ translateX: contentTranslate }],
              }}
            >
              {activePanel === "overview" ? (
                <>
                  <TitleBlock
                    title={destination?.title ?? "Rota"}
                    address={destination?.address}
                    subtitle={subtitle}
                    photo={destinationPhoto}
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

                  {isLive ? (
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

              {/* Fades with its panel: outside it, it stayed put through the
                  fade-out and jumped to the new panel's end at the swap. */}
              <Text style={[styles.footerText, { color: palette.tertiaryLabel }]}>
                AKBA © 2026
              </Text>
            </Animated.View>
          </BottomSheetScrollView>

          {/* In the sheet, left of the title: an inner panel's Back at every
              stop, a preview's "Oturumlara dön" at the highest. */}
          {backAction ? (
            <SheetBackButton
              label={backAction.label}
              onPress={goBack}
              active={isNearTop}
              pinned={backPinned}
            />
          ) : null}
          {/* A live route's Close, at the top-trailing corner. */}
          {hasClose ? <SheetCloseButton onPress={closeSheet} visible={isSheetOpen} /> : null}
        </BottomSheet>
      </SheetMotionContext.Provider>

      {/* Screen-level, over the map and above the sheet: a floating toolbar's
          back button, for a preview's "Oturumlara dön" only. */}
      {floatsBack && backAction ? (
        <GlassNavButton
          visible={showFloatingBack}
          onPress={goBack}
          onAccessibilityEscape={goBack}
          accessibilityLabel={backAction.label}
          style={[styles.navButton, { top: safeTop + FLOATING_BACK_TOP }]}
        />
      ) : null}
    </>
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
  navButton: {
    position: "absolute",
    left: FLOATING_BACK_LEFT,
    zIndex: 30000,
    elevation: 90,
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
