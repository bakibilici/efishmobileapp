import { useTheme } from "@/context/ThemeContext";
import {
  deleteRegisteredVehicle,
  getRegisteredVehicleDetail,
} from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

function getVehicleDisplayName(vehicle: any): string {
  // New backend vehicle shape: vehicle.model.brand.name, vehicle.model.name, vehicle.name
  const brand =
    vehicle?.vehicle?.model?.brand?.name ||
    vehicle?.vehicle_details?.brand ||
    vehicle?.brand;
  const model =
    vehicle?.vehicle?.model?.name ||
    vehicle?.vehicle_details?.model ||
    vehicle?.model_name ||
    vehicle?.model;
  const variant =
    vehicle?.vehicle?.name ||
    vehicle?.vehicle_details?.variant ||
    vehicle?.vehicle_details?.name ||
    vehicle?.name;

  const parts = [brand, model, variant].filter(Boolean);
  if (parts.length === 0) return "Unknown Model";
  return parts.join(" ");
}

export default function VehicleDetailScreen() {
  const { uuid } = useLocalSearchParams();
  const { colors } = useTheme();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (uuid) {
        fetchDetail();
      }
    }, [uuid]),
  );

  const fetchDetail = async () => {
    try {
      const data = await getRegisteredVehicleDetail(uuid as string);
      // New backend structure: { success, message_key, data: { ...vehicle } }
      const v = data?.data || data;
      setVehicle(v);
    } catch (error) {
      console.error("Failed to fetch vehicle detail", error);
      Alert.alert("Error", "Failed to load vehicle details.", [
        { text: "Go Back", onPress: () => router.back() },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Vehicle",
      "Are you sure you want to delete this vehicle?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteRegisteredVehicle(uuid as string);
              router.back();
            } catch (error) {
              console.error("Delete failed", error);
              Alert.alert("Error", "Failed to delete vehicle.");
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!vehicle) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Vehicle not found.</Text>
      </View>
    );
  }

  const DetailItem = ({
    label,
    value,
    icon,
  }: {
    label: string;
    value: string;
    icon: string;
  }) => (
    <View style={[styles.item, { borderBottomColor: colors.border }]}>
      <View
        style={[
          styles.iconBox,
          { backgroundColor: colors.backgroundSecondary },
        ]}
      >
        <Ionicons name={icon as any} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.textTertiary }]}>
          {label}
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>{value}</Text>
      </View>
    </View>
  );

  const displayName =
    vehicle.vehicle_name || getVehicleDisplayName(vehicle) || "-";

  const batteryKwh =
    vehicle.vehicle_details?.battery_size ||
    vehicle.vehicle?.battery_capacity ||
    null;

  const rangeKm =
    vehicle.vehicle_details?.range_km || vehicle.vehicle?.range || null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <Stack.Screen
        options={{
          title: vehicle.plate_number || "Vehicle Details",
          headerBackTitle: "Vehicles",
        }}
      />

      <View style={styles.header}>
        <View
          style={[
            styles.avatarContainer,
            { backgroundColor: colors.card, shadowColor: colors.shadow },
          ]}
        >
          <Ionicons name="car-sport" size={60} color={colors.primary} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>{displayName}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {vehicle.plate_number}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <DetailItem
          icon="card-outline"
          label="Plate Number"
          value={vehicle.plate_number}
        />
        <DetailItem icon="car-outline" label="Model" value={displayName} />
        <DetailItem
          icon="information-circle-outline"
          label="Type"
          value={
            vehicle.vehicle_type_display ||
            vehicle.vehicle_type ||
            "Individual"
          }
        />
        {batteryKwh && (
          <DetailItem
            icon="battery-charging-outline"
            label="Battery Size"
            value={`${batteryKwh} kWh`}
          />
        )}
        {rangeKm && (
          <DetailItem
            icon="speedometer-outline"
            label="Range"
            value={`${rangeKm} km`}
          />
        )}
      </View>

      <View style={styles.actionContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.updateButton,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.9 },
          ]}
          onPress={() => router.push(`/vehicles/update?uuid=${uuid}`)}
          disabled={deleting}
        >
          <Text style={styles.buttonText}>Update</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            styles.deleteButton,
            { backgroundColor: "#FF3B30" },
            pressed && { opacity: 0.9 },
            deleting && { opacity: 0.7 },
          ]}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Delete</Text>
          )}
        </Pressable>
      </View>
    </ScrollView>
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
    header: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    avatarContainer: {
        width: 100,
        height: 100,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 4,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    subtitle: {
        fontSize: 16,
        fontWeight: '500',
    },
    card: {
        marginHorizontal: 16,
        borderRadius: 20,
        paddingVertical: 8,
    },
    item: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    iconBox: {
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    label: {
        fontSize: 12,
        textTransform: 'uppercase',
        marginBottom: 4,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    value: {
        fontSize: 16,
        fontWeight: '500',
    },
    actionContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
        marginBottom: 20,
    },
    button: {
        flex: 1,
        height: 50,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    updateButton: {
        // primary color set in render
    },
    deleteButton: {
        backgroundColor: '#FF3B30', // System Red
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    }
});
