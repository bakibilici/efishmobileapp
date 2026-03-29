import { useTheme } from '@/context/ThemeContext';
import { ChargingState } from '@/hooks/useChargingSimulation';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
    interpolateColor,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming
} from 'react-native-reanimated';
import FinishingSpinner from './FinishingSpinner';

type ChargingWidgetProps = {
    state: ChargingState;
    onExpand: () => void;
};

export default function ChargingWidget({ state, onExpand }: ChargingWidgetProps) {
    const { colors, themeScheme } = useTheme();
    const isDark = themeScheme === 'dark';

    // UI States
    const showStartingOverlay = state.isStarting && !state.isFinishing;
    const showFinishedOverlay = state.sessionStatus === 'FINISHED' && !state.isFinishing && !state.isDismissing;
    const showFinishingOverlay = state.isFinishing;
    const showDismissingOverlay = state.isDismissing;
    const isActivelyCharging = state.isActive && !showStartingOverlay && !showFinishingOverlay && !showFinishedOverlay && !showDismissingOverlay;

    // Derived Status for transitions
    const [displayState, setDisplayState] = useState(state);
    const contentOpacity = useSharedValue(1);

    // Fade out -> Change Data -> Fade in
    useEffect(() => {
        const hasStateChanged =
            state.isStarting !== displayState.isStarting ||
            state.isFinishing !== displayState.isFinishing ||
            state.isDismissing !== displayState.isDismissing ||
            state.sessionStatus !== displayState.sessionStatus ||
            state.mode !== displayState.mode;

        if (hasStateChanged) {
            contentOpacity.value = withTiming(0, { duration: 200 }, () => {
                runOnJS(setDisplayState)(state);
                contentOpacity.value = withTiming(1, { duration: 300 });
            });
        }
    }, [state.isStarting, state.isFinishing, state.isDismissing, state.sessionStatus, state.mode]);

    // Theme Colors (Solid)
    const getTheme = (mode: string) => {
        if (mode === 'AC') {
            return {
                bg: '#4BACE4',
                borderColor: '#4BACE4',
                accent: '#4BACE4',
                lightningCount: 1
            };
        } else if (mode === 'HPC') {
            return {
                bg: '#7C4DFF',
                borderColor: '#7C4DFF',
                accent: '#7C4DFF',
                lightningCount: 3
            };
        } else {
            return {
                bg: '#FF8A1F',
                borderColor: '#FF8A1F',
                accent: '#FF8A1F',
                lightningCount: 2
            };
        }
    };

    const theme = getTheme(state.mode);
    const displayTheme = getTheme(displayState.mode);

    // Reanimated Values
    const entranceAnim = useSharedValue(0);
    const dismissBgAnim = useSharedValue(0);
    const batteryValue = useSharedValue(state.batteryLevel ?? 0);

    // Entrance & Exit Animation
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
        if (showDismissingOverlay) {
            dismissBgAnim.value = withTiming(1, { duration: 400 });
        } else {
            dismissBgAnim.value = 0;
        }
    }, [showDismissingOverlay]);

    useEffect(() => {
        batteryValue.value = withTiming(state.batteryLevel ?? 0, { duration: 800 });
    }, [state.batteryLevel]);

    const animatedContainerStyle = useAnimatedStyle(() => {
        const normalBg = isDark ? '#1C1C1E' : '#FFFFFF';
        const activeAccentBg = showStartingOverlay || showFinishingOverlay ? theme.bg : normalBg;

        const finalBg = interpolateColor(
            dismissBgAnim.value,
            [0, 1],
            [activeAccentBg, '#2CDD9D']
        );

        return {
            opacity: entranceAnim.value,
            transform: [{ translateY: (1 - entranceAnim.value) * -12 }],
            backgroundColor: finalBg,
            borderColor: showDismissingOverlay || showFinishedOverlay ? '#2CDD9D' : showStartingOverlay || showFinishingOverlay ? theme.borderColor : isDark ? '#3A3A3C' : '#E5E5E7',
            height: withTiming(
                showStartingOverlay || showFinishingOverlay || state.mode === 'AC' || showFinishedOverlay || showDismissingOverlay ? 84 : 116,
                { duration: 400 }
            ),
        };
    });

    const animatedContentStyle = useAnimatedStyle(() => {
        return {
            opacity: contentOpacity.value,
        };
    });

    const progressStyle = useAnimatedStyle(() => {
        return {
            width: `${batteryValue.value}%`,
        };
    });

    // Helper to get text color based on background
    const getTextStyle = (isSubtitle = false): any => {
        const isAccentBg = showStartingOverlay || showFinishingOverlay || showDismissingOverlay;

        if (isAccentBg) {
            return {
                color: '#FFFFFF',
                opacity: isSubtitle ? 0.85 : 1,
            };
        }

        if (showFinishedOverlay) {
            return {
                color: isSubtitle ? '#2CDD9D' : colors.text,
                opacity: 1,
                fontWeight: isSubtitle ? '600' : '900',
            };
        }

        return {
            color: isSubtitle ? colors.textSecondary : colors.text,
            fontWeight: isSubtitle ? '600' : '900',
        };
    };

    return (
        <Animated.View style={[styles.wrapper, animatedContainerStyle]}>
            <Pressable onPress={onExpand} style={styles.pressable}>
                <Animated.View style={[styles.content, animatedContentStyle]}>
                    {/* Unified Circle Icon */}
                    <View style={[
                        styles.iconCircle,
                        { backgroundColor: displayState.isDismissing || (displayState.sessionStatus === 'FINISHED' && !displayState.isFinishing) ? '#2CDD9D' : displayTheme.bg }
                    ]}>
                        {displayState.sessionStatus === 'FINISHED' || displayState.isDismissing ? (
                            <Ionicons name="checkmark" size={28} color="#fff" />
                        ) : (
                            <View style={styles.lightningWrap}>
                                {Array.from({ length: displayTheme.lightningCount }).map((_, idx) => (
                                    <View key={idx} style={{ marginLeft: idx > 0 ? -12 : 0 }}>
                                        <Ionicons name="flash" size={24} color="#fff" />
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>

                    {/* Info Section */}
                    <View style={styles.info}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.title, getTextStyle()]}>
                                {displayState.isDismissing
                                    ? 'Şarj Başarıyla Tamamlandı'
                                    : displayState.sessionStatus === 'FINISHED'
                                        ? 'Şarj Tamamlandı'
                                        : displayState.isStarting
                                            ? 'Şarj Başlatılıyor'
                                            : displayState.isFinishing
                                                ? 'Şarj Durduruluyor'
                                                : `${displayState.mode} Charging`
                                }
                            </Text>
                            {!displayState.isDismissing && displayState.sessionStatus !== 'FINISHED' && !displayState.isStarting && !displayState.isFinishing && displayState.mode === 'HPC' && (
                                <View style={[styles.ultraBadge, { backgroundColor: displayTheme.accent }]}>
                                    <Text style={styles.ultraText}>FAST</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.subtitle, getTextStyle(true)]}>
                            {displayState.isDismissing
                                ? 'Soket ayrıldı, iyi yolculuklar!'
                                : displayState.sessionStatus === 'FINISHED'
                                    ? 'Soketi aracınızdan çıkartın'
                                    : displayState.isStarting || displayState.isFinishing
                                        ? 'Lütfen bekleyin...'
                                        : (
                                            <>
                                                <Ionicons name="time-outline" size={13} /> {Math.floor(displayState.duration / 60)}m {displayState.duration % 60}s • {displayState.cost.toFixed(2)} ₺
                                            </>
                                        )
                            }
                        </Text>
                    </View>

                    {/* Status Info (Right Side) */}
                    <View style={styles.status}>
                        {displayState.sessionStatus === 'FINISHED' || displayState.isDismissing ? (
                            <Ionicons name="checkmark-circle" size={32} color={displayState.isDismissing ? "#fff" : "#2CDD9D"} />
                        ) : displayState.isStarting || displayState.isFinishing ? (
                            <FinishingSpinner size={24} color="#FFFFFF" />
                        ) : (
                            <View style={styles.percentageColumn}>
                                {displayState.mode !== 'AC' && (
                                    <Text style={[styles.percent, { color: displayTheme.accent }]}>
                                        {Math.floor(displayState.batteryLevel ?? 0)}%
                                    </Text>
                                )}
                                <View style={styles.liveDot} />
                            </View>
                        )}
                    </View>
                </Animated.View>

                {/* Progress Visual (Only for DC/HPC in charging state) */}
                {isActivelyCharging && state.mode !== 'AC' && (
                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                            <Animated.View
                                style={[
                                    styles.progressBarFill,
                                    { backgroundColor: theme.accent },
                                    progressStyle
                                ]}
                            >
                                <View style={styles.progressShine} />
                            </Animated.View>
                        </View>
                    </View>
                )}
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
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 16 },
                shadowOpacity: 0.2,
                shadowRadius: 24,
            },
            android: {
                elevation: 16,
            }
        }),
    },
    pressable: {
        width: '100%',
        height: '100%',
        padding: 18,
        justifyContent: 'center',
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconCircle: {
        width: 50,
        height: 50,
        borderRadius: 18, // Perfect Circle
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 18,
    },
    lightningWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    info: {
        flex: 1,
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
        fontSize: 14,
        fontWeight: '700',
        marginTop: 4,
    },
    status: {
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    percentageColumn: {
        alignItems: 'center',
    },
    percent: {
        fontWeight: '900',
        fontSize: 24,
        letterSpacing: -0.6,
    },
    liveDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#2CDD9D',
        marginTop: 6,
    },
    progressContainer: {
        width: '100%',
        marginTop: 16,
    },
    progressBarBg: {
        height: 10,
        borderRadius: 5,
        width: '100%',
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
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
