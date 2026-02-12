import { useTheme } from '@/context/ThemeContext';
import { ChargingState } from '@/hooks/useChargingSimulation';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

type ChargingWidgetProps = {
    state: ChargingState;
    onExpand: () => void;
};

export default function ChargingWidget({ state, onExpand }: ChargingWidgetProps) {
    const { colors } = useTheme();
    const progressAnim = useRef(new Animated.Value(state.batteryLevel)).current; // For smooth bar

    // Update progress bar smoothly when battery changes
    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: state.batteryLevel,
            duration: 500,
            useNativeDriver: false, // width property
        }).start();
    }, [state.batteryLevel]);

    const isHPC = state.mode === 'HPC';
    // const isDC = state.mode === 'DC'; // not strictly needed if we check isHPC inside getTheme else-if

    const getTheme = () => {
        if (state.mode === 'AC') {
            return {
                bg: 'rgba(75, 172, 228, 0.15)', // AC Blue #4BACE4
                iconBg: '#4BACE4',
                iconColor: '#fff',
                borderColor: '#4BACE4',
                accent: '#4BACE4',
                lightningCount: 1
            };
        } else if (isHPC) {
            return {
                bg: 'rgba(124, 77, 255, 0.15)', // HPC Purple #7C4DFF (Matches Filter Chip)
                iconBg: '#7C4DFF',
                iconColor: '#fff',
                borderColor: '#7C4DFF',
                accent: '#7C4DFF',
                lightningCount: 3
            };
        } else { // Standard DC
            return {
                bg: 'rgba(255, 138, 31, 0.15)', // DC Orange #FF8A1F (Matches Filter Chip)
                iconBg: '#FF8A1F',
                iconColor: '#fff',
                borderColor: '#FF8A1F',
                accent: '#FF8A1F',
                lightningCount: 2
            };
        }
    };

    const theme = getTheme();

    return (
        <Pressable
            onPress={onExpand}
            style={[
                styles.container,
                {
                    backgroundColor: colors.card, // Main card bg (white/dark)
                    borderColor: theme.borderColor,
                    borderWidth: 0.5,
                }
            ]}
        >
            <View style={styles.content}>
                {/* Icon Box */}
                <View style={[styles.iconContainer, { backgroundColor: theme.iconBg }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                        {Array.from({ length: theme.lightningCount }).map((_, idx) => (
                            <View key={idx} style={{ marginLeft: idx > 0 ? -12 : 0, zIndex: idx }}>
                                <Ionicons name="flash" size={18} color={theme.iconColor} />
                            </View>
                        ))}
                    </View>
                </View>

                {/* Info */}
                <View style={styles.info}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[styles.title, { color: colors.text }]}>
                            {state.mode} Charging
                        </Text>
                        {isHPC && (
                            <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                                <Text style={styles.badgeText}>HPC</Text>
                            </View>
                        )}
                    </View>
                    <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                        {Math.floor(state.duration / 60)}m {state.duration % 60}s • {state.cost.toFixed(2)} ₺
                    </Text>
                </View>

                {/* Percentage */}
                <View style={styles.status}>
                    <Text style={[styles.percent, { color: theme.accent }]}>
                        {Math.floor(state.batteryLevel)}%
                    </Text>
                </View>
            </View>

            {/* Progress Bar Background */}
            <View style={[styles.progressBarBg, { backgroundColor: colors.backgroundSecondary }]}>
                {/* Active Progress */}
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
                />
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        borderRadius: 20, // More rounded modern look
        marginBottom: 20,
        paddingVertical: 14,
        paddingHorizontal: 20,
        // Softer shadow
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.1,
        shadowRadius: 16,
        elevation: 10,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 99, // circle
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    info: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontWeight: '700',
        fontSize: 17,
        letterSpacing: -0.5,
    },
    badge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    badgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
    },
    subtitle: {
        fontSize: 14,
        fontWeight: '500',
        marginTop: 2,
    },
    status: {
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    percent: {
        fontWeight: '800',
        fontSize: 22,
        letterSpacing: -1,
    },
    progressBarBg: {
        height: 8,
        borderRadius: 4,
        width: '100%',
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        borderRadius: 4,
    }
});
