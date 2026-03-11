import { useTheme } from '@/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';

type FinishingSpinnerProps = {
    size?: number;
    color?: string;
};

export default function FinishingSpinner({ size = 28, color }: FinishingSpinnerProps) {
    const { colors } = useTheme();
    const spinAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    const iconColor = color || colors.primary;

    useEffect(() => {
        // Continuous rotation for outer dashed ring
        Animated.loop(
            Animated.timing(spinAnim, {
                toValue: 1,
                duration: 2000,
                easing: Easing.linear,
                useNativeDriver: true,
            })
        ).start();

        // Pulsing animation for inner bolt
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.4,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                })
            ])
        ).start();
    }, [pulseAnim, spinAnim]);

    const spin = spinAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg']
    });

    return (
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            {/* Outer dashed spinning ring */}
            <Animated.View style={{
                position: 'absolute',
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 2,
                borderColor: iconColor,
                borderStyle: 'dashed',
                opacity: 0.5,
                transform: [{ rotate: spin }]
            }} />

            {/* Inner pulsing bolt */}
            <Animated.View style={{
                transform: [{ scale: pulseAnim }],
                opacity: pulseAnim
            }}>
                <Ionicons name="flash" size={Math.round(size * 0.55)} color={iconColor} />
            </Animated.View>
        </View>
    );
}
