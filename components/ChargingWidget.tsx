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
    const progressAnim = useRef(new Animated.Value(state.batteryLevel)).current;
    const entranceAnim = useRef(new Animated.Value(0)).current;

    // Entrance & Exit Animation
    useEffect(() => {
        if (state.isFinishing) {
            // Wait 5 seconds to show finishing, then animate out for 500ms
            Animated.timing(entranceAnim, {
                toValue: 0,
                duration: 500,
                delay: 4800,
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
    }, [state.isFinishing]);

    // Update progress bar smoothly
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: state.batteryLevel,
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
                        backgroundColor: isDark ? 'rgba(40, 40, 40, 0.85)' : 'rgba(255, 255, 255, 0.9)',
                        borderColor: theme.borderColor,
                    }
                ]}
            >
                <View style={styles.blurOverlay} />

                <View style={styles.content}>
                    {/* Icon Section */}
                    <View style={[styles.iconWrapper, { backgroundColor: theme.bg }]}>
                        <View style={[styles.iconContainer, { backgroundColor: theme.iconBg }]}>
                            <View style={styles.lightningWrap}>
                                {Array.from({ length: theme.lightningCount }).map((_, idx) => (
                                    <View key={idx} style={{ marginLeft: idx > 0 ? -10 : 0, zIndex: idx }}>
                                        <Ionicons name="flash" size={16} color="#fff" />
                                    </View>
                                ))}
                            </View>
                        </View>
                    </View>

                    {/* Info Section */}
                    <View style={styles.info}>
                        <View style={styles.titleRow}>
                            <Text style={[styles.title, { color: colors.text }]}>
                                {state.mode} Charging
                            </Text>
                            {state.mode === 'HPC' && (
                                <View style={[styles.ultraBadge, { backgroundColor: theme.accent }]}>
                                    <Text style={styles.ultraText}>FAST</Text>
                                </View>
                            )}
                        </View>
                        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            <Ionicons name="time-outline" size={12} /> {Math.floor(state.duration / 60)}m {state.duration % 60}s • {state.cost.toFixed(2)} ₺
                        </Text>
                    </View>

                    {/* Status Info (Hide percentage for AC) */}
                    <View style={styles.status}>
                        {state.mode !== 'AC' && (
                            <Text style={[styles.percent, { color: theme.accent }]}>
                                {Math.floor(state.batteryLevel)}%
                            </Text>
                        )}
                        <View style={styles.liveDot} />
                    </View>
                </View>

                {/* Progress Visual (Hide for AC or Finishing) */}
                {state.mode !== 'AC' && !state.isFinishing && (
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

                {/* Finishing Overlay */}
                {state.isFinishing && (
                    <View style={[styles.finishingOverlay, { backgroundColor: isDark ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)' }]}>
                        <FinishingSpinner size={22} color={theme.accent} />
                        <Text style={[styles.title, { color: colors.text, marginLeft: 10 }]}>Finishing Charge Session...</Text>
                    </View>
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
        height: 6, // Thinner, sharper
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
