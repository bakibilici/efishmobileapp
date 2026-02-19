import { useTheme } from "@/context/ThemeContext";
import { PaymentCard, usePayment } from "@/context/payment/PaymentContext";
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import React from "react";
import {
    Alert,
    LayoutAnimation,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    UIManager,
    View
} from "react-native";
import Animated, {
    LinearTransition,
    interpolateColor,
    useAnimatedStyle,
    useDerivedValue,
    withTiming
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedText = Animated.createAnimatedComponent(Text);
const AnimatedView = Animated.createAnimatedComponent(View);
// Casting to any to avoid strict prop typing issues with Animated.createAnimatedComponent and vector-icons
const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons) as any;
const AnimatedFontAwesome5 = Animated.createAnimatedComponent(FontAwesome5) as any;
const AnimatedMaterialCommunityIcons = Animated.createAnimatedComponent(MaterialCommunityIcons) as any;

if (Platform.OS === 'android') {
    if (UIManager.setLayoutAnimationEnabledExperimental) {
        UIManager.setLayoutAnimationEnabledExperimental(true);
    }
}

export default function PaymentMethodsScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { cards, removeCard, setDefaultCard } = usePayment();

    const sortedCards = React.useMemo(() => {
        return [...cards].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
    }, [cards]);

    const handleSetDefault = async (id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        await setDefaultCard(id);
    };

    const handleRemove = (id: string) => {
        Alert.alert(
            "Remove Card",
            "Are you sure you want to remove this card?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Remove", style: "destructive", onPress: () => removeCard(id) }
            ]
        );
    };

    return (
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
            <Stack.Screen
                options={{
                    headerTitle: "Payment Methods",
                    headerStyle: { backgroundColor: colors.background },
                    headerTintColor: colors.text,
                    headerShadowVisible: false,
                }}
            />

            <View style={styles.content}>
                <Animated.FlatList
                    data={sortedCards}
                    renderItem={({ item }) => (
                        <CardItem
                            item={item}
                            colors={colors}
                            onSetDefault={handleSetDefault}
                            onRemove={handleRemove}
                        />
                    )}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
                    itemLayoutAnimation={LinearTransition}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="wallet-outline" size={64} color={colors.textTertiary} />
                            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                                No payment methods added yet.
                            </Text>
                        </View>
                    }
                />

                <Pressable
                    style={[styles.addButton, { shadowColor: colors.primary }]}
                    onPress={() => router.push("/payment-methods/add")}
                >
                    <LinearGradient
                        colors={[colors.primary, '#1a9f70']}
                        style={styles.gradientButton}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                    >
                        <Ionicons name="add" size={24} color="#fff" />
                        <Text style={styles.addButtonText}>Add New Card</Text>
                    </LinearGradient>
                </Pressable>
            </View>
        </SafeAreaView>
    );
}

