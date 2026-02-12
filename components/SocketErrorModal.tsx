import { useTheme } from '@/context/ThemeContext';
import LottieView from 'lottie-react-native';
import React, { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

type SocketErrorModalProps = {
    visible: boolean;
    onClose: () => void;
    onRetry: () => void;
    onRepair: () => void;
};

export default function SocketErrorModal({ visible, onClose, onRetry, onRepair }: SocketErrorModalProps) {
    const { colors, themeScheme } = useTheme();
    const isDark = themeScheme === 'dark';
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
                            source={require('@/assets/lotties/Chademo.json')}
                            autoPlay
                            loop
                            style={styles.lottie}
                        />
                    </View>

                    <Text style={[styles.title, { color: colors.text }]}>Socket not plugged!</Text>
                    <Text style={[styles.description, { color: colors.textSecondary }]}>
                        Please ensure the socket is firmly connected to your vehicle before starting the session.
                    </Text>
                    <View style={{ flexDirection: "row" }}><Pressable
                        style={({ pressed }) => [
                            styles.button,
                            { width: "100%", backgroundColor: '#FF3B30' }, // Red for Cancel
                            pressed && { opacity: 0.8 }
                        ]}
                        onPress={onClose}
                    >
                        <Text style={styles.secondaryButtonText}>Close</Text>
                    </Pressable></View>

                    { /*<Pressable
                            style={({ pressed }) => [
                                styles.button,
                                styles.retryButton,
                                { backgroundColor: colors.primary },
                                pressed && { opacity: 0.9 }
                            ]}
                            onPress={onRetry}
                        >
                            <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
                            <Text style={styles.retryButtonText}>Retry</Text>
                        </Pressable>*/}



                    {/*<Pressable
                                style={({ pressed }) => [
                                    styles.button,
                                    { flex: 1, backgroundColor: '#10294f' }, // Navy for Repair
                                    pressed && { opacity: 0.8 }
                                ]}
                                onPress={onRepair}
                            >
                                <Text style={styles.secondaryButtonText}>Repair Manually</Text>
                            </Pressable>*/}
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
        width: 150,
        height: 150,
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
    retryButton: {
        // primary color
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    retryButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    secondaryButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#fff',
    },
    cancelText: {
        fontSize: 15,
        fontWeight: '600',
    }
});
