import { useTheme } from "@/context/ThemeContext";
import { PaymentCard, usePayment } from "@/context/payment/PaymentContext";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter } from "expo-router";
import React from "react";
import {
    Alert,
    FlatList,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View
} from "react-native";

export default function PaymentMethodsScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const { cards, removeCard, setDefaultCard } = usePayment();

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

    const renderItem = ({ item }: { item: PaymentCard }) => (
        <View style={[styles.cardItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.cardInfo}>
                <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
                    <Ionicons name="card" size={24} color={colors.primary} />
                </View>
                <View style={styles.textContainer}>
                    <Text style={[styles.cardNumber, { color: colors.text }]}>
                        •••• •••• •••• {item.number.slice(-4)}
                    </Text>
                    <Text style={[styles.expiry, { color: colors.textSecondary }]}>
                        Expires {item.expiry}
                    </Text>
                </View>
            </View>

            <View style={styles.actions}>
                {item.isDefault ? (
                    <View style={[styles.defaultBadge, { backgroundColor: colors.primary + '20' }]}>
                        <Text style={[styles.defaultText, { color: colors.primary }]}>Default</Text>
                    </View>
                ) : (
                    <Pressable onPress={() => setDefaultCard(item.id)}>
                        <Text style={[styles.actionText, { color: colors.primary }]}>Set Default</Text>
                    </Pressable>
                )}

                <Pressable onPress={() => handleRemove(item.id)} style={styles.deleteBtn}>
                    <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
            </View>
        </View>
    );

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
                <FlatList
                    data={cards}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.listContent}
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
