import { useTheme } from '@/context/ThemeContext';
import { ChargingState } from '@/hooks/useChargingSimulation';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    interpolateColor,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withRepeat,
    withSequence,
    withTiming
} from 'react-native-reanimated';
import FinishingSpinner from './FinishingSpinner';

type ChargingWidgetProps = {
    state: ChargingState;
    onExpand: () => void;
};

/**
 * StartingDots — three-dot cascading loader used as the left-side "Şarj
 * Başlatılıyor" effect. Different from the spinner that lives on the right,
 * so the user doesn't see the same animation twice on the same row.
 */
const StartingDots: React.FC<{ color?: string }> = ({ color = '#fff' }) => {
    const a = useSharedValue(0);
    const b = useSharedValue(0);
    const c = useSharedValue(0);

    useEffect(() => {
        const loop = (sv: typeof a, delay: number) => {
            sv.value = withDelay(
                delay,
                withRepeat(
                    withSequence(
                        withTiming(1, { duration: 360 }),
                        withTiming(0, { duration: 360 }),
                        withDelay(560, withTiming(0, { duration: 0 })),
                    ),
                    -1,
                    false,
                ),
            );
        };
        loop(a, 0);
        loop(b, 160);
        loop(c, 320);
    }, []);

    const styleA = useAnimatedStyle(() => ({
        opacity: 0.35 + a.value * 0.65,
        transform: [{ scale: 0.85 + a.value * 0.35 }],
    }));
    const styleB = useAnimatedStyle(() => ({
        opacity: 0.35 + b.value * 0.65,
        transform: [{ scale: 0.85 + b.value * 0.35 }],
    }));
    const styleC = useAnimatedStyle(() => ({
        opacity: 0.35 + c.value * 0.65,
        transform: [{ scale: 0.85 + c.value * 0.35 }],
    }));

    return (
        <View style={dotStyles.row}>
            <Animated.View style={[dotStyles.dot, { backgroundColor: color }, styleA]} />
            <Animated.View style={[dotStyles.dot, { backgroundColor: color }, styleB]} />
            <Animated.View style={[dotStyles.dot, { backgroundColor: color }, styleC]} />
        </View>
    );
};

const dotStyles = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    dot: { width: 6, height: 6, borderRadius: 3 },
});

// Phase color tokens — kept in sync with ChargingScreen
const PHASE_COLOR = {
    finishing: '#FFB800',   // amber — free-park countdown
    parking: '#E94B2C',     // kızıl turunç (vermilion / red-orange) — paid parking accruing
    completed: '#2CDD9D',   // green — terminal success
    failed: '#FF3B30',      // red — terminal error
};

