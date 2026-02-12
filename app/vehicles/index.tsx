import { useTheme } from '@/context/ThemeContext';
import { getRegisteredVehicles } from '@/services/api';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

export default function VehiclesScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchVehicles = async () => {
        try {
            const response = await getRegisteredVehicles();
            // User provided structure: { success: true, data: { results: [...] } }
            // api.ts calls response.data, so `response` object here is the parsed JSON body.
            let list = [];
            if (response.data && Array.isArray(response.data.results)) {
                list = response.data.results;
            } else if (Array.isArray(response.results)) {
                list = response.results;
            } else if (Array.isArray(response)) {
                list = response;
            }
            setVehicles(list);
        } catch (error) {
            console.error("Failed to fetch vehicles", error);
            Alert.alert("Error", "Failed to load vehicles.");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchVehicles();
        }, [])
    );

    const onRefresh = () => {
        setRefreshing(true);
        fetchVehicles();
    };

    const renderItem = ({ item }: { item: any }) => (
        <Pressable
            style={({ pressed }) => [
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
                pressed && { opacity: 0.7 }
            ]}
            onPress={() => router.push(`/vehicles/${item.uuid}`)}
        >
            <View style={styles.cardContent}>
                <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
                    <Ionicons name="car-sport" size={24} color={colors.primary} />
                </View>
                <View style={styles.cardInfo}>
                    <Text style={[styles.plateNumber, { color: colors.text }]}>{item.plate_number}</Text>
                    <Text style={[styles.modelName, { color: colors.textSecondary }]}>
                        {item.vehicle_name || "Unknown Model"}
                    </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
            </View>
        </Pressable>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <Stack.Screen options={{ title: 'My Vehicles', headerBackTitle: 'Profile' }} />

            <View style={styles.headerContainer}>
                <Pressable
                    style={({ pressed }) => [
                        styles.addButton,
                        { backgroundColor: colors.primary },
                        pressed && { opacity: 0.9 }
                    ]}
                    onPress={() => router.push('/vehicles/add')}
                >
                    <Ionicons name="add-circle-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                    <Text style={styles.addButtonText}>Add New Vehicle</Text>
                </Pressable>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            ) : vehicles.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="car-outline" size={80} color={colors.textTertiary} />
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                        Sisteme ekli aracınız bulunmamaktadır.
                    </Text>
                    <Text style={[styles.emptySubText, { color: colors.textTertiary }]}>
                        Add a vehicle to manage your charging experience.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={vehicles}
                    keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
                    renderItem={renderItem}
                    contentContainerStyle={styles.listContent}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerContainer: {
        padding: 16,
    },
    addButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 12,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 5,
    },
    addButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 40,
    },
    card: {
        borderRadius: 16,
        borderWidth: 1,
        marginBottom: 12,
        overflow: 'hidden',
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 14,
    },
    cardInfo: {
        flex: 1,
    },
    plateNumber: {
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 2,
    },
    modelName: {
        fontSize: 14,
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 32,
        marginTop: -50, // Visual adjustment
    },
    emptyText: {
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubText: {
        fontSize: 14,
        textAlign: 'center',
    }
});
