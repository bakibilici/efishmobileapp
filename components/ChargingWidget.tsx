import { useTheme } from '@/context/ThemeContext';
import { ChargingState } from '@/hooks/useChargingSimulation';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import FinishingSpinner from './FinishingSpinner';

type ChargingWidgetProps = {
    state: ChargingState;
    onExpand: () => void;
};

export default function ChargingWidget({ state, onExpand }: ChargingWidgetProps) {
    const { colors, themeScheme } = useTheme();
    const isDark = themeScheme === 'dark';
    const progressAnim = useRef(new Animated.Value(state.batteryLevel ?? 0)).current;
    const entranceAnim = useRef(new Animated.Value(0)).current;

    // Entrance & Exit Animation
    useEffect(() => {
        if ((state.isFinishing && state.sessionStatus !== 'FINISHED') || state.isDismissing) {
            // Only auto-dismiss for legacy FINISHING, not for STOPPING → FINISHED flow
            // OR if we are explicitly DISMISSING (green animation complete)
            Animated.timing(entranceAnim, {
                toValue: 0,
                duration: 500,
                delay: state.isDismissing ? 2000 : 4800, // wait 2s for green animation before exit
                useNativeDriver: true,
            }).start();
        } else {
            // Animate in when active
            Animated.timing(entranceAnim, {
                toValue: 1,
                duration: 350,
                useNativeDriver: true,
            }).start();
        }
    }, [state.isFinishing, state.sessionStatus]);

    // Update progress bar smoothly
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: state.batteryLevel ?? 0,
            duration: 800,
            useNativeDriver: false,
        }).start();
    }, [state.batteryLevel]);

    const getTheme = () => {
        if (state.mode === 'AC') {
            return {
                bg: 'rgba(75, 172, 228, 0.15)',
                iconBg: '#4BACE4',
                borderColor: '#4BACE4',
                accent: '#4BACE4',
                lightningCount: 1
            };
        } else if (state.mode === 'HPC') {
            return {
                bg: 'rgba(124, 77, 255, 0.15)',
                iconBg: '#7C4DFF',
                borderColor: '#7C4DFF',
                accent: '#7C4DFF',
                lightningCount: 3
            };
        } else {
            return {
                bg: 'rgba(255, 138, 31, 0.15)',
                iconBg: '#FF8A1F',
                borderColor: '#FF8A1F',
                accent: '#FF8A1F',
                lightningCount: 2
            };
        }
    };

    const theme = getTheme();

    // Determine which overlay to show
    const showStartingOverlay = state.isStarting && !state.isFinishing;
    const showFinishedOverlay = state.sessionStatus === 'FINISHED' && !state.isFinishing && !state.isDismissing;
    const showFinishingOverlay = state.isFinishing;
    const showDismissingOverlay = state.isDismissing;

    // Add animation for DISMISSING green background
    const dismissBgAnim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        if (showDismissingOverlay) {
            Animated.timing(dismissBgAnim, {
                toValue: 1,
                duration: 400,
                useNativeDriver: false,
            }).start();
        }
    }, [showDismissingOverlay]);

    const dismissingBgColor = dismissBgAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [isDark ? 'rgba(40, 40, 40, 0.85)' : 'rgba(255, 255, 255, 0.9)', '#2CDD9D']
    });

    return (
        <Animated.View style={{
            opacity: entranceAnim,
            transform: [{
                translateY: entranceAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-15, 0]
                })
            }],
            width: '100%'
        }}>
            <Pressable
                onPress={onExpand}
                style={[
                    styles.container,
                    {
                        backgroundColor: showDismissingOverlay ? (dismissingBgColor as any) : isDark ? 'rgba(40, 40, 40, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                        borderColor: showDismissingOverlay ? '#2CDD9D' : showFinishedOverlay ? '#2CDD9D' : theme.borderColor,
                    }
                ]}
            >
                <View style={styles.blurOverlay} />

                <View style={styles.content}>
                    {/* Icon Section */}
                    <View style={[styles.iconWrapper, { backgroundColor: showFinishedOverlay ? 'rgba(44, 221, 157, 0.15)' : theme.bg }]}>
                        <View style={[styles.iconContainer, { backgroundColor: showFinishedOverlay ? '#2CDD9D' : theme.iconBg }]}>
                            {showFinishedOverlay ? (
                                <Ionicons name="checkmark" size={20} color="#fff" />
                            ) : (
                                <View style={styles.lightningWrap}>
                                    {Array.from({ length: theme.lightningCount }).map((_, idx) => (
                                        <View key={idx} style={{ marginLeft: idx > 0 ? -10 : 0, zIndex: idx }}>
                                            <Ionicons name="flash" size={16} color="#fff" />
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Info Section */}
                    <View style={styles.info}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.title, { color: showDismissingOverlay ? '#fff' : colors.text }]}>
                                {showDismissingOverlay
                                    ? 'Şarj Başarıyla Tamamlandı'
                                    : showFinishedOverlay
                                        ? 'Şarj Tamamlandı'
                                        : showStartingOverlay
                                            ? 'Şarj Başlatılıyor'
                                            : `${state.mode} Charging`
                                }
                            </Text>
                            {!showDismissingOverlay && !showFinishedOverlay && !showStartingOverlay && state.mode === 'HPC' && (
                                <View style={[styles.ultraBadge, { backgroundColor: theme.accent }]}>
                                    <Text style={styles.ultraText}>FAST</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.subtitle, { color: showDismissingOverlay ? '#fff' : showFinishedOverlay ? '#2CDD9D' : colors.textSecondary }]}>
                            {showDismissingOverlay
                                ? 'Soket ayrıldı, iyi yolculuklar!'
                                : showFinishedOverlay
                                    ? 'Soketi aracınızdan çıkartın'
                                    : showStartingOverlay
                                        ? 'Lütfen bekleyin...'
                                        : (
                                            <>
                                                <Ionicons name="time-outline" size={12} /> {Math.floor(state.duration / 60)}m {state.duration % 60}s • {state.cost.toFixed(2)} ₺
                                            </>
                                        )
                            }
                        </Text>
                    </View>

                    {/* Status Info */}
                    {!showDismissingOverlay && (
                        <View style={styles.status}>
                            {showFinishedOverlay ? (
                                <Ionicons name="checkmark-circle" size={28} color="#2CDD9D" />
                            ) : showStartingOverlay ? (
                                <FinishingSpinner size={22} color={theme.accent} />
                            ) : (
                            <>
                                {state.mode !== 'AC' && (
                                    <Text style={[styles.percent, { color: theme.accent }]}>
                                        {Math.floor(state.batteryLevel ?? 0)}%
                                    </Text>
                                )}
                                    <View style={styles.liveDot} />
                                </>
                            )}
                        </View>
                    )}
                </View>

                {/* Progress Visual (Hide for AC, Starting, Finishing, Finished, or Dismissing) */}
                {state.mode !== 'AC' && !showStartingOverlay && !showFinishingOverlay && !showFinishedOverlay && !showDismissingOverlay && (
                    <View style={styles.progressContainer}>
                        <View style={[styles.progressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]}>
                            <Animated.View
                                style={[
                                    styles.progressBarFill,
                                    {
                                        backgroundColor: theme.accent,
                                        width: progressAnim.interpolate({
                                            inputRange: [0, 100],
                                            outputRange: ['0%', '100%']
                                        })
                                    }
                                ]}
                            >
                                <View style={styles.progressShine} />
                            </Animated.View>
                        </View>
                    </View>
                )}

                {/* Starting Overlay */}
                {showStartingOverlay && (
                    <View style={[styles.finishingOverlay, { backgroundColor: isDark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]}>
                        <FinishingSpinner size={22} color={theme.accent} />
                        <Text style={[styles.title, { color: colors.text, marginLeft: 10 }]}>Şarj Başlatılıyor...</Text>
                    </View>
                )}

                {/* Finishing Overlay (STOPPING) */}
                {showFinishingOverlay && !showDismissingOverlay && (
                    <View style={[styles.finishingOverlay, { backgroundColor: isDark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]}>
                        <FinishingSpinner size={22} color={theme.accent} />
                        <Text style={[styles.title, { color: colors.text, marginLeft: 10 }]}>Şarj Durduruluyor...</Text>
                    </View>
                )}

                {/* Dismissing overlay mask to center text during exit */}
                {showDismissingOverlay && (
                    <Animated.View style={[styles.finishingOverlay, { backgroundColor: dismissingBgColor as any }]}>
                        <Ionicons name="checkmark-circle" size={28} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={[styles.title, { color: '#fff' }]}>Şarj Tamamlandı</Text>
                    </Animated.View>
                )}
            </Pressable>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 20,
        padding: 16,
        paddingBottom: 18,
        marginBottom: 16,
        borderWidth: 1,
        overflow: 'hidden',
        ...Platform.select({
            ios: {
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.1,
                shadowRadius: 16,
            },
            android: {
                elevation: 6,
            }
        }),
    },
    blurOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    iconWrapper: {
        width: 52,
        height: 52,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    iconContainer: {
        width: 38,
        height: 38,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
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
        fontWeight: '800',
        fontSize: 16,
        letterSpacing: -0.3,
    },
    ultraBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    ultraText: {
        color: '#fff',
        fontSize: 9,
        fontWeight: '900',
    },
    subtitle: {
        fontSize: 13,
        fontWeight: '600',
        marginTop: 2,
        opacity: 0.8,
    },
    status: {
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    percent: {
        fontWeight: '900',
        fontSize: 24,
        letterSpacing: -1,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#2CDD9D',
        marginTop: 4,
    },
    progressContainer: {
        width: '100%',
    },
    progressBarBg: {
        height: 6,
        borderRadius: 3,
        width: '100%',
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 5,
        justifyContent: 'center',
    },
    progressShine: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255,255,255,0.2)',
        width: '30%',
        transform: [{ skewX: '-20deg' }],
    },
    finishingOverlay: {
        ...StyleSheet.absoluteFillObject,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
    }
});
