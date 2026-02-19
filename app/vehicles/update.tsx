import { useTheme } from "@/context/ThemeContext";
import {
  getRegisteredVehicleDetail,
  getVehicleModels,
  updateRegisteredVehicle,
} from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function UpdateVehicleScreen() {
  const router = useRouter();
  const { uuid } = useLocalSearchParams();
  const { colors } = useTheme();

  // Form State
  const [plateNumber, setPlateNumber] = useState("");
  const [selectedModel, setSelectedModel] = useState<any>(null);

  // Data State
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Dropdown state
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (uuid) {
      loadData();
    }
  }, [uuid]);

  const loadData = async () => {
    try {
      setLoading(true);
      // 1. Fetch Models
      const modelsResponse = await getVehicleModels();
      let modelList = [];
      if (modelsResponse.data && Array.isArray(modelsResponse.data.results)) {
        modelList = modelsResponse.data.results;
      } else if (Array.isArray(modelsResponse.results)) {
        modelList = modelsResponse.results;
      } else if (Array.isArray(modelsResponse)) {
        modelList = modelsResponse;
      }
      setModels(modelList);

      // 2. Fetch Vehicle Detail
      const vehicleResponse = await getRegisteredVehicleDetail(uuid as string);
      const vehicleData = vehicleResponse.data || vehicleResponse;

      setPlateNumber(vehicleData.plate_number || "");

      // 3. Match Model (vehicle from API can be uuid or id)
      if (vehicleData.vehicle) {
        const found = modelList.find(
          (m: any) =>
            m.uuid === vehicleData.vehicle || m.id === vehicleData.vehicle,
        );
        if (found) setSelectedModel(found);
      } else if (vehicleData.vehicle_details?.uuid) {
        const found = modelList.find(
          (m: any) => m.uuid === vehicleData.vehicle_details.uuid,
        );
        if (found) setSelectedModel(found);
      } else if (vehicleData.vehicle_details?.id) {
        const found = modelList.find(
          (m: any) => m.id === vehicleData.vehicle_details.id,
        );
        if (found) setSelectedModel(found);
      }
    } catch (error) {
      console.error("Failed to load data", error);
      Alert.alert("Error", "Failed to load vehicle information.");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedModel) {
      Alert.alert("Required", "Please select a vehicle model.");
      return;
    }
    if (!plateNumber.trim()) {
      Alert.alert("Required", "Please enter your plate number.");
      return;
    }

    setSubmitting(true);
    try {
      await updateRegisteredVehicle(uuid as string, {
        vehicle: selectedModel.uuid,
        plate_number: plateNumber.trim(),
        vehicle_type: "INDIVIDUAL",
      });
      Alert.alert("Success", "Vehicle updated successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      console.error("Failed to update vehicle", error);
      const msg =
        error.response?.data?.message ||
        "Could not update vehicle. Please try again.";
      Alert.alert("Error", msg);
    } finally {
      setSubmitting(false);
    }
  };

  const renderModelItem = ({ item }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [
        styles.dropdownItem,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.backgroundSecondary },
      ]}
      onPress={() => {
        setSelectedModel(item);
        setDropdownOpen(false);
      }}
    >
      <Text style={[styles.dropdownItemText, { color: colors.text }]}>
        {item.full_name || `${item.brand} ${item.model}`}
      </Text>
      {selectedModel?.uuid === item.uuid && (
        <Ionicons name="checkmark" size={18} color={colors.primary} />
      )}
    </Pressable>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ title: "Update Vehicle", headerBackTitle: "Cancel" }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!dropdownOpen}
      >
        <Text style={[styles.label, { color: colors.textTertiary }]}>
          VEHICLE MODEL
        </Text>

        {/* Visual Container for ZIndex context */}
        <View style={{ zIndex: 1000, marginBottom: 8 }}>
          <Pressable
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.card,
                borderColor: isActiveOrOpen(dropdownOpen, colors),
              },
              dropdownOpen && styles.inputContainerOpen,
            ]}
            onPress={() => setDropdownOpen(!dropdownOpen)}
          >
            {selectedModel ? (
              <Text
                style={[styles.inputText, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedModel.full_name ||
                  `${selectedModel.brand} ${selectedModel.model}`}
              </Text>
            ) : (
              <Text style={[styles.inputText, { color: colors.textTertiary }]}>
                Select a vehicle model ...
              </Text>
            )}
            <Ionicons
              name={dropdownOpen ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textTertiary}
            />
          </Pressable>

          {dropdownOpen && (
            <View
              style={[
                styles.dropdownList,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  shadowColor: colors.shadow,
                },
              ]}
            >
              <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled={true}>
                {models.map((item) => (
                  <View key={item.uuid?.toString() || Math.random().toString()}>
                    {renderModelItem({ item })}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Wrapper for the rest to potentially push down z-index */}
        <View style={{ zIndex: 1 }}>
          <Text
            style={[
              styles.label,
              { color: colors.textTertiary, marginTop: 16 },
            ]}
          >
            PLATE NUMBER
          </Text>
          <View
            style={[
              styles.inputContainer,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text }]}
              value={plateNumber}
              onChangeText={(text) => setPlateNumber(text.toUpperCase())}
              placeholder="e.g. 34ABC123"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="characters"
            />
          </View>

          <Text style={[styles.note, { color: colors.textTertiary }]}>
            Vehicle type is set to INDIVIDUAL by default.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.submitButton,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.9 },
              submitting && { opacity: 0.5 },
            ]}
            onPress={handleUpdate}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Update Vehicle</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function isActiveOrOpen(isOpen: boolean, colors: any) {
  return isOpen ? colors.primary : colors.border;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  inputContainerOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    height: "100%",
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    marginRight: 10,
  },
  dropdownList: {
    position: "absolute",
    top: 53,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderTopWidth: 1,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 9999,
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
  note: {
    fontSize: 12,
    marginBottom: 32,
    marginLeft: 4,
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
