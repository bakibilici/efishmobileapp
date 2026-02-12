import { CardType } from '@/context/payment/PaymentContext';
import { useTheme } from '@/context/ThemeContext';
import { FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect } from 'react';
import { Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withSpring
} from 'react-native-reanimated';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - 40;
const CARD_HEIGHT = CARD_WIDTH * 0.63; // Credit card aspect ratio

interface CreditCardProps {
    holderName: string;
    number: string;
    expiry: string;
    cvc: string;
    type: CardType;
    flipped: boolean;
}

export const CreditCard = ({
    holderName,
    number,
    expiry,
    cvc,
    type,
    flipped
}: CreditCardProps) => {
    const { colors } = useTheme();
    const rotate = useSharedValue(0);

    useEffect(() => {
        rotate.value = withSpring(flipped ? 180 : 0, { damping: 12, stiffness: 90 });
    }, [flipped]);

    const frontAnimatedStyle = useAnimatedStyle(() => {
        const rotateValue = interpolate(rotate.value, [0, 180], [0, 180]);
        return {
            transform: [
                { perspective: 1000 },
                { rotateY: `${rotateValue}deg` }
            ],
            opacity: rotate.value < 90 ? 1 : 0,
            zIndex: rotate.value < 90 ? 1 : 0,
        };
    });

    const backAnimatedStyle = useAnimatedStyle(() => {
        const rotateValue = interpolate(rotate.value, [0, 180], [180, 360]);
        return {
            transform: [
                { perspective: 1000 },
                { rotateY: `${rotateValue}deg` }
            ],
            opacity: rotate.value > 90 ? 1 : 0,
            zIndex: rotate.value > 90 ? 1 : 0,
        };
    });

    const getCardIcon = () => {
        switch (type) {
            case 'visa': return <FontAwesome5 name="cc-visa" size={40} color="#fff" />;
            case 'mastercard': return <FontAwesome5 name="cc-mastercard" size={40} color="#fff" />;
            case 'amex': return <FontAwesome5 name="cc-amex" size={40} color="#fff" />;
            case 'discover': return <FontAwesome5 name="cc-discover" size={40} color="#fff" />;
            default: return <MaterialCommunityIcons name="credit-card-chip-outline" size={40} color="#fff" />;
        }
    };

    const formatNumber = (num: string) => {
        // Show placeholders if empty
        if (!num) return '#### #### #### ####';
        // Add spaces every 4 digits
        return num.replace(/\s?/g, '').replace(/(\d{4})/g, '$1 ').trim();
    };

    return (
        <View style={styles.container}>
            {/* Front */}
            <Animated.View style={[styles.card, styles.cardFront, frontAnimatedStyle]}>
                <LinearGradient
                    colors={[colors.primary, '#1a9f70', '#0f5f43']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradient}
                >
                    <View style={styles.cardHeader}>
                        <MaterialCommunityIcons name="integrated-circuit-chip" size={40} color="#FFD700" />
                        {getCardIcon()}
                    </View>

                    <View style={styles.cardNumberContainer}>
                        <Text style={styles.cardNumber}>{formatNumber(number)}</Text>
                    </View>

                    <View style={styles.cardFooter}>
                        <View>
                            <Text style={styles.label}>Card Holder</Text>
                            <Text style={styles.value}>{holderName.toUpperCase() || 'YOUR NAME'}</Text>
                        </View>
                        <View>
                            <Text style={styles.label}>Expires</Text>
                            <Text style={styles.value}>{expiry || 'MM/YY'}</Text>
                        </View>
                    </View>
                </LinearGradient>
            </Animated.View>

            {/* Back */}
            <Animated.View style={[styles.card, styles.cardBack, backAnimatedStyle]}>
                <LinearGradient
                    colors={[colors.primary, '#1a9f70', '#0f5f43']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.gradient}
                >
                    <View style={styles.magneticStrip} />

                    <View style={styles.cvcContainer}>
                        <Text style={styles.cvcLabel}>CVC</Text>
                        <View style={styles.cvcBox}>
                            <Text style={styles.cvcText}>{cvc}</Text>
                        </View>
                    </View>

                    <View style={styles.backFooter}>
                        {getCardIcon()}
                    </View>
                </LinearGradient>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1,
    },
    card: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: 16,
        backfaceVisibility: 'hidden', // Crucial for flip effect on simple views, but we handle via opacity too
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 10,
        },
        shadowOpacity: 0.3,
        shadowRadius: 20,
        elevation: 10,
    },
    cardFront: {
        // 
    },
    cardBack: {
        // 
    },
    gradient: {
        flex: 1,
        borderRadius: 16,
        padding: 24,
        justifyContent: 'space-between',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cardNumberContainer: {
        marginTop: 10,
    },
    cardNumber: {
        color: '#fff',
        fontSize: 22,
        fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
        fontWeight: 'bold',
        letterSpacing: 2,
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 1, height: 1 },
        textShadowRadius: 2,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    label: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 10,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    value: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    magneticStrip: {
        backgroundColor: '#000',
        height: 40,
        marginHorizontal: -24,
        marginTop: 10,
        opacity: 0.8,
    },
    cvcContainer: {
        marginTop: 20,
        alignItems: 'flex-end',
    },
    cvcLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 10,
        marginRight: 4,
        marginBottom: 4,
    },
    cvcBox: {
        backgroundColor: '#fff',
        width: '100%',
        height: 40,
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingRight: 10,
        borderRadius: 4,
    },
    cvcText: {
        color: '#000',
        fontSize: 16,
        fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
        fontWeight: 'bold',
    },
    backFooter: {
        alignItems: 'flex-end',
        marginTop: 'auto',
    },
});
