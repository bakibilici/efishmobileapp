import { useTheme } from '@/context/ThemeContext';
import { ChargingMode, ChargingState } from '@/hooks/useChargingSimulation';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Easing, Image, Platform, Pressable, Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing as REasing, interpolateColor, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, Mask } from 'react-native-svg';
import FinishingSpinner from './FinishingSpinner';

const { width } = Dimensions.get('window');
const CIRCLE_SIZE = width * 0.75; // Large central circle
const STROKE_WIDTH = 15;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ChargingScreenProps = {
    state: ChargingState;
    onMinimize: () => void;
    onStop: () => void;
    onToggleDev: (mode: ChargingMode) => void;
};

// Pulse Indicator Component
const PulseIndicator = ({ isComplete, color: overrideColor }: { isComplete: boolean; color?: string }) => {
    const scaleAnim = useRef(new RNAnimated.Value(1)).current;

    useEffect(() => {
        if (!isComplete) {
            RNAnimated.loop(
                RNAnimated.sequence([
                    RNAnimated.timing(scaleAnim, {
                        toValue: 1.2,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    }),
                    RNAnimated.timing(scaleAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                    })
                ])
            ).start();
        } else {
            scaleAnim.setValue(1);
        }
    }, [isComplete]);

    const color = overrideColor || (isComplete ? '#2CDD9D' : '#FFD60A');

    return (
        <View style={styles.pulseContainer}>
            <RNAnimated.View
                style={[
                    styles.pulseDot,
                    {
                        backgroundColor: color,
                        transform: [{ scale: scaleAnim }],
                        opacity: isComplete ? 1 : 0.6
                    }
                ]}
            />
            <View style={[styles.pulseInner, { backgroundColor: color }]} />
        </View>
    );
};