export default function ChargingWidget({ state, onExpand }: ChargingWidgetProps) {
    const { colors, themeScheme } = useTheme();
    const isDark = themeScheme === 'dark';

    // ── Phase flags ──
    const isCompleted = state.sessionStatus === 'COMPLETED' || state.sessionStatus === 'FINISHED';
    const isFailed = state.sessionStatus === 'FAILED' || state.isFailed;
    const isFinishingPhase = state.sessionStatus === 'FINISHING';
    const isParkingPhase = state.sessionStatus === 'PARKING';

    const showStartingOverlay =
        state.isStarting && !state.isFinishing && !isFinishingPhase && !isParkingPhase && !isCompleted && !isFailed;
    const showCompletedOverlay = isCompleted && !state.isFinishing && !state.isDismissing;
    const showStoppingOverlay =
        state.isFinishing && !isFinishingPhase && !isParkingPhase && !isCompleted && !isFailed && !state.isDismissing;
    const showDismissingOverlay = state.isDismissing;

    const isActivelyCharging =
        state.isActive &&
        !showStartingOverlay &&
        !showStoppingOverlay &&
        !showCompletedOverlay &&
        !showDismissingOverlay &&
        !isFinishingPhase &&
        !isParkingPhase &&
        !isFailed;

    // ── 1s tick for live counters ──
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (!isFinishingPhase && !isParkingPhase && !isActivelyCharging) return;
        const id = setInterval(() => forceTick(t => (t + 1) & 0xffff), 1000);
        return () => clearInterval(id);
    }, [isFinishingPhase, isParkingPhase, isActivelyCharging]);

    // ── FINISHING: countdown ──
    let graceRemainingSec: number | null = null;
    let graceTotalSec: number | null = null;
    if (isFinishingPhase && state.endedAt && state.freeParkDurationMinutes != null) {
        graceTotalSec = state.freeParkDurationMinutes * 60;
        const graceEndsMs = new Date(state.endedAt).getTime() + graceTotalSec * 1000;
        graceRemainingSec = Math.max(0, Math.floor((graceEndsMs - Date.now()) / 1000));
    }
    const graceFreeForever = isFinishingPhase && state.parkingTariff == null;

    // ── PARKING: count-up + fee ──
    let parkingElapsedSec = 0;
    let parkingFee = 0;
    if (isParkingPhase && state.parkingSession) {
        const startedMs = new Date(state.parkingSession.started_at).getTime();
        parkingElapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
        const minutes = parkingElapsedSec / 60;
        const raw = minutes * (state.parkingSession.price ?? 0);
        const cap = state.parkingSession.max_price ?? null;
        parkingFee = cap != null && raw > cap ? cap : raw;
    }

    // ── Smooth progress bars (Reanimated, linear over remaining duration) ──
    // These animate at 60fps independently of the 1Hz forceTick used for the
    // text counters — so the bars glide instead of stepping.
    const finishingProgress = useSharedValue(1);
    const parkingProgress = useSharedValue(0);

    useEffect(() => {
        if (isFinishingPhase && state.endedAt && state.freeParkDurationMinutes != null && !graceFreeForever) {
            const startedMs = new Date(state.endedAt).getTime();
            const totalMs = state.freeParkDurationMinutes * 60_000;
            const elapsedMs = Date.now() - startedMs;
            const initialRatio = Math.max(0, Math.min(1, 1 - elapsedMs / totalMs));
            const remainingMs = Math.max(0, totalMs - elapsedMs);

            // Snap to current ratio without animation, then animate linearly to 0.
            finishingProgress.value = initialRatio;
            if (remainingMs > 0) {
                finishingProgress.value = withTiming(0, {
                    duration: remainingMs,
                    easing: Easing.linear,
                });
            }
        } else {
            finishingProgress.value = withTiming(1, { duration: 200 });
        }
        // Stable deps: only re-run when the phase or anchors change.
    }, [isFinishingPhase, graceFreeForever, state.endedAt, state.freeParkDurationMinutes]);

    useEffect(() => {
        const ps = state.parkingSession;
        if (isParkingPhase && ps?.started_at && ps.price && ps.max_price && ps.max_price > 0) {
            const startedMs = new Date(ps.started_at).getTime();
            const totalMs = (ps.max_price / ps.price) * 60_000; // ms to hit the cap
            const elapsedMs = Math.max(0, Date.now() - startedMs);
            const initialRatio = Math.max(0, Math.min(1, elapsedMs / totalMs));
            const remainingMs = Math.max(0, totalMs - elapsedMs);

            parkingProgress.value = initialRatio;
            if (remainingMs > 0) {
                parkingProgress.value = withTiming(1, {
                    duration: remainingMs,
                    easing: Easing.linear,
                });
            }
        } else {
            parkingProgress.value = withTiming(0, { duration: 200 });
        }
    }, [
        isParkingPhase,
        state.parkingSession?.started_at,
        state.parkingSession?.price,
        state.parkingSession?.max_price,
    ]);

    const formatHMS = (totalSec: number) => {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const pad = (n: number) => n.toString().padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    };

    // ── Cross-fade on phase transition ──
    const [displayState, setDisplayState] = useState(state);
    const contentOpacity = useSharedValue(1);
    useEffect(() => {
        const hasStateChanged =
            state.isStarting !== displayState.isStarting ||
            state.isFinishing !== displayState.isFinishing ||
            state.isDismissing !== displayState.isDismissing ||
            state.sessionStatus !== displayState.sessionStatus ||
            state.mode !== displayState.mode;

        if (hasStateChanged) {
            contentOpacity.value = withTiming(0, { duration: 180 }, () => {
                runOnJS(setDisplayState)(state);
                contentOpacity.value = withTiming(1, { duration: 280 });
            });
        }
    }, [state.isStarting, state.isFinishing, state.isDismissing, state.sessionStatus, state.mode]);

    // ── Themes ──
    const getModeTheme = (mode: string) => {
        if (mode === 'AC') return { bg: '#4BACE4', accent: '#4BACE4', glow: 'rgba(75,172,228,0.45)', lightningCount: 1 };
        if (mode === 'HPC') return { bg: '#7C4DFF', accent: '#7C4DFF', glow: 'rgba(124,77,255,0.5)', lightningCount: 3 };
        return { bg: '#FF8A1F', accent: '#FF8A1F', glow: 'rgba(255,138,31,0.45)', lightningCount: 2 };
    };

    const getActiveTheme = (s: ChargingState) => {
        const mode = getModeTheme(s.mode);
        if (s.sessionStatus === 'FAILED' || s.isFailed) {
            return { ...mode, bg: PHASE_COLOR.failed, accent: PHASE_COLOR.failed, glow: 'rgba(255,59,48,0.5)' };
        }
        if (s.sessionStatus === 'COMPLETED' || s.sessionStatus === 'FINISHED' || s.isDismissing) {
            return { ...mode, bg: PHASE_COLOR.completed, accent: PHASE_COLOR.completed, glow: 'rgba(44,221,157,0.5)' };
        }
        if (s.sessionStatus === 'PARKING') {
            return { ...mode, bg: PHASE_COLOR.parking, accent: PHASE_COLOR.parking, glow: 'rgba(233,75,44,0.55)' };
        }
        if (s.sessionStatus === 'FINISHING') {
            return { ...mode, bg: PHASE_COLOR.finishing, accent: PHASE_COLOR.finishing, glow: 'rgba(255,184,0,0.5)' };
        }
        return mode;
    };
    const theme = getActiveTheme(state);
    const displayTheme = getActiveTheme(displayState);

    // ── Entrance / dismiss anim ──
    const entranceAnim = useSharedValue(0);
    const dismissBgAnim = useSharedValue(0);
    const batteryValue = useSharedValue(state.batteryLevel ?? 0);

    useEffect(() => {
        if (showDismissingOverlay) {
            entranceAnim.value = withDelay(2000, withTiming(0, { duration: 600 }));
        } else if (state.isActive) {
            entranceAnim.value = withTiming(1, { duration: 400 });
        } else {
            entranceAnim.value = withTiming(0, { duration: 300 });
        }
    }, [showDismissingOverlay, state.isActive]);

    useEffect(() => {
        dismissBgAnim.value = withTiming(showDismissingOverlay ? 1 : 0, { duration: 400 });
    }, [showDismissingOverlay]);

    useEffect(() => {
        batteryValue.value = withTiming(state.batteryLevel ?? 0, { duration: 800 });
    }, [state.batteryLevel]);

    // Background uses an accent fill for any non-default phase.
    const isAccentBg =
        showStartingOverlay ||
        showStoppingOverlay ||
        showDismissingOverlay ||
        isFinishingPhase ||
        isParkingPhase ||
        isFailed;

    const animatedContainerStyle = useAnimatedStyle(() => {
        const normalBg = isDark ? '#1C1C1E' : '#FFFFFF';
        const activeAccentBg = isAccentBg ? theme.bg : normalBg;

        const finalBg = interpolateColor(
            dismissBgAnim.value,
            [0, 1],
            [activeAccentBg, PHASE_COLOR.completed]
        );

        const borderColor =
            showDismissingOverlay || showCompletedOverlay
                ? PHASE_COLOR.completed
                : isAccentBg
                    ? 'rgba(255,255,255,0.18)'
                    : isDark ? '#3A3A3C' : '#E5E5E7';

        // Tall view for actively charging DC/HPC (progress bar) and for any phase
        // that has a secondary progress strip (FINISHING/PARKING).
        const tall = (isActivelyCharging && state.mode !== 'AC') || isFinishingPhase || isParkingPhase;

        return {
            opacity: entranceAnim.value,
            transform: [{ translateY: (1 - entranceAnim.value) * -12 }],
            backgroundColor: finalBg,
            borderColor,
            height: withTiming(tall ? 116 : 84, { duration: 400 }),
        };
    });

    const animatedContentStyle = useAnimatedStyle(() => ({ opacity: contentOpacity.value }));
    const progressStyle = useAnimatedStyle(() => ({ width: `${batteryValue.value}%` }));
    const finishingProgressStyle = useAnimatedStyle(() => ({ width: `${finishingProgress.value * 100}%` }));
    const parkingProgressStyle = useAnimatedStyle(() => ({ width: `${parkingProgress.value * 100}%` }));

    // Text color helper.
    const getTextStyle = (isSubtitle = false): any => {
        if (isAccentBg) {
            return { color: '#FFFFFF', opacity: isSubtitle ? 0.92 : 1, fontWeight: isSubtitle ? '600' : '900' };
        }
        if (showCompletedOverlay) {
            return { color: isSubtitle ? PHASE_COLOR.completed : colors.text, fontWeight: isSubtitle ? '600' : '900', opacity: 1 };
        }
        return { color: isSubtitle ? colors.textSecondary : colors.text, fontWeight: isSubtitle ? '600' : '900' };
    };

    // ── Title / Subtitle ──
    const title = displayState.isDismissing
        ? 'Şarj Başarıyla Tamamlandı'
        : displayState.sessionStatus === 'FAILED' || displayState.isFailed
            ? 'Şarj Başarısız'
            : displayState.sessionStatus === 'COMPLETED' || displayState.sessionStatus === 'FINISHED'
                ? 'Şarj Tamamlandı'
                : displayState.sessionStatus === 'PARKING'
                    ? 'Ücretli Park'
                    : displayState.sessionStatus === 'FINISHING'
                        ? 'Şarj Bitti'
                        : displayState.isStarting
                            ? 'Şarj Başlatılıyor'
                            : displayState.isFinishing
                                ? 'Şarj Durduruluyor'
                                : `${displayState.mode} Charging`;

    const renderSubtitle = () => {
        const baseStyle = [styles.subtitle, getTextStyle(true)] as any;

        if (displayState.isDismissing) {
            return <Text style={baseStyle} numberOfLines={1}>Soket ayrıldı, iyi yolculuklar!</Text>;
        }
        if (displayState.sessionStatus === 'FAILED' || displayState.isFailed) {
            return <Text style={baseStyle} numberOfLines={1}>{displayState.endReason || 'Bir hata oluştu'}</Text>;
        }
        if (displayState.sessionStatus === 'COMPLETED' || displayState.sessionStatus === 'FINISHED') {
            return <Text style={baseStyle} numberOfLines={1}>İyi yolculuklar dileriz!</Text>;
        }
        if (displayState.sessionStatus === 'PARKING') {
            return <Text style={baseStyle} numberOfLines={1}>Kabloyu çıkarın.</Text>;
        }
        if (displayState.sessionStatus === 'FINISHING') {
            if (graceFreeForever) {
                return <Text style={baseStyle} numberOfLines={1}>Ücretsiz park.</Text>;
            }
            return <Text style={baseStyle} numberOfLines={1}>Ücretsiz park modu.</Text>;
        }
        if (displayState.isStarting || displayState.isFinishing) {
            return <Text style={baseStyle} numberOfLines={1}>Lütfen bekleyin...</Text>;
        }
        // CHARGING
        return (
            <Text style={baseStyle} numberOfLines={1}>
                <Ionicons name="time-outline" size={13} /> {Math.floor(state.duration / 60)}m {state.duration % 60}s
                {'  ·  '}
                <Ionicons name="flash" size={12} /> {state.chargedAmount.toFixed(2)} kWh
            </Text>
        );
    };

    // ── Left circle ──
    const renderLeftIcon = () => {
        if (displayState.isDismissing || displayState.sessionStatus === 'COMPLETED' || displayState.sessionStatus === 'FINISHED') {
            return <Ionicons name="checkmark" size={28} color="#fff" />;
        }
        if (displayState.sessionStatus === 'FAILED' || displayState.isFailed) {
            return <Ionicons name="close" size={28} color="#fff" />;
        }
        if (displayState.sessionStatus === 'PARKING') {
            return <Ionicons name="car-sport" size={26} color="#fff" />;
        }
        if (displayState.sessionStatus === 'FINISHING') {
            return <Ionicons name="hourglass-outline" size={26} color="#fff" />;
        }
        // Starting: 3-dot cascade (different from the right-side spinner).
        if (displayState.isStarting) {
            return <StartingDots color="#fff" />;
        }
        // Stopping transient: keep the spinner here too (small/subtle).
        if (displayState.isFinishing && !isFinishingPhase && !isParkingPhase) {
            return <FinishingSpinner size={26} color="#fff" />;
        }
        return (
            <View style={styles.lightningWrap}>
                {Array.from({ length: displayTheme.lightningCount }).map((_, idx) => (
                    <View key={idx} style={{ marginLeft: idx > 0 ? -12 : 0 }}>
                        <Ionicons name="flash" size={24} color="#fff" />
                    </View>
                ))}
            </View>
        );
    };

    // ── Right side ──
    const renderRight = () => {
        // COMPLETED / DISMISSING
        if (showCompletedOverlay || displayState.isDismissing) {
            return (
                <View style={styles.rightStack}>
                    <Ionicons
                        name="checkmark-circle"
                        size={36}
                        color={displayState.isDismissing ? '#fff' : PHASE_COLOR.completed}
                    />
                    {state.chargeSessionData?.total_energy != null && (
                        <Text style={[styles.rightSmall, getTextStyle(true), { marginTop: 2 }]}>
                            {Number(state.chargeSessionData.total_energy).toFixed(1)} kWh
                        </Text>
                    )}
                </View>
            );
        }

        // FAILED
        if (displayState.sessionStatus === 'FAILED' || displayState.isFailed) {
            return <Ionicons name="alert-circle" size={36} color="#fff" />;
        }

        // FINISHING — big countdown / infinity, small label
        if (displayState.sessionStatus === 'FINISHING') {
            if (graceFreeForever) {
                return (
                    <View style={styles.rightStack}>
                        <Ionicons name="infinite" size={32} color="#fff" />
                        <Text style={[styles.rightSmall, { color: 'rgba(255,255,255,0.85)' }]}>Bedava</Text>
                    </View>
                );
            }
            return (
                <View style={styles.rightStack}>
                    <Text style={styles.rightBigMono} numberOfLines={1}>
                        {graceRemainingSec != null ? formatHMS(graceRemainingSec) : '--:--'}
                    </Text>
                    <Text style={[styles.rightSmall, { color: 'rgba(255,255,255,0.85)' }]}>kalan</Text>
                </View>
            );
        }

        // PARKING — large elapsed time, small fee + rate below
        if (displayState.sessionStatus === 'PARKING') {
            const price = state.parkingSession?.price ?? 0;
            return (
                <View style={styles.rightStack}>
                    <Text style={styles.rightBigMono} numberOfLines={1}>
                        {formatHMS(parkingElapsedSec)}
                    </Text>
                    <Text style={[styles.rightSmall, { color: 'rgba(255,255,255,0.92)' }]} numberOfLines={1}>
                        {parkingFee.toFixed(2)} ₺ · {price.toFixed(2)} ₺/dk
                    </Text>
                </View>
            );
        }

        // STARTING / STOPPING transient
        if (displayState.isStarting || showStoppingOverlay) {
            return <FinishingSpinner size={26} color="#FFFFFF" />;
        }

        // CHARGING
        // DC/HPC → battery %, AC → live power (kW). No more "LIVE" label.
        return (
            <View style={styles.rightStack}>
                {displayState.mode === 'AC' ? (
                    <Text style={[styles.percent, { color: displayTheme.accent }]}>
                        {(state.power ?? 0).toFixed(1)}
                        <Text style={styles.percentUnit}> kW</Text>
                    </Text>
                ) : (
                    <Text style={[styles.percent, { color: displayTheme.accent }]}>
                        {Math.floor(state.batteryLevel ?? 0)}%
                    </Text>
                )}
            </View>
        );
    };

    // ── Bottom progress strip ──
    const renderProgressStrip = () => {
        if (isActivelyCharging && state.mode !== 'AC') {
            return (
                <View style={styles.progressContainer}>
                    <View style={[styles.progressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                        <Animated.View style={[styles.progressBarFill, { backgroundColor: theme.accent }, progressStyle]}>
                            <View style={styles.progressShine} />
                        </Animated.View>
                    </View>
                </View>
            );
        }
        if (isFinishingPhase && !graceFreeForever) {
            // Countdown progress: full → empty, linear over remaining grace.
            return (
                <View style={styles.progressContainer}>
                    <View style={styles.progressBarOnAccent}>
                        <Animated.View style={[styles.progressBarFill, styles.progressBarFillSoft, finishingProgressStyle]}>
                            <View style={styles.progressShine} />
                        </Animated.View>
                    </View>
                </View>
            );
        }
        if (isParkingPhase) {
            // Fee accrual progress (linear toward max_price cap).
            return (
                <View style={styles.progressContainer}>
                    <View style={styles.progressBarOnAccent}>
                        <Animated.View style={[styles.progressBarFill, styles.progressBarFillSoft, parkingProgressStyle]}>
                            <View style={styles.progressShine} />
                        </Animated.View>
                    </View>
                </View>
            );
        }
        return null;
    };

    return (
        <Animated.View style={[styles.wrapper, animatedContainerStyle]}>
            <Pressable onPress={onExpand} style={styles.pressable}>
                <Animated.View style={[styles.content, animatedContentStyle]}>
                    {/* Left circle */}
                    <View
                        style={[
                            styles.iconCircle,
                            { backgroundColor: isAccentBg ? 'rgba(255,255,255,0.18)' : displayTheme.bg },
                        ]}
                    >
                        {renderLeftIcon()}
                    </View>

                    {/* Center info */}
                    <View style={styles.info}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.title, getTextStyle()]} numberOfLines={1}>
                                {title}
                            </Text>
                            {!isAccentBg && !showCompletedOverlay && displayState.mode === 'HPC' && (
                                <View style={[styles.ultraBadge, { backgroundColor: displayTheme.accent }]}>
                                    <Text style={styles.ultraText}>FAST</Text>
                                </View>
                            )}
                        </View>
                        {renderSubtitle()}
                    </View>

                    {/* Right side */}
                    <View style={styles.status}>{renderRight()}</View>
                </Animated.View>

                {renderProgressStrip()}
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        width: '100%',
        borderRadius: 24,
        borderWidth: 1.5,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.22,
                shadowRadius: 24,
            },
            android: {
                elevation: 16,
            },
        }),
    },
    pressable: {
        width: '100%',
        height: '100%',
        padding: 16,
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconCircle: {
        width: 50,
        height: 50,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    lightningWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    info: {
        flex: 1,
        minWidth: 0,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    title: {
        fontWeight: '900',
        fontSize: 17,
        letterSpacing: -0.5,
        flexShrink: 1,
    },
    ultraBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
    },
    ultraText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '900',
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 4,
    },
    status: {
        marginLeft: 8,
        alignItems: 'flex-end',
        justifyContent: 'center',
        minWidth: 78,
    },
    rightStack: {
        alignItems: 'flex-end',
    },
    rightBigMono: {
        color: '#fff',
        fontWeight: '900',
        fontSize: 22,
        letterSpacing: -0.5,
        // Tabular figures look more like a clock — RN uses fontVariant on iOS.
        ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as any } : {}),
    },
    rightSmall: {
        fontSize: 11,
        fontWeight: '700',
        marginTop: 2,
        letterSpacing: 0.2,
    },
    percent: {
        fontWeight: '900',
        fontSize: 24,
        letterSpacing: -0.6,
    },
    percentUnit: {
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0,
    },
    progressContainer: {
        width: '100%',
        marginTop: 12,
    },
    progressBarBg: {
        height: 10,
        borderRadius: 5,
        width: '100%',
        overflow: 'hidden',
    },
    progressBarOnAccent: {
        height: 6,
        borderRadius: 3,
        width: '100%',
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
    },
    progressBarFillSoft: {
        backgroundColor: '#fff',
        overflow: 'hidden',
    },
    progressShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255,255,255,0.25)',
        width: '30%',
        transform: [{ skewX: '-25deg' }],
    },
});