const CardItem = ({
    item,
    colors,
    onSetDefault,
    onRemove
}: {
    item: PaymentCard,
    colors: any,
    onSetDefault: (id: string) => void,
    onRemove: (id: string) => void
}) => {
    const isDefault = item.isDefault;
    const progress = useDerivedValue(() => {
        return withTiming(isDefault ? 1 : 0, { duration: 300 });
    }, [isDefault]);

    const containerStyle = useAnimatedStyle(() => {
        const backgroundColor = interpolateColor(
            progress.value,
            [0, 1],
            [colors.card, colors.primary]
        );
        const borderColor = interpolateColor(
            progress.value,
            [0, 1],
            [colors.border, colors.primary]
        );
        return { backgroundColor, borderColor };
    });

    const textStyle = useAnimatedStyle(() => {
        const color = interpolateColor(
            progress.value,
            [0, 1],
            [colors.text, '#ffffff']
        );
        return { color };
    });

    const subTextStyle = useAnimatedStyle(() => {
        const color = interpolateColor(
            progress.value,
            [0, 1],
            [colors.textSecondary, 'rgba(255,255,255,0.8)']
        );
        return { color };
    });

    const iconContainerStyle = useAnimatedStyle(() => {
        const backgroundColor = interpolateColor(
            progress.value,
            [0, 1],
            [colors.backgroundSecondary, 'rgba(255,255,255,0.2)']
        );
        return { backgroundColor };
    });

    const iconStyle = useAnimatedStyle(() => {
        const color = interpolateColor(
            progress.value,
            [0, 1],
            [colors.text, '#ffffff']
        );
        return { color };
    });

    // Icon component that accepts animated props
    const CardIcon = () => {
        const iconProps = { size: 24, style: iconStyle };
        // We need to pass the animated style to the icon directly
        // Since we can't easily conditionally render animated components with animated props inside logic nicely,
        // we'll use a slightly different approach or just render specific ones.
        // Actually, easiest is to use the Animated components created above.

        switch (item.type) {
            case 'visa': return <AnimatedFontAwesome5 name="cc-visa" size={24} style={iconStyle} />;
            case 'mastercard': return <AnimatedFontAwesome5 name="cc-mastercard" size={24} style={iconStyle} />;
            case 'amex': return <AnimatedFontAwesome5 name="cc-amex" size={24} style={iconStyle} />;
            case 'discover': return <AnimatedFontAwesome5 name="cc-discover" size={24} style={iconStyle} />;
            default: return <AnimatedMaterialCommunityIcons name="credit-card-chip-outline" size={24} style={iconStyle} />;
        }
    };

    return (
        <AnimatedView
            layout={LinearTransition}
            style={[styles.cardItem, containerStyle]}
        >
            <View style={styles.cardInfo}>
                <AnimatedView style={[styles.iconContainer, iconContainerStyle]}>
                    <CardIcon />
                </AnimatedView>
                <View style={styles.textContainer}>
                    <AnimatedText style={[styles.cardNumber, textStyle]}>
                        •••• •••• •••• {item.number.slice(-4)}
                    </AnimatedText>
                    <AnimatedText style={[styles.expiry, subTextStyle]}>
                        Expires {item.expiry}
                    </AnimatedText>
                </View>
            </View>

            <View style={styles.actions}>
                {isDefault ? (
                    <View style={[styles.defaultBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                        <Text style={[styles.defaultText, { color: '#fff' }]}>Default</Text>
                    </View>
                ) : (
                    <Pressable onPress={() => onSetDefault(item.id)}>
                        <Text style={[styles.actionText, { color: colors.primary }]}>Set Default</Text>
                    </Pressable>
                )}

                <Pressable onPress={() => onRemove(item.id)} style={styles.deleteBtn}>
                    <AnimatedIonicons name="trash-outline" size={20} style={iconStyle} />
                </Pressable>
            </View>
        </AnimatedView>
    );
};

const styles = StyleSheet.create({
    safeArea: { flex: 1 },
    content: { flex: 1 },
    listContent: {
        padding: 20,
        paddingBottom: 100,
    },
    cardItem: {
        borderRadius: 16,
        borderWidth: 1,
        padding: 16,
        marginBottom: 16,
    },
    cardInfo: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 16,
    },
    textContainer: {
        flex: 1,
    },
    cardNumber: {
        fontSize: 16,
        fontWeight: "600",
        marginBottom: 4,
    },
    expiry: {
        fontSize: 14,
    },
    actions: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#e2e8f0',
        paddingTop: 12,
    },
    defaultBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    defaultText: {
        fontSize: 12,
        fontWeight: "600",
    },
    actionText: {
        fontSize: 14,
        fontWeight: "600",
    },
    deleteBtn: {
        padding: 4,
    },
    addButton: {
        position: "absolute",
        bottom: 30,
        left: 20,
        right: 20,
        borderRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
    },
    gradientButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 16,
        borderRadius: 16,
    },
    addButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
        marginLeft: 8,
    },
    emptyContainer: {
        alignItems: "center",
        justifyContent: "center",
        marginTop: 100,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
    },
});