export default function ChargingScreen({ state, onMinimize, onStop, onToggleDev }: ChargingScreenProps) {
    const { colors, themeScheme } = useTheme();
    const isDark = themeScheme === 'dark';

    // Derived values for progress
    const progress = useDerivedValue(() => {
        return withTiming((state.batteryLevel ?? 0) / 100, { duration: 1000 });
    }, [state.batteryLevel]);

    const animatedProps = useAnimatedProps(() => {
        const strokeDashoffset = CIRCUMFERENCE * (1 - progress.value);

        let stroke = colors.primary;
        if (state.mode === 'DC' || state.mode === 'HPC') {
            stroke = interpolateColor(
                progress.value,
                [0, 0.5, 1],
                ['#FF3B30', '#FFD60A', '#2CDD9D']
            );
        } else {
            stroke = '#4BACE4';
        }

        return {
            strokeDashoffset,
            stroke,
        };
    }, [state.mode, colors.primary]);

    const isComplete = (state.batteryLevel ?? 0) >= 100;
    const isStarting = state.isStarting;
    // Backend terminal states: COMPLETED, FAILED. Legacy 'FINISHED' is an alias of COMPLETED.
    const isCompleted = state.sessionStatus === 'COMPLETED' || state.sessionStatus === 'FINISHED';
    const isFailed = state.sessionStatus === 'FAILED' || state.isFailed;
    const isFinished = isCompleted; // legacy local alias used below
    // New active phases (WS still open):
    const isFinishingPhase = state.sessionStatus === 'FINISHING';
    const isParkingPhase = state.sessionStatus === 'PARKING';
    // Pre-FINISHING transition spinner shown right after the user taps Stop.
    const isStopping = state.isFinishing && !state.isDismissing && !isFinishingPhase && !isParkingPhase;
    const isDismissing = state.isDismissing;

    // 1s tick to refresh countdown / count-up timers while in FINISHING/PARKING.
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (!isFinishingPhase && !isParkingPhase) return;
        const id = setInterval(() => forceTick(t => (t + 1) & 0xffff), 1000);
        return () => clearInterval(id);
    }, [isFinishingPhase, isParkingPhase]);

    // FINISHING: countdown until grace_ends_at = ended_at + free_park_duration_minutes*60
    let graceRemainingSec: number | null = null;
    if (isFinishingPhase && state.endedAt && state.freeParkDurationMinutes != null) {
        const graceEndsMs = new Date(state.endedAt).getTime() + state.freeParkDurationMinutes * 60_000;
        graceRemainingSec = Math.max(0, Math.floor((graceEndsMs - Date.now()) / 1000));
    }
    const graceFreeForever = isFinishingPhase && state.parkingTariff == null;

    // PARKING: count-up + fee accrual, capped at max_price
    let parkingElapsedSec = 0;
    let parkingFee = 0;
    if (isParkingPhase && state.parkingSession) {
        const startedMs = new Date(state.parkingSession.started_at).getTime();
        parkingElapsedSec = Math.max(0, Math.floor((Date.now() - startedMs) / 1000));
        const minutes = parkingElapsedSec / 60;
        const raw = minutes * (state.parkingSession.price ?? 0);
        parkingFee = state.parkingSession.max_price != null && raw > state.parkingSession.max_price
            ? state.parkingSession.max_price
            : raw;
    }

    const formatHMS = (totalSec: number) => {
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const pad = (n: number) => n.toString().padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    };

    // ── Smooth progress bars for FINISHING / PARKING ──
    // Mirrors the widget — runs at 60fps with a linear withTiming over the full
    // remaining duration, so the bar glides instead of stepping every second.
    const finishingProgress = useSharedValue(1);
    const parkingProgress = useSharedValue(0);

    useEffect(() => {
        if (isFinishingPhase && state.endedAt && state.freeParkDurationMinutes != null && !graceFreeForever) {
            const startedMs = new Date(state.endedAt).getTime();
            const totalMs = state.freeParkDurationMinutes * 60_000;
            const elapsedMs = Date.now() - startedMs;
            const initialRatio = Math.max(0, Math.min(1, 1 - elapsedMs / totalMs));
            const remainingMs = Math.max(0, totalMs - elapsedMs);

            finishingProgress.value = initialRatio;
            if (remainingMs > 0) {
                finishingProgress.value = withTiming(0, {
                    duration: remainingMs,
                    easing: REasing.linear,
                });
            }
        } else {
            finishingProgress.value = withTiming(1, { duration: 200 });
        }
    }, [isFinishingPhase, graceFreeForever, state.endedAt, state.freeParkDurationMinutes]);

    useEffect(() => {
        const ps = state.parkingSession;
        if (isParkingPhase && ps?.started_at && ps.price && ps.max_price && ps.max_price > 0) {
            const startedMs = new Date(ps.started_at).getTime();
            const totalMs = (ps.max_price / ps.price) * 60_000;
            const elapsedMs = Math.max(0, Date.now() - startedMs);
            const initialRatio = Math.max(0, Math.min(1, elapsedMs / totalMs));
            const remainingMs = Math.max(0, totalMs - elapsedMs);

            parkingProgress.value = initialRatio;
            if (remainingMs > 0) {
                parkingProgress.value = withTiming(1, {
                    duration: remainingMs,
                    easing: REasing.linear,
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

    const finishingProgressStyle = useAnimatedStyle(() => ({ width: `${finishingProgress.value * 100}%` }));
    const parkingProgressStyle = useAnimatedStyle(() => ({ width: `${parkingProgress.value * 100}%` }));

    // Dismissing Animation Values
    const dismissBgAnim = useSharedValue(0);
    const dismissOpacityAnim = useSharedValue(1);

    useEffect(() => {
        if (isDismissing) {
            dismissBgAnim.value = withTiming(1, { duration: 600 });
            // Fade out the entire screen near the end of the 2.5s timer
            dismissOpacityAnim.value = withDelay(1800, withTiming(0, { duration: 500 }));
        } else {
            dismissBgAnim.value = 0;
            dismissOpacityAnim.value = 1;
        }
    }, [isDismissing]);

    const animatedContainerStyle = useAnimatedStyle(() => {
        const baseBg = isDark ? '#121212' : '#F2F2F7';
        return {
            backgroundColor: interpolateColor(
                dismissBgAnim.value,
                [0, 1],
                [baseBg, '#2CDD9D']
            ),
            opacity: dismissOpacityAnim.value
        };
    });

    const modeColors: Record<string, string> = {
        HPC: '#7C4DFF',
        DC: '#FF8A1F',
        AC: '#4BACE4',
    };

    return (
        <Animated.View style={[styles.container, animatedContainerStyle]}>
            <View style={{ flex: 1, paddingBottom: 40 }}>

                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerStatus}>
                        <PulseIndicator
                            isComplete={isComplete || isFinished}
                            color={isStarting ? modeColors[state.mode] : isFinished ? '#2CDD9D' : undefined}
                        />
                        <Text style={[styles.headerTitle, { color: isDismissing ? '#fff' : colors.text }]}>
                            {isDismissing
                                ? 'Şarj Başarıyla Tamamlandı'
                                : isStarting
                                    ? 'Şarj Başlatılıyor'
                                    : isFailed
                                        ? 'Şarj Başarısız'
                                        : isCompleted
                                            ? 'Şarj Tamamlandı'
                                            : isParkingPhase
                                                ? 'Ücretli Park'
                                                : isFinishingPhase
                                                    ? 'Şarj Bitti'
                                                    : isStopping
                                                        ? 'Şarj Durduruluyor'
                                                        : isComplete
                                                            ? 'Charging Complete'
                                                            : 'Charging...'
                            }
                        </Text>
                        <View style={[styles.modeBadge, { backgroundColor: isDismissing ? 'rgba(255,255,255,0.2)' : isFinished ? '#2CDD9D' : modeColors[state.mode] || '#656565' }]}>
                            <Text style={styles.modeBadgeText}>{state.mode}</Text>
                        </View>
                    </View>

                </View>

                {/* Main Content */}
                {isStarting ? (
                    /* ── Starting View ── */
                    <View style={styles.mainContent}>
                        <View style={styles.startingContainer}>
                            <View style={[styles.startingIconCircle, { borderColor: modeColors[state.mode] || colors.primary }]}>
                                <FinishingSpinner size={60} color={modeColors[state.mode] || colors.primary} />
                            </View>
                            <Text style={[styles.percentageText, { color: colors.text, fontSize: 28, marginTop: 32 }]}>
                                Şarj Oturumu Başlatılıyor...
                            </Text>
                            <Text style={[styles.powerText, { color: colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 40 }]}>
                                Lütfen bekleyin, şarj oturumunuz başlatılıyor.
                            </Text>
                            {state.chargeSessionData?.charge_area?.name && (
                                <View style={[styles.locationBadge, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }]}>
                                    <Ionicons name="location" size={16} color={modeColors[state.mode]} />
                                    <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>
                                        {state.chargeSessionData.charge_area.name}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                ) : isFinishingPhase ? (
                    /* ── FINISHING: Free-park grace countdown ── */
                    <View style={styles.mainContent}>
                        <View style={styles.finishedContainer}>
                            <View style={[styles.finishedCheckCircle, { backgroundColor: '#FFB800', shadowColor: '#FFB800' }]}>
                                <Ionicons name="hourglass-outline" size={60} color="#fff" />
                            </View>
                            <Text style={[styles.percentageText, { color: colors.text, fontSize: 40, marginTop: 24, textAlign: 'center', letterSpacing: -1, ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as any } : {}) }]}>
                                {graceFreeForever
                                    ? 'Ücretsiz Park'
                                    : graceRemainingSec != null
                                        ? formatHMS(graceRemainingSec)
                                        : '--:--'}
                            </Text>
                            {!graceFreeForever && (
                                <Text style={[styles.powerText, { color: '#FFB800', marginTop: 4, fontWeight: '700', letterSpacing: 0.4 }]}>
                                    KALAN PARK SÜRESİ
                                </Text>
                            )}

                            {/* Smooth countdown progress bar (60fps Reanimated) */}
                            {!graceFreeForever && (
                                <View style={[styles.phaseProgressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                                    <Animated.View style={[styles.phaseProgressFill, { backgroundColor: '#FFB800' }, finishingProgressStyle]} />
                                </View>
                            )}

                            <Text style={[styles.powerText, { color: colors.textSecondary, marginTop: 14, textAlign: 'center', paddingHorizontal: 30 }]}>
                                {graceFreeForever
                                    ? 'Bu istasyonda park ücreti yok. Hazır olduğunuzda kabloyu çıkarın.'
                                    : graceRemainingSec === 0
                                        ? 'Ücretsiz park süresi dolmuştur. Ücretli park moduna geçilmiştir.'
                                        : 'Ücretsiz park süresi içinde kabloyu çıkarırsanız ücretli park moduna geçilmez.'}
                            </Text>
                            {state.parkingTariff && (
                                <View style={[styles.locationBadge, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }]}>
                                    <Ionicons name="information-circle" size={16} color="#E94B2C" />
                                    <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={2}>
                                        Süre sonrası: {state.parkingTariff.price.toFixed(2)} ₺/dk
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                ) : isParkingPhase ? (
                    /* ── PARKING: Paid parking count-up + fee ── */
                    <View style={styles.mainContent}>
                        <View style={styles.finishedContainer}>
                            <View style={[styles.finishedCheckCircle, { backgroundColor: '#E94B2C', shadowColor: '#E94B2C' }]}>
                                <Ionicons name="car-sport" size={60} color="#fff" />
                            </View>

                            <Text style={[styles.percentageText, { color: colors.text, fontSize: 40, marginTop: 24, textAlign: 'center', letterSpacing: -1, ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as any } : {}) }]}>
                                {formatHMS(parkingElapsedSec)}
                            </Text>
                            <Text style={[styles.powerText, { color: '#E94B2C', marginTop: 4, fontWeight: '700', letterSpacing: 0.4 }]}>
                                ÜCRETLİ PARK
                            </Text>

                            {/* Fee accrual progress (only with cap) */}
                            {state.parkingSession?.max_price != null && state.parkingSession.max_price > 0 && (
                                <View style={[styles.phaseProgressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                                    <Animated.View style={[styles.phaseProgressFill, { backgroundColor: '#E94B2C' }, parkingProgressStyle]} />
                                </View>
                            )}

                            {/* Big fee value */}
                            <View style={styles.parkingFeeRow}>
                                <Text style={[styles.parkingFeeValue, { color: '#E94B2C', ...(Platform.OS === 'ios' ? { fontVariant: ['tabular-nums'] as any } : {}) }]}>
                                    {parkingFee.toFixed(2)} ₺
                                </Text>
                            </View>

                            <Text style={[styles.powerText, { color: colors.textSecondary, marginTop: 10, textAlign: 'center', paddingHorizontal: 30 }]}>
                                Ücretli park moduna geçildi. Aracınızı en kısa sürede çıkarınız.
                            </Text>

                            {state.parkingSession?.price != null && (
                                <View style={[styles.locationBadge, { backgroundColor: isDark ? '#1C1C1E' : '#F2F2F7' }]}>
                                    <Ionicons name="cash" size={16} color="#E94B2C" />
                                    <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>
                                        {state.parkingSession.price.toFixed(2)} ₺/dk
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>
                ) : isFailed ? (
                    /* ── FAILED: terminal error ── */
                    <View style={styles.mainContent}>
                        <View style={styles.finishedContainer}>
                            <View style={[styles.finishedCheckCircle, { backgroundColor: '#FF3B30', shadowColor: '#FF3B30' }]}>
                                <Ionicons name="close" size={60} color="#fff" />
                            </View>
                            <Text style={[styles.percentageText, { color: '#FF3B30', fontSize: 28, marginTop: 24, textAlign: 'center' }]}>
                                Şarj Başarısız
                            </Text>
                            <Text style={[styles.powerText, { color: colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 30 }]}>
                                {state.endReason || 'Şarj başlatılamadı veya bir hata oluştu.'}
                            </Text>
                        </View>
                    </View>
                ) : isFinished || isDismissing ? (
                    /* ── Finished View (Cable still plugged) or Dismissing ── */
                    <View style={styles.mainContent}>
                        <View style={styles.finishedContainer}>
                            {/* Big Green Check */}
                            <View style={[styles.finishedCheckCircle, isDismissing && { backgroundColor: '#fff', shadowColor: 'transparent' }]}>
                                <Ionicons name="checkmark" size={60} color={isDismissing ? '#2CDD9D' : '#fff'} />
                            </View>

                            <Text style={[styles.percentageText, { color: isDismissing ? '#fff' : '#2CDD9D', fontSize: 28, marginTop: 24, textAlign: 'center' }]}>
                                {isDismissing ? 'Şarj Oturumu Tamamlandı!' : 'Şarjınız Tamamlandı!'}
                            </Text>

                            {/* Final summary — total cost & energy. Pulled from
                                state.cost / state.chargedAmount which are
                                already frozen at the end-of-charge values. */}
                            {!isDismissing && (state.cost > 0 || state.chargedAmount > 0) && (
                                <View style={styles.completedSummary}>
                                    <Text style={[styles.completedSummaryAmount, { color: colors.text }]}>
                                        {state.cost.toFixed(2)} ₺
                                    </Text>
                                    <Text style={[styles.completedSummaryMeta, { color: colors.textSecondary }]}>
                                        {state.chargedAmount.toFixed(2)} kWh · {Math.floor(state.duration / 60)}m {state.duration % 60}s
                                    </Text>
                                </View>
                            )}

                            <Text style={[styles.powerText, { color: isDismissing ? 'rgba(255,255,255,0.8)' : colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 30 }]}>
                                {isDismissing ? 'Soket ayrıldı, iyi yolculuklar dileriz.' : 'Şarj başarıyla tamamlandı! İyi yolculuklar dileriz.'}
                            </Text>

                            {/* Unplug Animation Hint */}
                            {!isDismissing && (
                                <View style={styles.unplugHintContainer}>
                                    <RNAnimated.View>
                                        <Ionicons name="exit-outline" size={32} color="#2CDD9D" />
                                    </RNAnimated.View>
                                </View>
                            )}
                        </View>
                    </View>
                ) : isStopping ? (
                    /* ── Stopping/Finishing View ── */
                    <View style={styles.mainContent}>
                        <FinishingSpinner size={50} color={colors.primary} />
                        <Text style={[styles.percentageText, { color: colors.text, fontSize: 32, marginTop: 24 }]}>
                            Şarj Durduruluyor...
                        </Text>
                        <Text style={[styles.powerText, { color: colors.textSecondary }]}>
                            Lütfen bekleyin, şarj oturumunuz sonlandırılıyor.
                        </Text>
                    </View>
                ) : (
                    /* ── Normal Charging View ── */
                    <View style={styles.mainContent}>

                        {/* Circular Progress & Visual (Hide for AC) */}
                        {state.mode !== 'AC' ? (
                            <View style={styles.circleContainer}>
                                <Svg
                                    width={CIRCLE_SIZE}
                                    height={CIRCLE_SIZE}
                                    style={{ transform: [{ rotate: '-90deg' }] }}
                                >
                                    <Defs>
                                        <Mask id="dashMask">
                                            <Circle
                                                cx={CIRCLE_SIZE / 2}
                                                cy={CIRCLE_SIZE / 2}
                                                r={RADIUS}
                                                stroke="white"
                                                strokeWidth={STROKE_WIDTH}
                                                strokeDasharray="2, 4"
                                                fill="transparent"
                                            />
                                        </Mask>
                                    </Defs>

                                    {/* Track (Faint Dashes) */}
                                    <Circle
                                        cx={CIRCLE_SIZE / 2}
                                        cy={CIRCLE_SIZE / 2}
                                        r={RADIUS}
                                        stroke={isDark ? '#333' : '#E5E5EA'}
                                        strokeWidth={STROKE_WIDTH}
                                        strokeDasharray="2, 4"
                                        fill="transparent"
                                    />

                                    {/* Progress (Masked to look dashed) */}
                                    <AnimatedCircle
                                        cx={CIRCLE_SIZE / 2}
                                        cy={CIRCLE_SIZE / 2}
                                        r={RADIUS}
                                        strokeWidth={STROKE_WIDTH}
                                        strokeLinecap="butt"
                                        fill="transparent"
                                        strokeDasharray={`${CIRCUMFERENCE}`}
                                        mask="url(#dashMask)"
                                        animatedProps={animatedProps}
                                    />
                                </Svg>

                                {/* Centered Content: Car & Percentage */}
                                <View style={styles.innerCircle}>
                                    <Image
                                        source={require('@/assets/images/teslamodely.webp')}
                                        style={styles.carImage}
                                        resizeMode="contain"
                                    />
                                    <Text style={[styles.percentageText, { color: colors.text }]}>
                                        {Math.floor(state.batteryLevel ?? 0)}%
                                    </Text>
                                    <Text style={[styles.powerText, { color: colors.textSecondary }]}>
                                        {(state.power ?? 0).toFixed(1)} kW
                                    </Text>
                                </View>
                            </View>
                        ) : (
                            <View style={[styles.circleContainer, { justifyContent: 'center' }]}>
                                {/* AC Simplified Center Content */}
                                <Image
                                    source={require('@/assets/images/teslamodely.webp')}
                                    style={[styles.carImage, { transform: [{ scale: 1.2 }], marginBottom: 20 }]}
                                    resizeMode="contain"
                                />
                                <Text style={[styles.percentageText, { color: colors.text, fontSize: 32 }]}>
                                    {(state.power ?? 0).toFixed(1)} kW
                                </Text>
                                <Text style={[styles.powerText, { color: colors.textSecondary, marginTop: 8 }]}>
                                    Charging Power
                                </Text>
                            </View>
                        )}

                        {/* Battery Breakdown (DC/HPC Only) */}
                        {(state.mode === 'DC' || state.mode === 'HPC') && (
                            <View style={styles.batteryRow}>
                                <View style={styles.batteryStat}>
                                    <Text style={[styles.bLabel, { color: colors.textSecondary }]}>Start</Text>
                                    <Text style={[styles.bValue, { color: colors.text }]}>
                                        {state.startSoc != null ? `${state.startSoc}%` : '—'}
                                    </Text>
                                </View>
                                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                                <View style={styles.batteryStat}>
                                    <Text style={[styles.bLabel, { color: colors.textSecondary }]}>Current</Text>
                                    <Text style={[styles.bValue, { color: colors.text }]}>{Math.floor(state.batteryLevel ?? 0)}%</Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}

                {/* Statistics Grid — Show for charging and finished */}
                {!isStarting && !isDismissing && (
                    <View style={[styles.statsGrid, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}>

                        {/* Row 1 */}
                        <View style={styles.statRow}>
                            <View style={styles.statItem}>
                                <View style={[styles.iconBox, { backgroundColor: 'rgba(255, 214, 10, 0.15)' }]}>
                                    <Ionicons name="flash" size={20} color="#FFD60A" />
                                </View>
                                <View>
                                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Enerji</Text>
                                    <Text style={[styles.statValue, { color: colors.text }]}>{state.chargedAmount.toFixed(2)} kWh</Text>
                                </View>
                            </View>

                            <View style={styles.statItem}>
                                <View style={[styles.iconBox, { backgroundColor: 'rgba(48, 176, 199, 0.15)' }]}>
                                    <Ionicons name="wallet-outline" size={20} color="#30B0C7" />
                                </View>
                                <View>
                                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Ücret</Text>
                                    <Text style={[styles.statValue, { color: colors.text }]}>
                                        {isFinished && state.chargeSessionData?.total_price != null
                                            ? Number(state.chargeSessionData?.total_price)?.toFixed(2)
                                            : state?.cost?.toFixed(2)
                                        } ₺
                                    </Text>
                                </View>
                            </View>
                        </View>

                        {/* Row 2 */}
                        <View style={styles.statRow}>
                            <View style={styles.statItem}>
                                <View style={[styles.iconBox, { backgroundColor: 'rgba(175, 82, 222, 0.15)' }]}>
                                    <Ionicons name="time-outline" size={20} color="#AF52DE" />
                                </View>
                                <View>
                                    <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Süre</Text>
                                    <Text style={[styles.statValue, { color: colors.text }]}>
                                        {Math.floor(state.duration / 60)}m {state.duration % 60}s
                                    </Text>
                                </View>
                            </View>

                            {!isFinished && (state.mode === 'DC' || state.mode === 'HPC') ? (
                                <View style={styles.statItem}>
                                    <View style={[styles.iconBox, { backgroundColor: 'rgba(50, 215, 75, 0.15)' }]}>
                                        <MaterialCommunityIcons name="battery-charging-100" size={20} color="#32D74B" />
                                    </View>
                                    <View>
                                        <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Est. 100%</Text>
                                        <Text style={[styles.statValue, { color: colors.text }]}>
                                            {state.estTime100 ? Math.ceil(state.estTime100) + 'm' : 'Done'}
                                        </Text>
                                    </View>
                                </View>
                            ) : (
                                <View style={styles.statItem} />
                            )}
                        </View>

                    </View>
                )}

                {/* Footer Action */}
                {!isDismissing && (
                    <View style={styles.footer}>

                        <Pressable onPress={onMinimize} style={[styles.iconBtn, { backgroundColor: colors.card }]}>
                            <Ionicons name="chevron-down" size={24} color={colors.text} />
                        </Pressable>

                        {/* CHARGING: active "Şarjı Durdur" */}
                        {!isCompleted && !isFailed && !isStarting && !isStopping && !isFinishingPhase && !isParkingPhase && (
                            <Pressable
                                onPress={onStop}
                                style={({ pressed }) => [
                                    styles.stopBtn,
                                    { opacity: pressed ? 0.9 : 1 }
                                ]}
                            >
                                <Text style={styles.stopBtnText}>Şarjı Durdur</Text>
                            </Pressable>
                        )}

                        {/* FINISHING / PARKING: stop disabled, user must physically unplug */}
                        {(isFinishingPhase || isParkingPhase) && (
                            <View style={[styles.stopBtn, { backgroundColor: isDark ? '#2a2a2a' : '#E5E5EA' }]}>
                                <Text style={[styles.stopBtnText, { color: isDark ? '#999' : '#666' }]}>
                                    Kabloyu Çıkarın
                                </Text>
                            </View>
                        )}

                        {/* COMPLETED: friendly hint */}
                        {isCompleted && (
                            <View style={styles.finishedFooterBadge}>
                                <Ionicons name="information-circle" size={18} color="#2CDD9D" />
                                <Text style={[styles.finishedFooterText, { color: colors.textSecondary }]}>
                                    Soket çıkartılınca otomatik kapanacak
                                </Text>
                            </View>
                        )}
                    </View>
                )}

            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 10,
        paddingBottom: 10,
    },
    headerStatus: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
    },
    modeBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 10,
    },
    modeBadgeText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    iconBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 3,
    },
    pulseContainer: {
        width: 20,
        height: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pulseDot: {
        position: 'absolute',
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    pulseInner: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },

    // Main Content
    mainContent: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    circleContainer: {
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 20,
    },
    innerCircle: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    carImage: {
        width: CIRCLE_SIZE * 0.65,
        height: CIRCLE_SIZE * 0.4,
        marginBottom: 10,
    },
    percentageText: {
        fontSize: 42,
        fontWeight: '800',
        letterSpacing: -1,
    },
    powerText: {
        fontSize: 16,
        fontWeight: '500',
        marginTop: 4,
    },
    batteryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 40,
        paddingHorizontal: 30,
        paddingVertical: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 20,
        gap: 20,
    },
    divider: {
        width: 1,
        height: 24,
    },
    batteryStat: {
        alignItems: 'center',
        minWidth: 80,
    },
    bLabel: {
        fontSize: 13,
        marginBottom: 4,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        fontWeight: '600',
        opacity: 0.7,
    },
    bValue: {
        fontSize: 20,
        fontWeight: '700',
    },

    // Starting View
    startingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    startingIconCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 3,
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.8,
    },
    locationBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 24,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
    },
    locationText: {
        fontSize: 14,
        fontWeight: '600',
        maxWidth: 250,
    },

    // Finished View
    finishedContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
    },
    finishedCheckCircle: {
        width: 120,
        height: 120,
        borderRadius: 60,
        backgroundColor: '#2CDD9D',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#2CDD9D',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 20,
        elevation: 10,
    },
    unplugHintContainer: {
        marginTop: 32,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },

    // Stats Grid
    statsGrid: {
        marginHorizontal: 20,
        marginBottom: 20,
        borderRadius: 24,
        padding: 20,
        gap: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 5,
    },
    statRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    statItem: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    statLabel: {
        fontSize: 13,
        fontWeight: '500',
        marginBottom: 2,
    },
    statValue: {
        fontSize: 17,
        fontWeight: '700',
    },

    // Footer
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    stopBtn: {
        flex: 1,
        height: 50,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#FF3B30',
    },
    stopBtnText: {
        color: '#fff',
        fontSize: 17,
        fontWeight: '700',
    },
    finishedFooterBadge: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 50,
        borderRadius: 18,
        backgroundColor: 'rgba(44, 221, 157, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(44, 221, 157, 0.3)',
    },
    finishedFooterText: {
        fontSize: 13,
        fontWeight: '600',
    },

    // ── FINISHING / PARKING phase widgets ──
    // Fixed width derived from the central circle so the bar is always
    // clearly visible regardless of the (content-hugging) parent container.
    phaseProgressTrack: {
        marginTop: 24,
        width: CIRCLE_SIZE,
        height: 14,
        borderRadius: 8,
        overflow: 'hidden',
    },
    phaseProgressFill: {
        height: '100%',
        borderRadius: 8,
    },
    parkingFeeRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        marginTop: 14,
    },
    parkingFeeValue: {
        fontSize: 30,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    parkingFeeCap: {
        fontSize: 14,
        fontWeight: '600',
    },
    // COMPLETED state final summary (total cost + energy + duration).
    completedSummary: {
        marginTop: 18,
        alignItems: 'center',
    },
    completedSummaryAmount: {
        fontSize: 32,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    completedSummaryMeta: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 4,
        letterSpacing: 0.2,
    },
});
