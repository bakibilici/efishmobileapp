import { useTheme } from "@/context/ThemeContext";
import {
  addRegisteredVehicle,
  getVehicleBrands,
  getVehicleModelsByBrand,
  getVehiclesByBrandAndModel,
} from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
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
import { ScrollView as GHScrollView } from "react-native-gesture-handler";

export default function AddVehicleScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [plateNumber, setPlateNumber] = useState("");

  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);

  const [selectedBrand, setSelectedBrand] = useState<any>(null);
  const [selectedModel, setSelectedModel] = useState<any>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<any>(null);

  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      setLoadingBrands(true);
      const response = await getVehicleBrands();
      let list: any[] = [];
      if (response?.data && Array.isArray(response.data.results)) {
        list = response.data.results;
      } else if (Array.isArray(response?.results)) {
        list = response.results;
      } else if (Array.isArray(response)) {
        list = response;
      }
      setBrands(list);
    } catch (error) {
      console.error("Failed to fetch brands", error);
      Alert.alert("Error", "Failed to load brands.");
    } finally {
      setLoadingBrands(false);
    }
  };

  const fetchModels = async (brandUuid: string) => {
    try {
      setLoadingModels(true);
      const response = await getVehicleModelsByBrand(brandUuid);
      let list: any[] = [];
      if (response?.data && Array.isArray(response.data.results)) {
        list = response.data.results;
      } else if (Array.isArray(response?.results)) {
        list = response.results;
      } else if (Array.isArray(response)) {
        list = response;
      }
      setModels(list);
    } catch (error) {
      console.error("Failed to fetch models", error);
      Alert.alert("Error", "Failed to load vehicle models.");
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchVehicles = async (brandUuid: string, modelUuid: string) => {
    try {
      setLoadingVehicles(true);
      const response = await getVehiclesByBrandAndModel(brandUuid, modelUuid);
      let list: any[] = [];
      if (response?.data && Array.isArray(response.data.results)) {
        list = response.data.results;
      } else if (Array.isArray(response?.results)) {
        list = response.results;
      } else if (Array.isArray(response)) {
        list = response;
      }
      setVehicles(list);
    } catch (error) {
      console.error("Failed to fetch vehicles", error);
      Alert.alert("Error", "Failed to load vehicles.");
    } finally {
      setLoadingVehicles(false);
    }
  };

  const handleSubmit = async () => {
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
      await addRegisteredVehicle({
        plate_number: plateNumber.trim(),
        vehicle: selectedVehicle.id,
        vehicle_type: "INDIVIDUAL",
      });
      Alert.alert("Success", "Vehicle added successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      console.error("Failed to add vehicle", error);
      const msg =
        error.response?.data?.message ||
        "Could not add vehicle. Please try again.";
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
        fetchModels(item.uuid);
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
          fetchVehicles(selectedBrand.uuid, item.uuid);
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

  const renderVehicleItem = ({ item }: { item: any }) => (
    <Pressable
      style={({ pressed }) => [
        styles.dropdownItem,
        { borderBottomColor: colors.border },
        pressed && { backgroundColor: colors.backgroundSecondary },
      ]}
      onPress={() => {
        setSelectedVehicle(item);
        setVehicleDropdownOpen(false);
      }}
    >
      <Text style={[styles.dropdownItemText, { color: colors.text }]}>
        {item.full_name || item.name}
      </Text>
      {selectedVehicle?.uuid === item.uuid && (
        <Ionicons name="checkmark" size={18} color={colors.primary} />
      )}
    </Pressable>
  );

  const anyDropdownOpen =
    brandDropdownOpen || modelDropdownOpen || vehicleDropdownOpen;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{ title: "Add Vehicle", headerBackTitle: "Cancel" }}
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
              {loadingBrands ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ margin: 20 }}
                />
              ) : (
                <GHScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {brands.map((item) => (
                    <View key={item.uuid?.toString() || item.id?.toString()}>
                      {renderBrandItem({ item })}
                    </View>
                  ))}
                </GHScrollView>
              )}
            </View>
          )}
        </View>

        {/* MODEL */}
        <Text
          style={[
            styles.label,
            { color: colors.textTertiary, marginTop: 16 },
          ]}
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
                {selectedBrand
                  ? "Select a model ..."
                  : "Select a brand first"}
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
              {loadingModels ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ margin: 20 }}
                />
              ) : (
                <GHScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {models.map((item) => (
                    <View key={item.uuid?.toString() || item.id?.toString()}>
                      {renderModelItem({ item })}
                    </View>
                  ))}
                </GHScrollView>
              )}
            </View>
          )}
        </View>

        {/* VEHICLE */}
        <Text
          style={[
            styles.label,
            { color: colors.textTertiary, marginTop: 16 },
          ]}
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
              {loadingVehicles ? (
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={{ margin: 20 }}
                />
              ) : (
                <GHScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {vehicles.map((item) => (
                    <View key={item.uuid?.toString() || item.id?.toString()}>
                      {renderVehicleItem({ item })}
                    </View>
                  ))}
                </GHScrollView>
              )}
            </View>
          )}
        </View>

        {/* PLATE & SUBMIT */}
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
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitButtonText}>Add Vehicle</Text>
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
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    // marginBottom: 8, // Moved to parent zIndex view
  },
  inputContainerOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 0,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    height: '100%',
  },
  inputText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginRight: 10,
  },
  dropdownList: {
    position: 'absolute',
    top: 53, // Just below the input (height - 1 border width)
    left: 0,
    right: 0,
    borderWidth: 1,
    borderTopWidth: 1, // Add top border back for the list
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 9999, // Ensure it sits on top
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dropdownItemText: {
    fontSize: 15,
    fontWeight: '500',
  },
  note: {
    fontSize: 12,
    marginBottom: 32,
    marginLeft: 4,
  },
  submitButton: {
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
});
