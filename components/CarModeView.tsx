import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  PixelRatio,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { toDisplayKmh, useSpeed } from "../hooks/useSpeed";
import {
  DriveSessionState,
  DriveSessionStore,
} from "../services/DriveSessionStore";
import { destinationTitle } from "../services/placeTitle";
import { supportsNativeRouteSheet } from "./route-sheet/nativeRouteSheet";
import { formatMinutes } from "./route-sheet/routeFormat";
import {
  routeSheetBridge,
  useModalOverRouteSheet,
} from "./route-sheet/routeSheetBridge";

import { useDrivingAgent } from "../hooks/useDrivingAgent";
import { showMicModePicker } from "../modules/mic-mode";
import { GlassNavButton } from "./ui/GlassNavButton";
import {
  CAPSULE_BOTTOM,
  HEADER_TOP,
  ORB_BOTTOM,
  ORB_TARGET_SIZE,
  STATUS_TEXT_STACK_GAP,
  TRIP_LINES_HEIGHT,
} from "./carModeLayout";
import { IconSymbol } from "./ui/icon-symbol";
import {
  HEADER_COPY,
  resolveHeaderLine,
  routePlanFailedLineRemainingMs,
  TOOL_STATUS_COPY,
} from "../services/voice/carModeHeader";
import { AssistantOrbAurora } from "./AssistantOrbAurora";
import { AssistantOrbRibbon } from "./AssistantOrbRibbon";

/**
 * "ribbon": dark glass with a band of light that waves with the voice.
 * "aurora": the glass sphere with moving coloured light.
 * "classic": the original ring-and-core orb below.
 */
const ORB_STYLE: "ribbon" | "aurora" | "classic" = "ribbon";

/**
 * The header's "Oturumlara dön" chevron: near the 40 pt battery pill beside
 * it, under the floating button's 44. Drawn at 38, tapped in 44 (GlassNavButton).
 */
const HEADER_BACK_BUTTON_SIZE = 38;

/**
 * iOS 26's system route sheet is presented over this view: its peek covers
 * the orb (hidden there, AKBA live or not), and a confirmation <Modal>
 * cannot show while it is up (useModalOverRouteSheet).
 */
const NATIVE_ROUTE_SHEET = supportsNativeRouteSheet();
/** Keeps the system route sheet away while a confirmation is open. */
const CONFIRMATION_HOLD = "car-mode-confirmation";

/** A "thinking" shorter than this never reaches the screen, so it cannot flash. */
const THINKING_LINE_DELAY_MS = 400;

const CAPSULE_SIDE_MARGIN = 20;

