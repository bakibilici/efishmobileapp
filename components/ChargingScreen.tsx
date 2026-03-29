import { useTheme } from '@/context/ThemeContext';
import { ChargingMode, ChargingState } from '@/hooks/useChargingSimulation';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Dimensions, Easing, Image, Pressable, Animated as RNAnimated, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedProps, useDerivedValue, withTiming, useSharedValue, useAnimatedStyle, withDelay } from 'react-native-reanimated';
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
    const isFinished = state.sessionStatus === 'FINISHED';
    const isStopping = state.isFinishing && !state.isDismissing;
    const isDismissing = state.isDismissing;

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
        return {
            backgroundColor: interpolateColor(
                dismissBgAnim.value,
                [0, 1],
                ['transparent', '#2CDD9D']
            ),
            opacity: dismissOpacityAnim.value
        };
    });

    const modeColors: Record<string, string> = {
        HPC: '#7C4DFF',
        DC: '#FF8A1F',
        AC: '#4BACE4',
    };

    // Format duration for finished summary
    const formatDuration = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) return `${hours}s ${mins}dk`;
        return `${mins}dk ${secs}sn`;
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
                                    : isFinished
                                    ? 'Şarj Tamamlandı'
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

                            <Text style={[styles.powerText, { color: isDismissing ? 'rgba(255,255,255,0.8)' : colors.textSecondary, marginTop: 8, textAlign: 'center', paddingHorizontal: 30 }]}>
                                {isDismissing ? 'Soket ayrıldı, iyi yolculuklar dileriz.' : 'Lütfen şarj soketini aracınızdan çıkartın.'}
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
                                        {state.power} kW
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
                                    {state.power} kW
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
                                            ? state.chargeSessionData.total_price.toFixed(2)
                                            : state.cost.toFixed(2)
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

                    {!isFinished && !isStarting && !isStopping && (
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

                    {isFinished && (
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
});
