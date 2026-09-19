import { BlurView } from "expo-blur";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import LottieView from "lottie-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { useSpeed } from "../hooks/useSpeed";
import {
  DriveSessionState,
  DriveSessionStore,
} from "../services/DriveSessionStore";

import { useDrivingAgent } from "../hooks/useDrivingAgent";

const TOOL_STATUS_COPY: Record<string, { headline: string; detail: string }> = {
  create_route_plan: {
    headline: "ROTA HESAPLANIYOR",
    detail: "AKBA yeni rotayı hazırlıyor.",
  },
  find_nearby_stations: {
    headline: "İSTASYONLAR ARANIYOR",
    detail: "Yakındaki uygun şarj noktaları bulunuyor.",
  },
  get_user_location: {
    headline: "KONUM BULUNUYOR",
    detail: "Bulunduğunuz konum doğrulanıyor.",
  },
  end_call: {
    headline: "OTURUM KAPATILIYOR",
    detail: "AKBA ses oturumunu sonlandırıyor.",
  },
};

const StatusGlyph = ({
  isAnimated,
  isError,
  isActive,
}: {
  isAnimated: boolean;
  isError: boolean;
  isActive: boolean;
}) => {
  const statusLottieRef = useRef<LottieView>(null);

  useEffect(() => {
    if (!statusLottieRef.current) return;
    if (isAnimated) {
      statusLottieRef.current.play();
    } else {
      statusLottieRef.current.pause();
    }
  }, [isAnimated]);

  if (isAnimated) {
    return (
      <LottieView
        ref={statusLottieRef}
        source={require("../assets/lotties/ai_searching.json")}
        autoPlay
        loop
        style={styles.statusLottie}
      />
    );
  }

  return (
    <View
      style={[
        styles.statusStaticGlyph,
        {
          backgroundColor: isError
            ? "rgba(255,59,48,0.14)"
            : isActive
              ? "rgba(124,251,199,0.18)"
              : "rgba(148,163,184,0.14)",
        },
      ]}
    >
      <LinearGradient
        colors={
          isError
            ? ["#FF8A80", "#FF453A"]
            : isActive
              ? ["#7CFBC7", "#10B7E8"]
              : ["#A5B4C7", "#6B7C93"]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statusStaticGlyphInner}
      >
        <Ionicons
          name={
            isError
              ? "alert-outline"
              : isActive
                ? "sparkles"
                : "sparkles-outline"
          }
          size={20}
          color="#FFFFFF"
        />
      </LinearGradient>
    </View>
  );
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

export function CarModeView() {
  const { themeScheme, colors } = useTheme();
  const [sessionState, setSessionState] = useState(
    DriveSessionStore.getState(),
  );
  const [hasRoutePlan, setHasRoutePlan] = useState(
    !!DriveSessionStore.getRoutePlanData(),
  );
  const [routePlanSheetIndex, setRoutePlanSheetIndex] = useState(
    DriveSessionStore.getRoutePlanSheetIndex() >= 0
      ? DriveSessionStore.getRoutePlanSheetIndex()
      : DriveSessionStore.getRoutePlanData()
        ? 1
        : -1,
  );
  const [manualConfirmAction, setManualConfirmAction] = useState<
    "end_drive" | "connect_voice" | "stop_voice" | "start_drive" | null
  >(null);
  const [isPreviewMode, setIsPreviewMode] = useState(
    !!DriveSessionStore.getContext()?.isPreviewMode,
  );
  const speed = useSpeed();
  const [displaySpeed, setDisplaySpeed] = useState(speed);

  // Hook into the ElevenLabs agent lifecycle
  const {
    audioLevel,
    stopSession,
    stopConversation,
    startSession,
    toolCalls,
    status,
    isMuted,
    setMuted,
  } = useDrivingAgent();

  const isDark = themeScheme === "dark";
  const glassTint = isDark ? "dark" : "light";
  const textColor = isDark ? "#fff" : "#000";
  const subtextColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  // Animation values
  const entranceAnim = useSharedValue(0);
  const headerY = useSharedValue(-120);
  const statsX = useSharedValue(120);
  const assistantY = useSharedValue(150);
  const detailPillOpacity = useSharedValue(1);
  const detailPillTranslateY = useSharedValue(0);

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
      setRoutePlanSheetIndex(DriveSessionStore.getRoutePlanSheetIndex());
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

  const assistantStatus = useMemo(() => {
    const pendingTool =
      [...toolCalls]
        .reverse()
        .find((toolCall) => toolCall.status === "pending") || null;

    if (pendingTool) {
      return {
        headline:
          TOOL_STATUS_COPY[pendingTool.toolName]?.headline ||
          "İŞLEM DEVAM EDİYOR",
        detail:
          TOOL_STATUS_COPY[pendingTool.toolName]?.detail ||
          "AKBA isteğinizi işliyor.",
        animate: true,
        hideDetailPill: true,
        isError: false,
      };
    }

    if (sessionState === DriveSessionState.PLANNING_ROUTE) {
      return {
        headline: "ROTA HESAPLANIYOR",
        detail: "AKBA yeni rotayı hazırlıyor.",
        animate: true,
        hideDetailPill: true,
        isError: false,
      };
    }

    if (isPreviewMode && hasRoutePlan && !isVoiceTransportActive) {
      return {
        headline: "ROTA ÖNİZLEMEDE",
        detail: "İsterseniz sürüşü başlatabilir veya AKBA'ya yeniden bağlanabilirsiniz.",
        animate: false,
        hideDetailPill: false,
        isError: false,
      };
    }

    if (hasRoutePlan && !isVoiceTransportActive) {
      return {
        headline: "AKBA PASİF",
        detail: "Yeniden bağlanıp AKBA ile konuşmaya devam edebilirsiniz.",
        animate: false,
        hideDetailPill: false,
        isError: false,
      };
    }

    if (!hasRoutePlan && status === "disconnected" && !hasEverConnected) {
      // First frame of a fresh session: nothing has failed yet.
      return {
        headline: "AKBA HAZIRLANIYOR",
        detail: "Ses bağlantısı kuruluyor.",
        animate: false,
        hideDetailPill: false,
        isError: false,
      };
    }

    if (!hasRoutePlan && (status === "disconnected" || status === "error")) {
      return {
        headline: "BAĞLANTI KOPTU",
        detail: "Tekrar bağlanmak için orb'a dokunun.",
        animate: false,
        hideDetailPill: false,
        isError: true,
      };
    }

    if (
      status === "connecting" ||
      sessionState === DriveSessionState.AI_CONNECTING
    ) {
      return {
        headline: "AKBA BAĞLANIYOR",
        detail: "Ses bağlantısı hazırlanıyor.",
        animate: false,
        hideDetailPill: false,
        isError: false,
      };
    }

    switch (sessionState) {
      case DriveSessionState.AI_LISTENING:
        return {
          headline: hasRoutePlan ? "AKBA AKTİF" : "NEREYE GİDİYORSUN?",
          detail: isMuted
            ? "Mikrofon kapalı. Açtığınızda AKBA sizi yeniden duyar."
            : hasRoutePlan
              ? "AKBA sizi dinliyor."
              : "Gitmek istediğiniz yeri söyleyin, AKBA rotayı planlasın.",
          animate: false,
          hideDetailPill: false,
          isError: false,
        };
      case DriveSessionState.AI_SPEAKING:
        return {
          headline: "AKBA AKTİF",
          detail: isMuted
            ? "AKBA konuşuyor. Mikrofon şu anda kapalı."
            : "AKBA konuşuyor.",
          animate: false,
          hideDetailPill: false,
          isError: false,
        };
      case DriveSessionState.AI_ERROR:
        return {
          headline: "BAĞLANTI KOPTU",
          detail: "Tekrar bağlanmak için orb'a dokunun.",
          animate: false,
          hideDetailPill: false,
          isError: true,
        };
      case DriveSessionState.CAR_SESSION_ACTIVE:
      case DriveSessionState.NAVIGATION_ONLY:
        return {
          headline: "AKBA PASİF",
          detail: "Konuşmayı yeniden başlatmak için orb'a veya üstteki düğmeye dokunun.",
          animate: false,
          hideDetailPill: false,
          isError: false,
        };
      default:
        return {
          headline: "AKBA AKTİF",
          detail: "Size nasıl yardımcı olabilirim?",
          animate: false,
          hideDetailPill: false,
          isError: false,
        };
    }
  }, [
    hasRoutePlan,
    isPreviewMode,
    isMuted,
    isVoiceTransportActive,
    sessionState,
    status,
    toolCalls,
  ]);

  useEffect(() => {
    detailPillOpacity.value = 0;
    detailPillTranslateY.value = 8;
    detailPillOpacity.value = withTiming(1, {
      duration: 260,
      easing: Easing.out(Easing.ease),
    });
    detailPillTranslateY.value = withTiming(0, {
      duration: 260,
      easing: Easing.out(Easing.ease),
    });
  }, [assistantStatus.detail, detailPillOpacity, detailPillTranslateY]);

  useEffect(() => {
    const isVisible =
      sessionState !== DriveSessionState.IDLE &&
      sessionState !== DriveSessionState.PROMPTING;
    const shouldYieldToRoutePlanSheet = hasRoutePlan && routePlanSheetIndex > 0;
    const shouldHideAssistant =
      shouldYieldToRoutePlanSheet || (isVisible && hasRoutePlan && !isAiActive);

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
      setDisplaySpeed(Math.round(speed));
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

  const animatedDetailPillStyle = useAnimatedStyle(() => ({
    opacity: detailPillOpacity.value,
    transform: [{ translateY: detailPillTranslateY.value }],
  }));

  const isActive =
    sessionState !== DriveSessionState.IDLE &&
    sessionState !== DriveSessionState.PROMPTING;
  const shouldHideFloatingStats = hasRoutePlan && routePlanSheetIndex > 0;
  const shouldYieldToRoutePlanSheet = hasRoutePlan && routePlanSheetIndex > 0;
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

  const handleConfirmEndDrive = () => {
    setManualConfirmAction(null);
    stopSession(); // Cleans up agent, socket, and store
  };

  const handleEndDrivePress = () => {
    setManualConfirmAction("end_drive");
  };

  const isAutomaticEndConfirm =
    sessionState === DriveSessionState.ENDING_DRIVE_CONFIRMATION;
  const isEndConfirmVisible = !!manualConfirmAction || isAutomaticEndConfirm;

  // The header button used to be inert until a route existed; now it also
  // (re)connects AKBA before the first route.
  const canReconnectVoice = !isVoiceTransportActive;
  const canStopConversation = isVoiceTransportActive;
  const canToggleMic = isVoiceTransportActive;
  const isDriveActionPreviewStart = isPreviewMode;

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

  return (
    <View
      style={styles.container}
      pointerEvents={shouldYieldToRoutePlanSheet ? "none" : "box-none"}
    >
      {/* Floating Top Panel */}
      <Animated.View style={[styles.floatingHeader, animatedHeaderStyle]}>
        <BlurView intensity={90} tint={glassTint} style={styles.headerGlass}>
          <SafeAreaView style={styles.headerSafeArea}>
            <View style={styles.headerContent}>
              <View style={styles.headerTopRow}>
                <View style={styles.statusBadge}>
                  <View
                    style={[
                      styles.statusVisualWrap,
                      {
                        backgroundColor: assistantStatus.isError
                          ? "rgba(255,59,48,0.12)"
                          : assistantStatus.animate
                            ? "rgba(12, 188, 223, 0.14)"
                            : isAiActive
                              ? "rgba(124,251,199,0.14)"
                              : "rgba(148,163,184,0.12)",
                      },
                    ]}
                  >
                    <StatusGlyph
                      isAnimated={assistantStatus.animate}
                      isError={assistantStatus.isError}
                      isActive={isAiActive}
                    />
                  </View>
                  <View style={styles.statusTextStack}>
                    <Text style={[styles.statusEyebrow, { color: subtextColor }]}>
                      Sürüş Asistanı
                    </Text>
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color: assistantStatus.isError
                            ? colors.danger
                            : textColor,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {assistantStatus.headline}
                    </Text>
                    <Text
                      style={[styles.statusDetailText, { color: subtextColor }]}
                      numberOfLines={2}
                    >
                      {assistantStatus.detail}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.headerActionsRow}>
                <TouchableOpacity
                  onPress={promptBatteryLevel}
                  activeOpacity={0.78}
                  accessibilityLabel="Batarya seviyesini gir"
                  style={[
                    styles.secondaryHeaderAction,
                    {
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(15,23,42,0.06)",
                      borderColor: isDark
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(15,23,42,0.08)",
                    },
                  ]}
                >
                  <Ionicons name="battery-half" size={18} color={textColor} />
                  <Text style={[styles.secondaryHeaderActionText, { color: textColor }]}>
                    {batteryPrefs.updatedAt === null ? "%?" : `%${batteryStart}`}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleVoiceButtonPress}
                  activeOpacity={0.78}
                  style={[
                    styles.secondaryHeaderAction,
                    {
                      opacity: canStopConversation || canReconnectVoice ? 1 : 0.5,
                      backgroundColor: isDark
                        ? "rgba(255,255,255,0.08)"
                        : "rgba(15,23,42,0.06)",
                      borderColor: isDark
                        ? "rgba(255,255,255,0.1)"
                        : "rgba(15,23,42,0.08)",
                    },
                  ]}
                  disabled={!canStopConversation && !canReconnectVoice}
                >
                  <Ionicons name={voiceActionIcon} size={18} color={textColor} />
                  <Text
                    style={[
                      styles.secondaryHeaderActionText,
                      { color: textColor },
                    ]}
                  >
                    {voiceActionLabel}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setMuted(!isMuted)}
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
                          : "rgba(15,23,42,0.06)",
                      borderColor: isMuted
                        ? "rgba(255,159,10,0.24)"
                        : isDark
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(15,23,42,0.08)",
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
                  <Text style={styles.endDriveTextCompact}>
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
          <BlurView intensity={70} tint={glassTint} style={styles.statGlass}>
            <Text style={[styles.statValue, { color: textColor }]}>
              {Number.isFinite(displaySpeed) && displaySpeed >= 0
                ? displaySpeed
                : "-"}
            </Text>
            <Text style={[styles.statLabel, { color: subtextColor }]}>
              km/h
            </Text>
          </BlurView>
          <BlurView intensity={70} tint={glassTint} style={styles.statGlass}>
            <Text style={[styles.statValue, { color: textColor }]}>
              {arrivalTimeFormatted}
            </Text>
            <Text style={[styles.statLabel, { color: subtextColor }]}>
              Varış
            </Text>
          </BlurView>
        </Animated.View>
      )}

      {/* Assistant Area (Bottom Center) */}
      <Animated.View
        style={[styles.assistantContainer, animatedAssistantStyle]}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => !isVoiceTransportActive && startSession()}
          disabled={isVoiceTransportActive}
          style={styles.orbTouchTarget}
        >
          <AssistantOrb state={sessionState} audioLevel={audioLevel} />
        </TouchableOpacity>

        {!assistantStatus.hideDetailPill && (
          <Animated.View style={animatedDetailPillStyle} pointerEvents="none">
            <BlurView
              intensity={60}
              tint={glassTint}
              style={styles.assistantTextPill}
              pointerEvents="none"
            >
              <Text style={[styles.assistantText, { color: textColor }]}>
                {assistantStatus.detail}
              </Text>
            </BlurView>
          </Animated.View>
        )}
      </Animated.View>

      {/* End Drive Confirmation Modal */}
      <Modal transparent visible={isEndConfirmVisible} animationType="fade">
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
    top: Platform.OS === "ios" ? 60 : 30,
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
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  statusVisualWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  statusLottie: {
    width: 68,
    height: 68,
  },
  statusStaticGlyph: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  statusStaticGlyphInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  statusTextStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statusEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  statusText: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  statusDetailText: {
    fontSize: 12,
    lineHeight: 16,
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
    bottom: 36,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1001,
    gap: 18,
  },
  orbTouchTarget: {
    width: 132,
    height: 132,
    borderRadius: 66,
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
  assistantTextPill: {
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 36,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(18, 26, 32, 0.18)",
    maxWidth: "88%",
  },
  assistantText: {
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
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
