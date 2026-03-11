import { useTheme } from '@/context/ThemeContext';
import LottieView from 'lottie-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type SocketChargeErrorModalProps = {
    visible: boolean;
    onClose: () => void;
};

export default function SocketChargeErrorModal({ visible, onClose }: SocketChargeErrorModalProps) {
    const { colors, themeScheme } = useTheme();
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (visible) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 300,
                useNativeDriver: true,
            }).start();
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    if (!visible) return null;

    return (
        <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
            <View style={styles.overlay}>
                <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />

                <Animated.View style={[
                    styles.content,
                    {
                        backgroundColor: colors.card,
                        opacity: fadeAnim,
                        transform: [{ scale: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }]
                    }
                ]}>
                    <View style={styles.lottieContainer}>
                        <LottieView
                            source={require('@/assets/lotties/cardriving.json')}
                            autoPlay
                            loop
                            style={styles.lottie}
                        />
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>Something went wrong!</Text>
                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        An error occurred during the charging session. Please unplug the connector and try again or contact support if the issue persists.
                    </Text>
                    <View style={{ flexDirection: "row" }}>
                        <Pressable
                            style={({ pressed }) => [
                                styles.button,
                                { width: "100%", backgroundColor: '#FF3B30' },
                                pressed && { opacity: 0.8 }
                            ]}
                            onPress={onClose}
                        >
                            <Text style={styles.secondaryButtonText}>Close</Text>
                        </Pressable>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    content: {
        width: '100%',
        borderRadius: 24,
        padding: 24,
        alignItems: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.2,
        shadowRadius: 20,
        elevation: 10,
    },
    lottieContainer: {
        width: 325,
        height: 250,
        marginBottom: 16,
    },
    lottie: {
        width: '100%',
        height: '100%',
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        marginBottom: 8,
        textAlign: 'center',
    },
    description: {
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    buttonStack: {
        width: '100%',
        gap: 12,
    },
    button: {
        height: 52,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
});
