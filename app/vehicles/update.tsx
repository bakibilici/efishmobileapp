import { useTheme } from "@/context/ThemeContext";
import {
  getRegisteredVehicleDetail,
  getVehicleBrands,
  getVehicleModelsByBrand,
  getVehiclesByBrandAndModel,
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

  // Cascading dropdown state
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const [selectedBrand, setSelectedBrand] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Dropdown state
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  useEffect(() => {
    if (uuid) {
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  const loadData = async () => {
    try {
      setLoading(true);
      // 1. Fetch registered vehicle detail
      const vehicleResponse = await getRegisteredVehicleDetail(uuid as string);
      const vehicleData = vehicleResponse?.data || vehicleResponse;

      setPlateNumber(vehicleData.plate_number || "");

      // vehicle shape: vehicle.model.brand.name, model.name, vehicle.id/uuid
      const v = vehicleData.vehicle;
      const brandName = v?.model?.brand?.name;
      const modelName = v?.model?.name;

      // 2. Load brands and preselect matching brand
      const brandsResponse = await getVehicleBrands();
      let brandList: any[] = [];
      if (brandsResponse?.data && Array.isArray(brandsResponse.data.results)) {
        brandList = brandsResponse.data.results;
      } else if (Array.isArray(brandsResponse?.results)) {
        brandList = brandsResponse.results;
      } else if (Array.isArray(brandsResponse)) {
        brandList = brandsResponse;
      }
      setBrands(brandList);

      const brandMatch =
        brandList.find((b: any) => b.name === brandName) ?? brandList[0];
      if (!brandMatch) {
        return;
      }
      setSelectedBrand(brandMatch);

      // 3. Load models for brand and preselect model
      const modelsResponse = await getVehicleModelsByBrand(brandMatch.uuid);
      let modelList: any[] = [];
      if (modelsResponse?.data && Array.isArray(modelsResponse.data.results)) {
        modelList = modelsResponse.data.results;
      } else if (Array.isArray(modelsResponse?.results)) {
        modelList = modelsResponse.results;
      } else if (Array.isArray(modelsResponse)) {
        modelList = modelsResponse;
      }
      setModels(modelList);

      const modelMatch =
        modelList.find((m: any) => m.name === modelName) ?? modelList[0];
      if (!modelMatch) {
        return;
      }
      setSelectedModel(modelMatch);

      // 4. Load vehicles for brand+model and preselect exact vehicle
      const vehiclesResponse = await getVehiclesByBrandAndModel(
        brandMatch.uuid,
        modelMatch.uuid,
      );
      let vehicleList: any[] = [];
      if (
        vehiclesResponse?.data &&
        Array.isArray(vehiclesResponse.data.results)
      ) {
        vehicleList = vehiclesResponse.data.results;
      } else if (Array.isArray(vehiclesResponse?.results)) {
        vehicleList = vehiclesResponse.results;
      } else if (Array.isArray(vehiclesResponse)) {
        vehicleList = vehiclesResponse;
      }
      setVehicles(vehicleList);

      const vehicleMatch =
        vehicleList.find((item: any) => item.id === v.id) ?? vehicleList[0];
      if (vehicleMatch) {
        setSelectedVehicle(vehicleMatch);
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
    if (!selectedVehicle) {
      Alert.alert("Required", "Please select a vehicle.");
      return;
    }
    if (!plateNumber.trim()) {
      Alert.alert("Required", "Please enter your plate number.");
      return;
    }

    setSubmitting(true);
    try {
      await updateRegisteredVehicle(uuid as string, {
        vehicle: selectedVehicle.uuid,
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

  const renderBrandItem = ({ item }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [
        styles.dropdownItem,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.backgroundSecondary },
      ]}
      onPress={() => {
        setSelectedBrand(item);
        setSelectedModel(null);
        setSelectedVehicle(null);
        setModels([]);
        setVehicles([]);
        setBrandDropdownOpen(false);
        getVehicleModelsByBrand(item.uuid).then((res) => {
          let list: any[] = [];
          if (res?.data && Array.isArray(res.data.results)) {
            list = res.data.results;
          } else if (Array.isArray(res?.results)) {
            list = res.results;
          } else if (Array.isArray(res)) {
            list = res;
          }
          setModels(list);
        });
      }}
    >
      <Text style={[styles.dropdownItemText, { color: colors.text }]}>
        {item.name}
      </Text>
      {selectedBrand?.uuid === item.uuid && (
        <Ionicons name="checkmark" size={18} color={colors.primary} />
      )}
    </Pressable>
  );

  const renderModelItem = ({ item }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [
        styles.dropdownItem,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.backgroundSecondary },
      ]}
      onPress={() => {
        setSelectedModel(item);
        setSelectedVehicle(null);
        setVehicles([]);
        setModelDropdownOpen(false);
        if (selectedBrand?.uuid) {
          getVehiclesByBrandAndModel(selectedBrand.uuid, item.uuid).then(
            (res) => {
              let list: any[] = [];
              if (res?.data && Array.isArray(res.data.results)) {
                list = res.data.results;
              } else if (Array.isArray(res?.results)) {
                list = res.results;
              } else if (Array.isArray(res)) {
                list = res;
              }
              setVehicles(list);
            },
          );
        }
      }}
    >
      <Text style={[styles.dropdownItemText, { color: colors.text }]}>
        {item.name}
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

  const anyDropdownOpen =
    brandDropdownOpen || modelDropdownOpen || vehicleDropdownOpen;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ title: "Update Vehicle", headerBackTitle: "Cancel" }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!anyDropdownOpen}
      >
        {/* BRAND */}
        <Text style={[styles.label, { color: colors.textTertiary }]}>
          BRAND
        </Text>
        <View style={{ zIndex: 1000, marginBottom: 8 }}>
          <Pressable
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.card,
                borderColor: isActiveOrOpen(brandDropdownOpen, colors),
              },
              brandDropdownOpen && styles.inputContainerOpen,
            ]}
            onPress={() => setBrandDropdownOpen(!brandDropdownOpen)}
          >
            {selectedBrand ? (
              <Text
                style={[styles.inputText, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedBrand.name}
              </Text>
            ) : (
              <Text style={[styles.inputText, { color: colors.textTertiary }]}>
                Select a brand ...
              </Text>
            )}
            <Ionicons
              name={brandDropdownOpen ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textTertiary}
            />
          </Pressable>

          {brandDropdownOpen && (
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
                {brands.map((item) => (
                  <View key={item.uuid?.toString() || Math.random().toString()}>
                    {renderBrandItem({ item })}
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* MODEL */}
        <Text
          style={[styles.label, { color: colors.textTertiary, marginTop: 16 }]}
        >
          MODEL
        </Text>
        <View style={{ zIndex: 900, marginBottom: 8 }}>
          <Pressable
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.card,
                borderColor: isActiveOrOpen(modelDropdownOpen, colors),
                opacity: selectedBrand ? 1 : 0.5,
              },
              modelDropdownOpen && styles.inputContainerOpen,
            ]}
            onPress={() => {
              if (!selectedBrand) return;
              setModelDropdownOpen(!modelDropdownOpen);
            }}
          >
            {selectedModel ? (
              <Text
                style={[styles.inputText, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedModel.name}
              </Text>
            ) : (
              <Text style={[styles.inputText, { color: colors.textTertiary }]}>
                {selectedBrand ? "Select a model ..." : "Select a brand first"}
              </Text>
            )}
            <Ionicons
              name={modelDropdownOpen ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textTertiary}
            />
          </Pressable>

          {modelDropdownOpen && (
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

        {/* VEHICLE */}
        <Text
          style={[styles.label, { color: colors.textTertiary, marginTop: 16 }]}
        >
          VEHICLE
        </Text>
        <View style={{ zIndex: 800, marginBottom: 8 }}>
          <Pressable
            style={[
              styles.inputContainer,
              {
                backgroundColor: colors.card,
                borderColor: isActiveOrOpen(vehicleDropdownOpen, colors),
                opacity: selectedModel ? 1 : 0.5,
              },
              vehicleDropdownOpen && styles.inputContainerOpen,
            ]}
            onPress={() => {
              if (!selectedBrand || !selectedModel) return;
              setVehicleDropdownOpen(!vehicleDropdownOpen);
            }}
          >
            {selectedVehicle ? (
              <Text
                style={[styles.inputText, { color: colors.text }]}
                numberOfLines={1}
              >
                {selectedVehicle.full_name || selectedVehicle.name}
              </Text>
            ) : (
              <Text style={[styles.inputText, { color: colors.textTertiary }]}>
                {selectedModel
                  ? "Select a vehicle ..."
                  : "Select a model first"}
              </Text>
            )}
            <Ionicons
              name={vehicleDropdownOpen ? "chevron-up" : "chevron-down"}
              size={20}
              color={colors.textTertiary}
            />
          </Pressable>

          {vehicleDropdownOpen && (
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
                {vehicles.map((item) => (
                  <View key={item.uuid?.toString() || Math.random().toString()}>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dropdownItem,
                        { borderBottomColor: colors.border },
                        pressed && {
                          backgroundColor: colors.backgroundSecondary,
                        },
                      ]}
                      onPress={() => {
                        setSelectedVehicle(item);
                        setVehicleDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          { color: colors.text },
                        ]}
                      >
                        {item.full_name || item.name}
                      </Text>
                      {selectedVehicle?.uuid === item.uuid && (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={colors.primary}
                        />
                      )}
                    </Pressable>
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
