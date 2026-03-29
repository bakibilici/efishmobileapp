import React, { useEffect, useState, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Modal,
} from "react-native";
import { BlurView } from "expo-blur";
import LottieView from "lottie-react-native";
import Animated, {
  cancelAnimation,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
  withRepeat,
  withSequence,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "../context/ThemeContext";
import { useSpeed } from "../hooks/useSpeed";
import { DriveSessionStore, DriveSessionState } from "../services/DriveSessionStore";

import { useDrivingAgent } from "../hooks/useDrivingAgent";

const TOOL_STATUS_COPY: Record<
  string,
  { headline: string; detail: string }
> = {
  create_route_plan: {
    headline: "ROTA HESAPLANIYOR",
    detail: "Atlas yeni rotayı hazırlıyor.",
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
    detail: "Atlas ses oturumunu sonlandırıyor.",
  },
};

const AssistantOrb = ({ state, audioLevel }: { state: DriveSessionState; audioLevel: number }) => {
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
          duration:
            state === DriveSessionState.AI_SPEAKING ? 2600 : 6400,
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
          withTiming(1.02, { duration: 850, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.98, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 850, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.96, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      haloScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      haloOpacity.value = withRepeat(withTiming(0.44, { duration: 1000 }), -1, true);
      glowOpacity.value = withTiming(0.55, { duration: 500 });
    } else if (state === DriveSessionState.AI_LISTENING) {
      shellScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.99, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      haloScale.value = withRepeat(
        withSequence(
          withTiming(1.13, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.02, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      haloOpacity.value = withRepeat(withTiming(0.5, { duration: 850 }), -1, true);
      glowOpacity.value = withRepeat(withTiming(0.62, { duration: 850 }), -1, true);
    } else if (state === DriveSessionState.AI_SPEAKING) {
      shellScale.value = withTiming(1.05, { duration: 220, easing: Easing.out(Easing.ease) });
      coreScale.value = withTiming(1.12, { duration: 220, easing: Easing.out(Easing.ease) });
      haloScale.value = withTiming(1.18, { duration: 220, easing: Easing.out(Easing.ease) });
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
          colors={["rgba(107, 251, 199, 0.02)", "rgba(78, 223, 255, 0.42)", "rgba(0, 147, 201, 0.06)"]}
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
        <BlurView
          intensity={22}
          tint="light"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
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
  const [sessionState, setSessionState] = useState(DriveSessionStore.getState());
  const [hasRoutePlan, setHasRoutePlan] = useState(!!DriveSessionStore.getRoutePlanData());
  const [showManualEndConfirm, setShowManualEndConfirm] = useState(false);
  const speed = useSpeed();
  const [displaySpeed, setDisplaySpeed] = useState(speed);

  // Hook into the ElevenLabs agent lifecycle
  const { audioLevel, stopSession, startSession, toolCalls, status } = useDrivingAgent();
  const statusLottieRef = useRef<LottieView>(null);
  
  const isDark = themeScheme === "dark";
  const glassTint = isDark ? "dark" : "light";
  const textColor = isDark ? "#fff" : "#000";
  const subtextColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  // Animation values
  const entranceAnim = useSharedValue(0);
  const headerY = useSharedValue(-120);
  const statsX = useSharedValue(120);
  const assistantY = useSharedValue(150);

  useEffect(() => {
    const unsub = DriveSessionStore.onStateChange((newState) => {
      setSessionState(newState);
      setHasRoutePlan(!!DriveSessionStore.getRoutePlanData());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (
      sessionState === DriveSessionState.IDLE ||
      sessionState === DriveSessionState.ENDING_DRIVE_CONFIRMATION
    ) {
      setShowManualEndConfirm(false);
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

  const assistantStatus = useMemo(() => {
    const pendingTool =
      [...toolCalls].reverse().find((toolCall) => toolCall.status === "pending") ||
      null;

    if (pendingTool) {
      return {
        headline:
          TOOL_STATUS_COPY[pendingTool.toolName]?.headline || "İŞLEM DEVAM EDİYOR",
        detail:
          TOOL_STATUS_COPY[pendingTool.toolName]?.detail ||
          "Atlas isteğinizi işliyor.",
        animate: true,
        hideDetailPill: true,
        isError: false,
      };
    }

    if (sessionState === DriveSessionState.PLANNING_ROUTE) {
      return {
        headline: "ROTA HESAPLANIYOR",
        detail: "Atlas yeni rotayı hazırlıyor.",
        animate: true,
        hideDetailPill: true,
        isError: false,
      };
    }

    if (hasRoutePlan && !isVoiceTransportActive) {
      return {
        headline: "ATLAS PASİF",
        detail: "Konuşmak için orb'a dokunun.",
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

    if (status === "connecting" || sessionState === DriveSessionState.AI_CONNECTING) {
      return {
        headline: "ATLAS BAĞLANIYOR",
        detail: "Ses bağlantısı kuruluyor.",
        animate: false,
        hideDetailPill: false,
        isError: false,
      };
    }

    switch (sessionState) {
      case DriveSessionState.AI_LISTENING:
        return {
          headline: "ATLAS AKTİF",
          detail: "Atlas sizi dinliyor.",
          animate: false,
          hideDetailPill: false,
          isError: false,
        };
      case DriveSessionState.AI_SPEAKING:
        return {
          headline: "ATLAS AKTİF",
          detail: "Atlas konuşuyor.",
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
          headline: "ATLAS PASİF",
          detail: "Konuşmak için orb'a dokunun.",
          animate: false,
          hideDetailPill: false,
          isError: false,
        };
      default:
        return {
          headline: "ATLAS AKTİF",
          detail: "Size nasıl yardımcı olabilirim?",
          animate: false,
          hideDetailPill: false,
          isError: false,
        };
    }
  }, [hasRoutePlan, isVoiceTransportActive, sessionState, status, toolCalls]);

  useEffect(() => {
    if (!statusLottieRef.current) return;

    if (assistantStatus.animate) {
      statusLottieRef.current.play();
      return;
    }

    statusLottieRef.current.reset();
    statusLottieRef.current.pause();
  }, [assistantStatus.animate]);

  useEffect(() => {
    const isVisible = sessionState !== DriveSessionState.IDLE && sessionState !== DriveSessionState.PROMPTING;
    const shouldHideAssistant = isVisible && (hasRoutePlan && !isAiActive);

    if (isVisible) {
      entranceAnim.value = withTiming(1, { duration: 800, easing: Easing.out(Easing.exp) });
      headerY.value = withDelay(100, withTiming(0, { duration: 800, easing: Easing.out(Easing.exp) }));
      statsX.value = withDelay(250, withTiming(0, { duration: 800, easing: Easing.out(Easing.exp) }));
      
      // If AI is inactive and we have a route, hide assistant orb
      assistantY.value = withDelay(400, withTiming(shouldHideAssistant ? 350 : 0, { duration: 800, easing: Easing.out(Easing.exp) }));
    } else {
      entranceAnim.value = withTiming(0, { duration: 500 });
      headerY.value = withTiming(-120, { duration: 500 });
      statsX.value = withTiming(120, { duration: 500 });
      assistantY.value = withTiming(150, { duration: 500 });
    }
  }, [sessionState, hasRoutePlan, isAiActive, entranceAnim, headerY, statsX, assistantY]);

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

  const isActive = sessionState !== DriveSessionState.IDLE && sessionState !== DriveSessionState.PROMPTING;
  // console.log("[CarModeView] 🎯 sessionState =", sessionState, "| isActive =", isActive, "| context =", !!DriveSessionStore.getContext());

  // Derive arrival time from route duration
  const route = DriveSessionStore.getContext()?.route;
  const durationInSeconds = route?.summary?.duration || 0;
  
  const arrivalTimeFormatted = useMemo(() => {
    if (!durationInSeconds) return "--:--";
    const arrivalDate = new Date(Date.now() + durationInSeconds * 1000);
    return arrivalDate.toLocaleTimeString("tr-TR", { hour: '2-digit', minute:'2-digit' });
  }, [durationInSeconds]);

  if (!isActive) return null;

  const handleConfirmEndDrive = () => {
    setShowManualEndConfirm(false);
    stopSession(); // Cleans up agent, socket, and store
  };

  const handleEndDrivePress = () => {
    setShowManualEndConfirm(true);
  };

  const isAutomaticEndConfirm =
    sessionState === DriveSessionState.ENDING_DRIVE_CONFIRMATION;
  const isEndConfirmVisible = showManualEndConfirm || isAutomaticEndConfirm;

  const handleDismissEndConfirmation = () => {
    setShowManualEndConfirm(false);
    if (isAutomaticEndConfirm) {
      DriveSessionStore.cancelEndConfirmation();
    }
  };

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Floating Top Panel */}
      <Animated.View style={[styles.floatingHeader, animatedHeaderStyle]}>
        <BlurView intensity={90} tint={glassTint} style={styles.headerGlass}>
          <SafeAreaView style={styles.headerSafeArea}>
            <View style={styles.headerContent}>
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
                  <LottieView
                    ref={statusLottieRef}
                    source={require("../assets/lotties/ai_searching.json")}
                    autoPlay={false}
                    loop={assistantStatus.animate}
                    style={styles.statusLottie}
                  />
                </View>
                <View style={styles.statusTextStack}>
                  <Text style={[styles.statusEyebrow, { color: subtextColor }]}>
                    Atlas
                  </Text>
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color: assistantStatus.isError ? colors.danger : textColor,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {assistantStatus.headline}
                  </Text>
                </View>
              </View>

              <TouchableOpacity 
                onPress={handleEndDrivePress} 
                activeOpacity={0.7}
                style={[styles.endDriveButtonCompact, { backgroundColor: colors.danger }]}
              >
                <Text style={styles.endDriveTextCompact}>BİTİR</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        </BlurView>
      </Animated.View>

      {/* Floating Driving Stats (Right Side) */}
      <Animated.View
        pointerEvents="none"
        style={[styles.floatingStats, animatedStatsStyle]}
      >
        <BlurView intensity={70} tint={glassTint} style={styles.statGlass}>
          <Text style={[styles.statValue, { color: textColor }]}>
            {displaySpeed >= 0 ? displaySpeed : "?"}
          </Text>
          <Text style={[styles.statLabel, { color: subtextColor }]}>km/h</Text>
        </BlurView>
        <BlurView intensity={70} tint={glassTint} style={styles.statGlass}>
          <Text style={[styles.statValue, { color: textColor }]}>{arrivalTimeFormatted}</Text>
          <Text style={[styles.statLabel, { color: subtextColor }]}>Varış</Text>
        </BlurView>
      </Animated.View>

      {/* Assistant Area (Bottom Center) */}
      <Animated.View
        style={[styles.assistantContainer, animatedAssistantStyle]}
        pointerEvents="box-none"
      >
        <TouchableOpacity 
          activeOpacity={0.9} 
          onPress={() => !isAiActive && startSession()}
          disabled={isAiActive}
          style={styles.orbTouchTarget}
        >
          <AssistantOrb state={sessionState} audioLevel={audioLevel} />
        </TouchableOpacity>
        
        {!assistantStatus.hideDetailPill && (
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
        )}
      </Animated.View>

      {/* End Drive Confirmation Modal */}
      <Modal
        transparent
        visible={isEndConfirmVisible}
        animationType="fade"
      >
        <View style={styles.modalOverlay}>
          <BlurView intensity={30} tint={glassTint} style={StyleSheet.absoluteFill} />
          <View style={[styles.modalCard, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" }]}>
            <Text style={[styles.modalTitle, { color: textColor }]}>
              {showManualEndConfirm ? "Sürüşü şimdi bitirelim mi?" : "Sürüş bitti mi?"}
            </Text>
            <Text style={[styles.modalSubtitle, { color: subtextColor }]}>
              {showManualEndConfirm
                ? "Atlas kapanacak ve sürüş oturumu sonlandırılacak. İsterseniz daha sonra yeniden başlatabilirsiniz."
                : "Araç hareketi algılanmıyor. Sürüşü bitirmek ister misiniz?"}
            </Text>
            <TouchableOpacity 
              style={[styles.modalButton, { backgroundColor: colors.danger, marginTop: 12 }]} 
              onPress={handleConfirmEndDrive}
            >
              <Text style={[styles.modalButtonText, { color: "#FFFFFF" }]}>Sürüşü Bitir</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.modalButton, { backgroundColor: "transparent", borderWidth: 1, borderColor: isDark ? "#333" : "#E5E5EA" }]} 
              onPress={handleDismissEndConfirmation}
            >
              <Text style={[styles.modalButtonText, { color: textColor }]}>
                {showManualEndConfirm ? "Vazgeç" : "Sürüşe Devam Et"}
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
    top: Platform.OS === 'ios' ? 60 : 30,
    left: 20,
    right: 20,
    zIndex: 1001,
  },
  headerGlass: {
    borderRadius: 40,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    marginHorizontal: 16,
  },
  headerSafeArea: {
    paddingVertical: 4,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    height: 60,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  statusVisualWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  statusLottie: {
    width: 34,
    height: 34,
  },
  statusTextStack: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  statusEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  endDriveButtonCompact: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  endDriveTextCompact: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  floatingStats: {
    position: "absolute",
    right: 20,
    top: Platform.OS === 'ios' ? 160 : 130,
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
    alignItems: "center",
    justifyContent: "center",
  },
  orbContainer: {
    width: 118,
    height: 118,
    alignItems: "center",
    justifyContent: "center",
  },
  orbHalo: {
    position: "absolute",
    width: 124,
    height: 124,
    borderRadius: 62,
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