/** True once `active` has held for `delayMs`; false again the moment it drops. */
function useHeldFor(active: boolean, delayMs: number): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active) {
      setHeld(false);
      return;
    }
    const timer = setTimeout(() => setHeld(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return active && held;
}

type StatusTone = "busy" | "error";

const STATUS_TONE_COLOR: Record<StatusTone, string> = {
  busy: "#F59E0B",
  error: "#FF3B30",
};

/** The dot in front of the status line; it pulses while AKBA is working on something. */
const StatusDot = ({ tone }: { tone: StatusTone }) => {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (tone === "busy") {
      pulse.value = withRepeat(withTiming(0.35, { duration: 700, easing: Easing.inOut(Easing.sin) }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
    return () => cancelAnimation(pulse);
  }, [tone, pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.statusDot, { backgroundColor: STATUS_TONE_COLOR[tone] }, style]} />;
};

const AssistantOrb = ({
  state,
  audioLevel,
}: {
  state: DriveSessionState;
  audioLevel: number;
}) => {
  const shellScale = useSharedValue(1);
  const coreScale = useSharedValue(1);
  const haloScale = useSharedValue(1);
  const haloOpacity = useSharedValue(0.28);
  const glowOpacity = useSharedValue(0.45);
  const ringRotation = useSharedValue(0);
  const shimmerRotation = useSharedValue(0);
  const floatY = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(shellScale);
    cancelAnimation(coreScale);
    cancelAnimation(haloScale);
    cancelAnimation(haloOpacity);
    cancelAnimation(glowOpacity);
    cancelAnimation(ringRotation);
    cancelAnimation(shimmerRotation);
    cancelAnimation(floatY);

    ringRotation.value = 0;
    shimmerRotation.value = 0;
    floatY.value = 0;

    if (
      state === DriveSessionState.AI_CONNECTING ||
      state === DriveSessionState.AI_LISTENING ||
      state === DriveSessionState.AI_SPEAKING
    ) {
      ringRotation.value = withRepeat(
        withTiming(360, {
          duration: state === DriveSessionState.AI_SPEAKING ? 2600 : 6400,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
      shimmerRotation.value = withRepeat(
        withTiming(360, {
          duration: state === DriveSessionState.AI_CONNECTING ? 4200 : 8200,
          easing: Easing.linear,
        }),
        -1,
        false,
      );
      floatY.value = withRepeat(
        withSequence(
          withTiming(-4, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
          withTiming(4, { duration: 1900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
    }

    if (state === DriveSessionState.AI_CONNECTING) {
      shellScale.value = withRepeat(
        withSequence(
          withTiming(1.02, {
            duration: 850,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.98, {
            duration: 850,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      );
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.04, {
            duration: 850,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.96, {
            duration: 850,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      );
      haloScale.value = withRepeat(
        withSequence(
          withTiming(1.08, {
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      haloOpacity.value = withRepeat(
        withTiming(0.44, { duration: 1000 }),
        -1,
        true,
      );
      glowOpacity.value = withTiming(0.55, { duration: 500 });
    } else if (state === DriveSessionState.AI_LISTENING) {
      shellScale.value = withRepeat(
        withSequence(
          withTiming(1.05, {
            duration: 900,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(0.99, {
            duration: 900,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      );
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.08, {
            duration: 900,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      haloScale.value = withRepeat(
        withSequence(
          withTiming(1.13, {
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
          }),
          withTiming(1.02, {
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
          }),
        ),
        -1,
        true,
      );
      haloOpacity.value = withRepeat(
        withTiming(0.5, { duration: 850 }),
        -1,
        true,
      );
      glowOpacity.value = withRepeat(
        withTiming(0.62, { duration: 850 }),
        -1,
        true,
      );
    } else if (state === DriveSessionState.AI_SPEAKING) {
      shellScale.value = withTiming(1.05, {
        duration: 220,
        easing: Easing.out(Easing.ease),
      });
      coreScale.value = withTiming(1.12, {
        duration: 220,
        easing: Easing.out(Easing.ease),
      });
      haloScale.value = withTiming(1.18, {
        duration: 220,
        easing: Easing.out(Easing.ease),
      });
      haloOpacity.value = withTiming(0.56, { duration: 220 });
      glowOpacity.value = withTiming(0.72, { duration: 220 });
    } else {
      shellScale.value = withTiming(1, { duration: 320 });
      coreScale.value = withTiming(1, { duration: 320 });
      haloScale.value = withTiming(1, { duration: 320 });
      haloOpacity.value = withTiming(0.22, { duration: 320 });
      glowOpacity.value = withTiming(0.34, { duration: 320 });
    }
  }, [
    state,
    shellScale,
    coreScale,
    haloScale,
    haloOpacity,
    glowOpacity,
    ringRotation,
    shimmerRotation,
    floatY,
  ]);

  useEffect(() => {
    if (state !== DriveSessionState.AI_SPEAKING) return;

    const intensity = Math.min(Math.max(audioLevel, 0), 1);
    shellScale.value = withTiming(1.04 + intensity * 0.14, {
      duration: 140,
      easing: Easing.out(Easing.ease),
    });
    coreScale.value = withTiming(1.1 + intensity * 0.24, {
      duration: 140,
      easing: Easing.out(Easing.ease),
    });
    haloScale.value = withTiming(1.16 + intensity * 0.2, {
      duration: 140,
      easing: Easing.out(Easing.ease),
    });
    haloOpacity.value = withTiming(0.5 + intensity * 0.22, { duration: 140 });
    glowOpacity.value = withTiming(0.68 + intensity * 0.2, { duration: 140 });
  }, [
    audioLevel,
    state,
    shellScale,
    coreScale,
    haloScale,
    haloOpacity,
    glowOpacity,
  ]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloOpacity.value,
    transform: [{ translateY: floatY.value }, { scale: haloScale.value }],
  }));

  const shellStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
    transform: [
      { translateY: floatY.value },
      { rotate: `${ringRotation.value}deg` },
      { scale: shellScale.value },
    ],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${shimmerRotation.value}deg` }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: coreScale.value }],
  }));

  return (
    <View style={styles.orbContainer} pointerEvents="none">
      <Animated.View style={[styles.orbHalo, haloStyle]}>
        <LinearGradient
          colors={[
            "rgba(107, 251, 199, 0.02)",
            "rgba(78, 223, 255, 0.42)",
            "rgba(0, 147, 201, 0.06)",
          ]}
          start={{ x: 0.2, y: 0.2 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.orbShell, shellStyle]}>
        <LinearGradient
          colors={["#062B3B", "#10B7E8", "#7CFBC7", "#0B506D"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.orbSweep, shimmerStyle]}>
        <LinearGradient
          colors={[
            "rgba(255,255,255,0)",
            "rgba(255,255,255,0.42)",
            "rgba(255,255,255,0)",
          ]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View style={[styles.orbCore, coreStyle]}>
        <LinearGradient
          colors={["#D4FFF5", "#59F0E4", "#1BB5E8"]}
          start={{ x: 0.15, y: 0.1 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.orbSpecular} />
        <View style={styles.orbCenterGlow} />
      </Animated.View>
    </View>
  );
};

/** What the driver wants to see about the planned trip at a glance; null without a plan. */
const readTripSummary = () => {
  const plan = DriveSessionStore.getRoutePlanData();
  if (!plan) return null;
  // The same short title as the sheet and Oturumlar: "Alemdağ Cd. No:940",
  // not the geocoder's whole postal address.
  const place = destinationTitle(plan);
  const destination = place?.title ?? "Hedef";
  const parts: string[] = [];
  const km = plan.summary?.total_travel_length;
  if (typeof km === "number" && km > 0) parts.push(`${km.toFixed(km >= 100 ? 0 : 1)} km`);
  const stops = plan.summary?.total_station_count ?? 0;
  parts.push(stops > 0 ? `${stops} şarj durağı` : "şarj durağı yok");
  const chargeMin = plan.summary?.total_charge_duration ?? 0;
  if (stops > 0 && chargeMin > 0) parts.push(`${chargeMin} dk şarj`);
  // The capsule's time: the whole trip, charging included.
  const tripTime = formatMinutes(
    (plan.summary?.total_travel_duration ?? 0) + (stops > 0 ? chargeMin : 0),
  );
  return { destination, detail: place?.detail ?? null, line: parts.join(" · "), tripTime };
};

/**
 * Brings back a route sheet the driver put away ("Haritaya dön"): a frosted
 * capsule just above the orb, "⌃ Metrogarden AVM · 47 dk".
 */
const RouteReopenCapsule = ({
  title,
  tripTime,
  isDark,
  maxWidth,
  onPress,
}: {
  title: string;
  tripTime: string | null;
  isDark: boolean;
  maxWidth: number;
  onPress: () => void;
}) => {
  const textColor = isDark ? "#fff" : "#000";
  const subtextColor = isDark ? "rgba(255,255,255,0.68)" : "rgba(0,0,0,0.62)";
  return (
    <Animated.View
      entering={FadeInDown.duration(240)}
      exiting={FadeOut.duration(140)}
      style={styles.capsuleRow}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Rota: ${title}${tripTime ? `, ${tripTime}` : ""}`}
        accessibilityHint="Rota özetini açar."
        style={({ pressed }) => [
          styles.capsuleShadow,
          { maxWidth, opacity: pressed ? 0.78 : 1 },
        ]}
      >
        <BlurView
          intensity={80}
          tint={isDark ? "dark" : "light"}
          style={[
            styles.capsuleGlass,
            {
              backgroundColor: isDark ? "rgba(14,18,26,0.62)" : "rgba(255,255,255,0.78)",
              borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)",
            },
          ]}
        >
          <Ionicons name="chevron-up" size={16} color={textColor} />
          <Text style={[styles.capsuleTitle, { color: textColor }]} numberOfLines={1}>
            {title}
          </Text>
          {tripTime ? (
            <Text style={[styles.capsuleTime, { color: subtextColor }]} numberOfLines={1}>
              · {tripTime}
            </Text>
          ) : null}
        </BlurView>
      </Pressable>
    </Animated.View>
  );
};

export function CarModeView() {
  const { themeScheme, colors } = useTheme();
  const [sessionState, setSessionState] = useState(
    DriveSessionStore.getState(),
  );
  const [hasRoutePlan, setHasRoutePlan] = useState(
    !!DriveSessionStore.getRoutePlanData(),
  );
  const [tripSummary, setTripSummary] = useState(readTripSummary);
  // The route sheet's level: -1 closed, 0 peek (previews), 1 middle, 2+ higher.
  const [routePlanSheetIndex, setRoutePlanSheetIndex] = useState(() => {
    const level = DriveSessionStore.getRoutePlanSheetIndex();
    if (level >= 0) return level;
    return DriveSessionStore.getRoutePlanData() &&
      !DriveSessionStore.isRouteSheetDismissed()
      ? 1
      : -1;
  });
  const [routeSheetDismissed, setRouteSheetDismissed] = useState(() =>
    DriveSessionStore.isRouteSheetDismissed(),
  );
  const { width: windowWidth } = useWindowDimensions();
  const [manualConfirmAction, setManualConfirmAction] = useState<
    "end_drive" | "connect_voice" | "stop_voice" | "start_drive" | null
  >(null);
  const [isPreviewMode, setIsPreviewMode] = useState(
    !!DriveSessionStore.getContext()?.isPreviewMode,
  );
  const speed = useSpeed();
  // Whole km/h from the first frame, -1 while unknown (toDisplayKmh).
  const [displaySpeed, setDisplaySpeed] = useState(() => toDisplayKmh(speed));

  // Hook into the ElevenLabs agent lifecycle
  const {
    audioLevel,
    agentAudioTrack,
    stopSession,
    stopConversation,
    startSession,
    toolCalls,
    status,
    agentState,
    isMuted,
    setMuted,
    wakeWordArmed,
    routePlanFailedAt,
  } = useDrivingAgent();

  const isDark = themeScheme === "dark";
  const glassTint = isDark ? "dark" : "light";
  // The trip's two lines grow with the iOS text size; the gap between them does not.
  const statusTextStackMinHeight = Math.ceil(
    TRIP_LINES_HEIGHT * PixelRatio.getFontScale() + STATUS_TEXT_STACK_GAP,
  );
  const textColor = isDark ? "#fff" : "#000";
  const subtextColor = isDark ? "rgba(255,255,255,0.68)" : "rgba(0,0,0,0.62)";

  // Animation values
  const entranceAnim = useSharedValue(0);
  const headerY = useSharedValue(-120);
  const statsX = useSharedValue(120);
  const assistantY = useSharedValue(150);

  const getRouteDurationSeconds = () => {
    const context = DriveSessionStore.getContext();
    const durationFromRoute = context?.route?.summary?.duration;
    const durationFromPlan =
      context?.routePlanData?.summary?.total_travel_duration;

    if (typeof durationFromRoute === "number" && durationFromRoute > 0) {
      return durationFromRoute;
    }

    if (typeof durationFromPlan === "number" && durationFromPlan > 0) {
      return durationFromPlan * 60;
    }

    return null;
  };

  const [routeDurationSeconds, setRouteDurationSeconds] = useState<
    number | null
  >(getRouteDurationSeconds());

  useEffect(() => {
    const unsub = DriveSessionStore.onStateChange((newState) => {
      setSessionState(newState);
      setHasRoutePlan(!!DriveSessionStore.getRoutePlanData());
      setTripSummary(readTripSummary());
      setRoutePlanSheetIndex(DriveSessionStore.getRoutePlanSheetIndex());
      setRouteSheetDismissed(DriveSessionStore.isRouteSheetDismissed());
      setRouteDurationSeconds(getRouteDurationSeconds());
      setIsPreviewMode(!!DriveSessionStore.getContext()?.isPreviewMode);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (
      sessionState === DriveSessionState.IDLE ||
      sessionState === DriveSessionState.ENDING_DRIVE_CONFIRMATION
    ) {
      setManualConfirmAction(null);
    }
  }, [sessionState]);

  const isVoiceTransportActive =
    status === "connected" || status === "connecting";
  const isAiActive =
    sessionState === DriveSessionState.PLANNING_ROUTE ||
    (isVoiceTransportActive &&
      [
        DriveSessionState.AI_CONNECTING,
        DriveSessionState.AI_LISTENING,
        DriveSessionState.AI_SPEAKING,
      ].includes(sessionState));

  const [hasEverConnected, setHasEverConnected] = useState(false);
  useEffect(() => {
    if (status === "connected") setHasEverConnected(true);
  }, [status]);
  // "Bağlantı koptu" belongs to the drive that lost the connection: a drive
  // opened again after it ended starts from the calm passive line.
  useEffect(() => {
    if (sessionState === DriveSessionState.IDLE) setHasEverConnected(false);
  }, [sessionState]);

  // "Rota hesaplanamadı" for a few seconds after a failed plan, then the
  // row goes back to its fallback.
  const [routePlanFailedVisible, setRoutePlanFailedVisible] = useState(false);
  useEffect(() => {
    const remaining = routePlanFailedLineRemainingMs(routePlanFailedAt, Date.now());
    setRoutePlanFailedVisible(remaining > 0);
    if (remaining === 0) return;
    const timer = setTimeout(() => setRoutePlanFailedVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [routePlanFailedAt]);

  // Read through state: the store notifying with an unchanged session state
  // does not re-render this view, so the pill kept showing the old level.
  const [batteryPrefs, setBatteryPrefs] = useState(() => DriveSessionStore.getBatteryPreferences());
  useEffect(
    () => DriveSessionStore.onBatteryPreferencesChange(() => setBatteryPrefs(DriveSessionStore.getBatteryPreferences())),
    [],
  );
  const batteryStart = batteryPrefs.start;
  const promptBatteryLevel = () => {
    const apply = (value?: string | number) => {
      const n = Math.round(Number(String(value ?? "").replace("%", "").trim()));
      if (!Number.isFinite(n) || n < 1 || n > 100) return;
      void DriveSessionStore.setBatteryPreferences(n, DriveSessionStore.getBatteryPreferences().arrival, true);
    };
    if (Platform.OS === "ios") {
      Alert.prompt(
        "Batarya seviyesi",
        "Aracın şu anki şarj yüzdesini girin.",
        [
          { text: "Vazgeç", style: "cancel" },
          { text: "Kaydet", onPress: (v?: string) => apply(v) },
        ],
        "plain-text",
        String(batteryStart),
        "number-pad",
      );
    } else {
      // Android renders at most three buttons and no dismissal unless asked.
      const known = batteryPrefs.updatedAt !== null;
      Alert.alert(
        "Batarya seviyesi",
        known
          ? `Şu an %${batteryStart}. Tam yüzdeyi AKBA'ya sesli de söyleyebilirsiniz.`
          : "Tam yüzdeyi AKBA'ya sesli söyleyebilirsiniz: \"Şarjım yüzde altmış beş.\"",
        known
          ? [
              { text: "Vazgeç", style: "cancel" as const },
              { text: "−10", onPress: () => apply(Math.max(1, batteryStart - 10)) },
              { text: "+10", onPress: () => apply(Math.min(100, batteryStart + 10)) },
            ]
          : [
              { text: "Vazgeç", style: "cancel" as const },
              { text: "%50", onPress: () => apply(50) },
              { text: "%80", onPress: () => apply(80) },
            ],
        { cancelable: true },
      );
    }
  };

  const isThinking = useHeldFor(
    status === "connected" && agentState === "thinking",
    THINKING_LINE_DELAY_MS,
  );

  const pendingToolText = useMemo(() => {
    const pendingTool = [...toolCalls]
      .reverse()
      .find((call) => call.status === "pending" && TOOL_STATUS_COPY[call.toolName]);
    return pendingTool ? TOOL_STATUS_COPY[pendingTool.toolName] : null;
  }, [toolCalls]);

  const headerLine = resolveHeaderLine({
    status,
    agentState,
    pendingToolText,
    planning: sessionState === DriveSessionState.PLANNING_ROUTE,
    aiError: sessionState === DriveSessionState.AI_ERROR,
    aiConnecting: sessionState === DriveSessionState.AI_CONNECTING,
    hasRoute: !!tripSummary,
    hasEverConnected,
    wakeWordArmed,
    thinking: isThinking,
    routePlanFailed: routePlanFailedVisible,
  });

  // What AKBA is doing, for VoiceOver (the header and the orb).
  const voiceStateLabel =
    headerLine.kind === "offline"
      ? "AKBA bağlantısı koptu"
      : headerLine.kind === "busy"
        ? `AKBA: ${headerLine.text.replace(/…$/, "")}`
        : !isVoiceTransportActive
          ? wakeWordArmed
            ? "AKBA kapalı, “AKBA” deyince dinler"
            : "AKBA kapalı"
          : agentState === "speaking"
            ? "AKBA konuşuyor"
            : isMuted
              ? "AKBA dinlemiyor, mikrofon kapalı"
              : "AKBA dinliyor";

  useEffect(() => {
    const isVisible =
      sessionState !== DriveSessionState.IDLE &&
      sessionState !== DriveSessionState.PROMPTING;
    const shouldYieldToRoutePlanSheet = hasRoutePlan && routePlanSheetIndex > 0;
    // A preview's low peek would sit on the orb unless AKBA is live; a sheet
    // the driver put away leaves the orb its place.
    const isRouteSheetOnScreen = hasRoutePlan && routePlanSheetIndex >= 0;
    const shouldHideAssistant =
      shouldYieldToRoutePlanSheet ||
      (isVisible && isRouteSheetOnScreen && (!isAiActive || NATIVE_ROUTE_SHEET));

    if (isVisible) {
      entranceAnim.value = withTiming(1, {
        duration: 800,
        easing: Easing.out(Easing.exp),
      });
      headerY.value = withDelay(
        100,
        withTiming(shouldYieldToRoutePlanSheet ? -260 : 0, {
          duration: 800,
          easing: Easing.out(Easing.exp),
        }),
      );
      statsX.value = withDelay(
        250,
        withTiming(shouldYieldToRoutePlanSheet ? 140 : 0, {
          duration: 800,
          easing: Easing.out(Easing.exp),
        }),
      );

      assistantY.value = withDelay(
        400,
        withTiming(shouldHideAssistant ? 420 : 0, {
          duration: 800,
          easing: Easing.out(Easing.exp),
        }),
      );
    } else {
      entranceAnim.value = withTiming(0, { duration: 500 });
      headerY.value = withTiming(-120, { duration: 500 });
      statsX.value = withTiming(120, { duration: 500 });
      assistantY.value = withTiming(150, { duration: 500 });
    }
  }, [
    sessionState,
    hasRoutePlan,
    isAiActive,
    routePlanSheetIndex,
    entranceAnim,
    headerY,
    statsX,
    assistantY,
  ]);

  // Mirror ActivityContextBar speed behavior for consistent UX.
  useEffect(() => {
    if (Math.abs(speed - displaySpeed) >= 1 || speed === 0) {
      setDisplaySpeed(toDisplayKmh(speed));
    }
  }, [speed, displaySpeed]);

  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: headerY.value }],
    opacity: entranceAnim.value,
  }));

  const animatedStatsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: statsX.value }],
    opacity: entranceAnim.value,
  }));

  const animatedAssistantStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: assistantY.value }],
    opacity: entranceAnim.value,
  }));

  // The confirmation below, as it may show over iOS 26's system route sheet
  // (held away first); on the gorhom path exactly the confirmation's state.
  const confirmModal = useModalOverRouteSheet(
    CONFIRMATION_HOLD,
    !!manualConfirmAction ||
      sessionState === DriveSessionState.ENDING_DRIVE_CONFIRMATION,
  );

  const isActive =
    sessionState !== DriveSessionState.IDLE &&
    sessionState !== DriveSessionState.PROMPTING;
  const shouldHideFloatingStats = hasRoutePlan && routePlanSheetIndex > 0;
  const shouldYieldToRoutePlanSheet = hasRoutePlan && routePlanSheetIndex > 0;
  // A live route's sheet the driver put away: the capsule and the header's
  // trip bring it back. It stays until the route goes or the drive ends.
  const canReopenRouteSheet =
    hasRoutePlan &&
    !!tripSummary &&
    !isPreviewMode &&
    routeSheetDismissed &&
    routePlanSheetIndex < 0;
  const capsuleMaxWidth = windowWidth - 2 * CAPSULE_SIDE_MARGIN;
  // console.log("[CarModeView] 🎯 sessionState =", sessionState, "| isActive =", isActive, "| context =", !!DriveSessionStore.getContext());

  const arrivalTimeFormatted = useMemo(() => {
    if (!routeDurationSeconds) return "-";
    const arrivalDate = new Date(Date.now() + routeDurationSeconds * 1000);
    return arrivalDate.toLocaleTimeString("tr-TR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [routeDurationSeconds]);

  if (!isActive) return null;

  // Work and errors take one compact line: the trip's second line when a trip
  // is on screen, so the header keeps its height as the line comes and goes.
  const statusLineText =
    headerLine.kind === "busy"
      ? headerLine.text
      : headerLine.kind === "offline"
        ? HEADER_COPY.offline
        : headerLine.kind === "failed"
          ? HEADER_COPY.routePlanFailed
          : null;
  const statusLine =
    statusLineText !== null ? (
      <View style={styles.statusLineRow}>
        <StatusDot tone={headerLine.kind === "busy" ? "busy" : "error"} />
        <Text
          style={[
            styles.statusLineText,
            { color: headerLine.kind === "busy" ? textColor : colors.danger },
          ]}
          numberOfLines={1}
        >
          {statusLineText}
        </Text>
      </View>
    ) : null;
  // Nothing going on and no trip: one line saying what the driver can do.
  // "Nereye gidiyoruz?" while AKBA is live, a quieter hint while it is not.
  const promptLine =
    headerLine.kind === "prompt" ? (
      headerLine.prompt === "ask" ? (
        <Text style={[styles.promptTitleText, { color: textColor }]} numberOfLines={1}>
          {HEADER_COPY.ask}
        </Text>
      ) : (
        <Text
          style={[styles.promptHintText, { color: subtextColor }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {HEADER_COPY[headerLine.prompt]}
        </Text>
      )
    ) : null;
  const headerAccessibilityLabel = [
    // The news first, then what AKBA is doing.
    headerLine.kind === "failed" ? HEADER_COPY.routePlanFailed : null,
    voiceStateLabel,
    tripSummary &&
      `Hedef ${[tripSummary.destination, tripSummary.detail].filter(Boolean).join(", ")}, ${tripSummary.line}`,
    headerLine.kind === "offline" && !tripSummary ? HEADER_COPY.offlineDetail : null,
    // The wake caption says what voiceStateLabel already does.
    headerLine.kind === "prompt" && headerLine.prompt !== "wake"
      ? HEADER_COPY[headerLine.prompt]
      : null,
  ]
    .filter(Boolean)
    .join(". ");

  const handleConfirmEndDrive = () => {
    setManualConfirmAction(null);
    stopSession(); // Cleans up agent, socket, and store
  };

  const handleEndDrivePress = () => {
    setManualConfirmAction("end_drive");
  };

  const isAutomaticEndConfirm =
    sessionState === DriveSessionState.ENDING_DRIVE_CONFIRMATION;

  // The header button used to be inert until a route existed; now it also
  // (re)connects AKBA before the first route.
  const canReconnectVoice = !isVoiceTransportActive;
  const canStopConversation = isVoiceTransportActive;
  const canToggleMic = isVoiceTransportActive;
  // Voice Isolation lives in the system's microphone-mode picker, which only
  // applies while a call has the microphone: iOS, live session, long press.
  const canPickMicMode = Platform.OS === "ios" && status === "connected";
  const isDriveActionPreviewStart = isPreviewMode;
  // The header's way back to Oturumlar, for a preview AKBA is not live in (the
  // map screen's rule). The header shows while the route sheet is at its peek
  // and leaves as it rises; the sheet's floating back button covers the
  // heights above, so every height has one way back.
  const canClosePreview =
    isPreviewMode && sessionState === DriveSessionState.NAVIGATION_ONLY;
  const handleClosePreview = () => {
    // iOS 26's system sheet goes first: navigating with it on top would
    // stack a second tab navigator. A no-op for the gorhom sheet.
    routeSheetBridge.requestDismiss("leave");
    DriveSessionStore.closePreview();
    router.navigate("/(tabs)/sessions");
  };

  const handleVoiceButtonPress = () => {
    if (canStopConversation) {
      setManualConfirmAction("stop_voice");
      return;
    }

    if (canReconnectVoice) {
      setManualConfirmAction("connect_voice");
    }
  };

  const voiceActionLabel = canStopConversation
    ? "Konuşmayı Bitir"
    : "AKBA'ya Bağlan";
  const voiceActionIcon = canStopConversation ? "pause-circle" : "radio-outline";

  const handleDismissEndConfirmation = () => {
    setManualConfirmAction(null);
    if (isAutomaticEndConfirm) {
      DriveSessionStore.cancelEndConfirmation();
    }
  };

  const handleConfirmPrimaryAction = () => {
    if (manualConfirmAction === "start_drive") {
      setManualConfirmAction(null);
      DriveSessionStore.exitPreviewMode();
      return;
    }

    if (manualConfirmAction === "connect_voice") {
      setManualConfirmAction(null);
      void startSession();
      return;
    }

    if (manualConfirmAction === "stop_voice") {
      setManualConfirmAction(null);
      void stopConversation();
      return;
    }

    handleConfirmEndDrive();
  };

  const confirmationCopy = isAutomaticEndConfirm
    ? {
        title: "Sürüş bitti mi?",
        subtitle:
          "Araç hareketi algılanmıyor. Sürüşü bitirmek ister misiniz?",
        confirm: "Sürüşü Bitir",
        cancel: "Sürüşe Devam Et",
      }
    : manualConfirmAction === "connect_voice"
      ? {
          title: "AKBA’ya yeniden bağlanılsın mı?",
          subtitle:
            "Sesli konuşma yeniden başlayacak. Sürüş rotanız olduğu gibi korunur.",
          confirm: "AKBA’ya Bağlan",
          cancel: "Vazgeç",
        }
      : manualConfirmAction === "start_drive"
        ? {
            title: "Sürüş modu başlatılsın mı?",
            subtitle:
              "Bu rota artık aktif sürüş olarak izlenecek. Hareket algılanınca normal sürüş akışı devam eder.",
            confirm: "Sürüşü Başlat",
            cancel: "Vazgeç",
          }
      : manualConfirmAction === "stop_voice"
        ? {
            title: "Konuşma sonlandırılsın mı?",
            subtitle:
              "Sadece AKBA konuşması kapanacak. Sürüş ve rota takibi devam edecek.",
            confirm: "Konuşmayı Bitir",
            cancel: "Vazgeç",
          }
        : {
            title: "Sürüşü şimdi bitirelim mi?",
            subtitle:
              "AKBA kapanacak ve sürüş oturumu sonlandırılacak. İsterseniz daha sonra yeniden başlatabilirsiniz.",
            confirm: "Sürüşü Bitir",
            cancel: "Vazgeç",
          };

  // The trip (or what AKBA is doing) in the header's left column.
  const headerTripContent =
    tripSummary ? (
      <>
        {/* One line, cut with "…": never shrunk to fit. */}
        <View style={styles.tripDestinationRow}>
          <Ionicons name="flag" size={15} color={textColor} />
          <Text
            style={[styles.tripDestination, { color: textColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {tripSummary.destination}
          </Text>
        </View>
        {statusLine ?? (
          <Text
            style={[styles.secondaryLineText, { color: subtextColor }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {tripSummary.line}
          </Text>
        )}
      </>
    ) : (
      <>
        {statusLine}
        {headerLine.kind === "offline" && (
          <Text
            style={[styles.secondaryLineText, { color: subtextColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {HEADER_COPY.offlineDetail}
          </Text>
        )}
        {promptLine}
      </>
    );

  return (
    <View
      style={styles.container}
      pointerEvents={shouldYieldToRoutePlanSheet ? "none" : "box-none"}
    >
      {/* Floating Top Panel */}
      <Animated.View style={[styles.floatingHeader, animatedHeaderStyle]}>
        <BlurView
          intensity={90}
          tint={glassTint}
          style={[
            styles.headerGlass,
            { backgroundColor: isDark ? "rgba(14,18,26,0.58)" : "rgba(255,255,255,0.7)" },
          ]}
        >
          <SafeAreaView style={styles.headerSafeArea}>
            <View style={styles.headerContent}>
              <View style={styles.headerTopRow}>
                {canClosePreview ? (
                  // Frosted, not Liquid Glass: the header is a material already,
                  // and its entrance animates opacity, under which glass stops drawing.
                  <GlassNavButton
                    material="frosted"
                    size={HEADER_BACK_BUTTON_SIZE}
                    onPress={handleClosePreview}
                    onAccessibilityEscape={handleClosePreview}
                    accessibilityLabel="Oturumlara dön"
                  />
                ) : null}
                {/* Stretched to the row and as tall as the trip's two lines, so no state moves the header.
                    With the route sheet put away, a tap on the trip brings it back; otherwise it is
                    plain text (a disabled button read as "dimmed" to VoiceOver). */}
                {canReopenRouteSheet ? (
                  <Pressable
                    style={[styles.statusTextStack, { minHeight: statusTextStackMinHeight }]}
                    onPress={() => DriveSessionStore.openRouteSheet()}
                    accessibilityRole="button"
                    accessibilityLabel={headerAccessibilityLabel}
                    accessibilityHint="Rota özetini açar."
                  >
                    {headerTripContent}
                  </Pressable>
                ) : (
                  <View
                    style={[styles.statusTextStack, { minHeight: statusTextStackMinHeight }]}
                    accessible
                    accessibilityLabel={headerAccessibilityLabel}
                  >
                    {headerTripContent}
                  </View>
                )}
                <TouchableOpacity
                  onPress={promptBatteryLevel}
                  activeOpacity={0.78}
                  accessibilityLabel="Batarya seviyesini gir"
                  style={[
                    styles.batteryHeaderAction,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(15,23,42,0.09)",
                      borderColor: isDark
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(15,23,42,0.14)",
                    },
                  ]}
                >
                  {/* The car's charge, not the phone's: SF Symbols bolt.car on iOS,
                      Material electric-car on Android. */}
                  <IconSymbol name="bolt.car.fill" size={19} color={textColor} />
                  <Text style={[styles.secondaryHeaderActionText, { color: textColor }]}>
                    {batteryPrefs.updatedAt === null ? "%?" : `%${batteryStart}`}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.headerActionsRow}>
                <TouchableOpacity
                  onPress={handleVoiceButtonPress}
                  activeOpacity={0.78}
                  style={[
                    styles.secondaryHeaderAction,
                    {
                      opacity: canStopConversation || canReconnectVoice ? 1 : 0.5,
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(15,23,42,0.09)",
                      borderColor: isDark
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(15,23,42,0.14)",
                    },
                  ]}
                  disabled={!canStopConversation && !canReconnectVoice}
                >
                  <Ionicons name={voiceActionIcon} size={18} color={textColor} />
                  <Text
                    style={[
                      styles.secondaryHeaderActionText,
                      styles.headerActionLabel,
                      { color: textColor },
                    ]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {voiceActionLabel}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setMuted(!isMuted)}
                  onLongPress={
                    canPickMicMode ? () => void showMicModePicker() : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel={isMuted ? "Mikrofonu aç" : "Mikrofonu kapat"}
                  accessibilityHint={
                    canPickMicMode
                      ? "Uzun basınca mikrofon modunu (Ses Yalıtımı) seçebilirsin."
                      : undefined
                  }
                  activeOpacity={0.78}
                  disabled={!canToggleMic}
                  style={[
                    styles.iconHeaderAction,
                    {
                      opacity: canToggleMic ? 1 : 0.45,
                      backgroundColor: isMuted
                        ? isDark
                          ? "rgba(255,159,10,0.18)"
                          : "rgba(255,159,10,0.12)"
                        : isDark
                          ? "rgba(255,255,255,0.08)"
                          : "rgba(15,23,42,0.09)",
                      borderColor: isMuted
                        ? "rgba(255,159,10,0.24)"
                        : isDark
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(15,23,42,0.14)",
                    },
                  ]}
                >
                  <Ionicons
                    name={isMuted ? "mic-off" : "mic"}
                    size={18}
                    color={isMuted ? "#FF9F0A" : textColor}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() =>
                    isDriveActionPreviewStart
                      ? setManualConfirmAction("start_drive")
                      : handleEndDrivePress()
                  }
                  activeOpacity={0.7}
                  style={[
                    styles.endDriveButtonCompact,
                    {
                      backgroundColor: isDriveActionPreviewStart
                        ? colors.primary
                        : colors.danger,
                    },
                  ]}
                >
                  <Ionicons
                    name={isDriveActionPreviewStart ? "play-circle" : "stop-circle"}
                    size={18}
                    color="#FFFFFF"
                  />
                  <Text style={styles.endDriveTextCompact} numberOfLines={1}>
                    {isDriveActionPreviewStart ? "Sürüşü Başlat" : "Sürüşü Bitir"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </SafeAreaView>
        </BlurView>
      </Animated.View>

      {/* Floating Driving Stats (Right Side) */}
      {!shouldHideFloatingStats && (
        <Animated.View
          pointerEvents="none"
          style={[styles.floatingStats, animatedStatsStyle]}
        >
          <BlurView
            intensity={70}
            tint={glassTint}
            style={[
              styles.statGlass,
              { backgroundColor: isDark ? "rgba(14,18,26,0.58)" : "rgba(255,255,255,0.7)" },
            ]}
          >
            <Text style={[styles.statValue, { color: textColor }]}>
              {Number.isFinite(displaySpeed) && displaySpeed >= 0
                ? displaySpeed
                : "-"}
            </Text>
            <Text style={[styles.statLabel, { color: subtextColor }]}>
              km/h
            </Text>
          </BlurView>
          <BlurView
            intensity={70}
            tint={glassTint}
            style={[
              styles.statGlass,
              { backgroundColor: isDark ? "rgba(14,18,26,0.58)" : "rgba(255,255,255,0.7)" },
            ]}
          >
            <Text style={[styles.statValue, { color: textColor }]}>
              {arrivalTimeFormatted}
            </Text>
            <Text style={[styles.statLabel, { color: subtextColor }]}>
              Varış
            </Text>
          </BlurView>
        </Animated.View>
      )}

      {canReopenRouteSheet && tripSummary ? (
        <RouteReopenCapsule
          title={tripSummary.destination}
          tripTime={tripSummary.tripTime}
          isDark={isDark}
          maxWidth={capsuleMaxWidth}
          onPress={() => DriveSessionStore.openRouteSheet()}
        />
      ) : null}

      {/* Assistant Area (Bottom Center) */}
      <Animated.View
        style={[styles.assistantContainer, animatedAssistantStyle]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => !isVoiceTransportActive && startSession()}
          disabled={isVoiceTransportActive}
          accessibilityRole="button"
          accessibilityLabel={voiceStateLabel}
          accessibilityHint={isVoiceTransportActive ? undefined : "Dokununca AKBA'ya bağlanır."}
          accessibilityState={{ disabled: isVoiceTransportActive }}
          style={styles.orbTouchTarget}
        >
          {ORB_STYLE === "ribbon" ? (
            <AssistantOrbRibbon
              state={sessionState}
              audioLevel={audioLevel}
              agentTrack={agentAudioTrack}
              tone={isDark ? "dark" : "light"}
            />
          ) : ORB_STYLE === "aurora" ? (
            <AssistantOrbAurora state={sessionState} audioLevel={audioLevel} />
          ) : (
            <AssistantOrb state={sessionState} audioLevel={audioLevel} />
          )}
        </TouchableOpacity>
      </Animated.View>

      {/* End Drive Confirmation Modal */}
      <Modal
        key={confirmModal.key}
        transparent
        visible={confirmModal.visible}
        onShow={confirmModal.onShow}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <BlurView
            intensity={30}
            tint={glassTint}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.modalCard,
              { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
            ]}
          >
            <Text style={[styles.modalTitle, { color: textColor }]}>
              {confirmationCopy.title}
            </Text>
            <Text style={[styles.modalSubtitle, { color: subtextColor }]}>
              {confirmationCopy.subtitle}
            </Text>
            <TouchableOpacity
              style={[
                styles.modalButton,
                {
                  backgroundColor:
                    manualConfirmAction === "connect_voice"
                      ? colors.primary
                      : colors.danger,
                  marginTop: 12,
                },
              ]}
              onPress={handleConfirmPrimaryAction}
            >
              <Text style={[styles.modalButtonText, { color: "#FFFFFF" }]}>
                {confirmationCopy.confirm}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalButton,
                {
                  backgroundColor: "transparent",
                  borderWidth: 1,
                  borderColor: isDark ? "#333" : "#E5E5EA",
                },
              ]}
              onPress={handleDismissEndConfirmation}
            >
              <Text style={[styles.modalButtonText, { color: textColor }]}>
                {confirmationCopy.cancel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
    zIndex: 1000,
  },
  floatingHeader: {
    position: "absolute",
    top: HEADER_TOP,
    left: 10,
    right: 10,
    zIndex: 1001,
  },
  headerGlass: {
    borderRadius: 34,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  headerSafeArea: {
    paddingVertical: 6,
  },
  headerContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  /**
   * As tall as the row, and the row never shorter than the trip's two lines
   * (destination 23 + gap 2 + trip line 17, the lines scaled with the text
   * size: minHeight is set in render), so a line coming or going, or the trip
   * replacing the prompt, never moves the header.
   */
  statusTextStack: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    justifyContent: "center",
    gap: STATUS_TEXT_STACK_GAP,
  },
  /** "Nereye gidiyoruz?": the destination's weight and colour, where the destination will go. */
  promptTitleText: {
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  /** The passive hint: quieter than the live question. */
  promptHintText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  statusLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  /** Same size as secondaryLineText, so it can take the trip line's place. */
  statusLineText: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  tripDestinationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tripDestination: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  secondaryLineText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  headerActionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  secondaryHeaderAction: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  secondaryHeaderActionText: {
    fontSize: 13,
    fontWeight: "800",
  },
  /** Takes the room the icon leaves, so the label can shrink instead of wrapping. */
  headerActionLabel: {
    flexShrink: 1,
  },
  batteryHeaderAction: {
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    alignSelf: "center",
  },
  iconHeaderAction: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  endDriveButtonCompact: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  endDriveTextCompact: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  floatingStats: {
    position: "absolute",
    right: 20,
    top: Platform.OS === "ios" ? 238 : 208,
    gap: 14,
    zIndex: 1001,
  },
  statGlass: {
    width: 74,
    height: 74,
    borderRadius: 26,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  assistantContainer: {
    position: "absolute",
    bottom: ORB_BOTTOM,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1001,
  },
  /** Just above the orb and the locate button, centred. */
  capsuleRow: {
    position: "absolute",
    bottom: CAPSULE_BOTTOM,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1002,
  },
  capsuleShadow: {
    borderRadius: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 6,
  },
  capsuleGlass: {
    minHeight: 44,
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 16,
    gap: 6,
  },
  capsuleTitle: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
  },
  capsuleTime: {
    flexShrink: 0,
    fontSize: 15,
    fontWeight: "600",
  },
  orbTouchTarget: {
    width: ORB_TARGET_SIZE,
    height: ORB_TARGET_SIZE,
    borderRadius: ORB_TARGET_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: "transparent",
  },
  orbContainer: {
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
    backgroundColor: "transparent",
  },
  orbHalo: {
    position: "absolute",
    width: 124,
    height: 124,
    borderRadius: 62,
    overflow: "hidden",
  },
  orbShell: {
    position: "absolute",
    width: 104,
    height: 104,
    borderRadius: 52,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    shadowColor: "#3FE1F3",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  orbSweep: {
    position: "absolute",
    width: 118,
    height: 118,
    borderRadius: 59,
    overflow: "hidden",
    opacity: 0.45,
  },
  orbCore: {
    width: 76,
    height: 76,
    borderRadius: 38,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  orbSpecular: {
    position: "absolute",
    top: 10,
    left: 16,
    width: 28,
    height: 18,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.26)",
    transform: [{ rotate: "-18deg" }],
  },
  orbCenterGlow: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    width: "80%",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 22,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    marginTop: 8,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
