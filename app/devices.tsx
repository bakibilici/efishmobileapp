import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import {
    FlatList,
    Platform,
    Pressable,
    SafeAreaView,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface Device {
    id: string;
    brand: string;
    model: string;
    deviceId: string;
    loginDate: string;
    isCurrentSession: boolean;
    type: "mobile" | "tablet" | "desktop";
}

const MOCK_DEVICES: Device[] = [
    {
        id: "1",
        brand: "Apple",
        model: "iPhone 15 Pro Max",
        deviceId: "A13-9982-X21",
        loginDate: "09.01.2026 • 12:36",
        isCurrentSession: true,
        type: "mobile",
    },
    {
        id: "2",
        brand: "Samsung",
        model: "Galaxy S21",
        deviceId: "S21-5541-Y99",
        loginDate: "03.01.2026 • 21:16",
        isCurrentSession: false,
        type: "mobile",
    },
];

export default function DevicesScreen() {
    const router = useRouter();
    const [devices] = useState<Device[]>(MOCK_DEVICES);

    const renderDevice = ({ item }: { item: Device }) => (
        <View style={styles.deviceCard}>
            <View style={styles.iconContainer}>
                <Ionicons
                    name={item.type === "mobile" ? "phone-portrait-outline" : "laptop-outline"}
                    size={24}
                    color="#0f231c"
                />
            </View>

            <View style={styles.deviceInfo}>
                <View style={styles.headerRow}>
                    <Text style={styles.deviceName}>
                        {item.brand} {item.model}
                    </Text>
                    {item.isCurrentSession && (
                        <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>Current Session</Text>
                        </View>
                    )}
                </View>

                <Text style={styles.deviceId}>ID: {item.deviceId}</Text>

                <View style={styles.metaRow}>
                    <Ionicons name="time-outline" size={12} color="#8E8E93" />
                    <Text style={styles.deviceDate}>Last login: {item.loginDate}</Text>
                </View>
            </View>

            {!item.isCurrentSession && (
                <Pressable style={styles.removeButton}>
                    <Ionicons name="trash-outline" size={20} color="#FF3B30" />
                </Pressable>
            )}
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <Stack.Screen
                options={{
                    headerShown: true,
                    title: "Devices",
                    headerTitleStyle: {
                        fontFamily: "Gilroy-Bold",
                        fontSize: 18,
                        color: "#0f231c",
                    },
                    headerShadowVisible: false,
                    headerStyle: { backgroundColor: "#fff" },
                    headerLeft: () => (
                        <Pressable onPress={() => router.back()} style={{ marginRight: 10 }}>
                            <Ionicons name="arrow-back" size={24} color="#0f231c" />
                        </Pressable>
                    ),
                }}
            />

            <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                renderItem={renderDevice}
                contentContainerStyle={styles.listContainer}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#FFFFFF",
    },
    listContainer: {
        padding: 16,
    },
    deviceCard: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        backgroundColor: "#F8FAF9",
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#E8EBE9",
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: "#FFFFFF",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    deviceInfo: {
        flex: 1,
    },
    headerRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 4,
        flexWrap: 'wrap',
        gap: 6
    },
    deviceName: {
        fontSize: 16,
        fontWeight: "600",
        color: "#0f231c",
    },
    currentBadge: {
        backgroundColor: "#E8F9F1",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    currentBadgeText: {
        fontSize: 10,
        fontWeight: "700",
        color: "#2cdb9b",
    },
    deviceId: {
        fontSize: 12,
        color: "#8E8E93",
        fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
        marginBottom: 4,
    },
    metaRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4
    },
    deviceDate: {
        fontSize: 12,
        color: "#8E8E93",
    },
    removeButton: {
        padding: 8,
    }
});
