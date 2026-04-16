import { useTheme } from "@/context/ThemeContext";
import { useUser } from "@/context/UserContext";
import {
  Address,
  createRfidRequest,
  getAddresses,
  getRegisteredVehicles,
} from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

const AnimatedView = Animated.createAnimatedComponent(View);

function getVehicleDisplayName(item: any): string {
  const brand =
    item?.vehicle?.model?.brand?.name ||
    item?.vehicle_details?.brand ||
    item?.brand;
  const model =
    item?.vehicle?.model?.name ||
    item?.vehicle_details?.model ||
    item?.model_name ||
    item?.model;
  const variant =
    item?.vehicle?.name ||
    item?.vehicle_details?.variant ||
    item?.vehicle_details?.name ||
    item?.name;
  const parts = [brand, model, variant].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Unknown Vehicle";
}

export default function RfidRequestScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { user } = useUser();

  // Data
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Form
  const [selectedAddress, setSelectedAddress] = useState<Address | null>(null);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);

  // Modals
  const [addressModalVisible, setAddressModalVisible] = useState(false);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);

  const fetchData = async () => {
    try {
      const [addrRes, vehRes] = await Promise.all([
        getAddresses(),
        getRegisteredVehicles(),
      ]);

      // Parse addresses
      let addrList: Address[] = [];
      if (addrRes?.data && Array.isArray(addrRes.data.results)) {
        addrList = addrRes.data.results;
      } else if (Array.isArray(addrRes?.results)) {
        addrList = addrRes.results;
      } else if (Array.isArray(addrRes)) {
        addrList = addrRes;
      }
      setAddresses(addrList);

      // Auto-select default address
      const defaultAddr = addrList.find((a) => a.is_default);
      if (defaultAddr) setSelectedAddress(defaultAddr);

      // Parse vehicles
      let vehList: any[] = [];
      if (vehRes?.data && Array.isArray(vehRes.data.results)) {
        vehList = vehRes.data.results;
      } else if (Array.isArray(vehRes?.results)) {
        vehList = vehRes.results;
      } else if (Array.isArray(vehRes)) {
        vehList = vehRes;
      }
      setVehicles(
        vehList.map((v) => ({
          ...v,
          display_name: v.vehicle_name || getVehicleDisplayName(v),
        })),
      );
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoadingData(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  const toggleVehicle = (id: number) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const selectAllVehicles = () => {
    if (selectedVehicleIds.length === vehicles.length) {
      setSelectedVehicleIds([]);
    } else {
      setSelectedVehicleIds(vehicles.map((v) => v.id));
    }
  };

  const handleSubmit = async () => {
    if (!selectedAddress) {
      Alert.alert("Warning", "Please select a delivery address.");
      return;
    }
    if (selectedVehicleIds.length === 0) {
      Alert.alert("Warning", "Please select at least one vehicle.");
      return;
    }
    const qty = parseInt(quantity, 10);
    if (!qty || qty < 1) {
      Alert.alert("Warning", "Please enter a valid quantity.");
      return;
    }
    if (!user?.id) {
      Alert.alert("Error", "User not found. Please log in again.");
      return;
    }

    setSaving(true);
    try {
      await createRfidRequest({
        delivery_address: selectedAddress.id,
        registered_vehicles: selectedVehicleIds,
        user: user.id,
        quantity: qty,
      });
      Alert.alert("Success", "Your RFID card request has been submitted!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error: any) {
      console.error("Failed to create RFID request", error);
      const message =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        "An error occurred while submitting your request.";
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            headerTitle: "Request RFID Card",
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
            headerShadowVisible: false,
            headerBackTitle: "Back",
          }}
        />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: "Request RFID Card",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: "Back",
        }}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={100}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header illustration */}
          <AnimatedView entering={FadeInDown.delay(0).springify()}>
            <View
              style={[
                styles.headerCard,
                { backgroundColor: `${colors.primary}10` },
              ]}
            >
              <View style={styles.headerIconRow}>
                <View
                  style={[
                    styles.headerIconBg,
                    { backgroundColor: colors.primary },
                  ]}
                >
                  <Ionicons name="wifi" size={24} color="#fff" />
                </View>
                <View style={styles.headerTextBlock}>
                  <Text style={[styles.headerTitle, { color: colors.text }]}>
                    RFID Card Request
                  </Text>
                  <Text
                    style={[
                      styles.headerSubtitle,
                      { color: colors.textSecondary },
                    ]}
                  >
                    Fill in the details below to request your RFID card for
                    contactless charging.
                  </Text>
                </View>
              </View>
            </View>
          </AnimatedView>

          {/* Delivery Address */}
          <AnimatedView entering={FadeInDown.delay(80).springify()}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              DELIVERY ADDRESS
            </Text>
            <Pressable
              style={[
                styles.selectorCard,
                {
                  backgroundColor: colors.card,
                  borderColor: selectedAddress
                    ? colors.primary
                    : colors.border,
                  borderWidth: selectedAddress ? 1.5 : 1,
                },
              ]}
              onPress={() => setAddressModalVisible(true)}
            >
              <View style={styles.selectorContent}>
                <View
                  style={[
                    styles.selectorIcon,
                    {
                      backgroundColor: selectedAddress
                        ? `${colors.primary}15`
                        : colors.backgroundSecondary,
                    },
                  ]}
                >
                  <Ionicons
                    name="location"
                    size={22}
                    color={
                      selectedAddress ? colors.primary : colors.textTertiary
                    }
                  />
                </View>
                <View style={styles.selectorTextBlock}>
                  {selectedAddress ? (
                    <>
                      <Text
                        style={[styles.selectorTitle, { color: colors.text }]}
                      >
                        {selectedAddress.title || "My Address"}
                      </Text>
                      <Text
                        style={[
                          styles.selectorSubtext,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {selectedAddress.address}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.selectorTitle,
                          { color: colors.textTertiary },
                        ]}
                      >
                        Select delivery address
                      </Text>
                      <Text
                        style={[
                          styles.selectorSubtext,
                          { color: colors.textTertiary },
                        ]}
                      >
                        Where should we deliver your card?
                      </Text>
                    </>
                  )}
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textTertiary}
                />
              </View>
            </Pressable>

            {addresses.length === 0 && (
              <Pressable
                style={styles.addNewLink}
                onPress={() => router.push("/addresses/add")}
              >
                <Ionicons
                  name="add-circle-outline"
                  size={16}
                  color={colors.primary}
                  style={{ marginRight: 6 }}
                />
                <Text style={[styles.addNewText, { color: colors.primary }]}>
                  Add a new address first
                </Text>
              </Pressable>
            )}
          </AnimatedView>

          {/* Vehicle Selection */}
          <AnimatedView entering={FadeInDown.delay(160).springify()}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              LINKED VEHICLES
            </Text>
            <Pressable
              style={[
                styles.selectorCard,
                {
                  backgroundColor: colors.card,
                  borderColor:
                    selectedVehicleIds.length > 0
                      ? colors.primary
                      : colors.border,
                  borderWidth: selectedVehicleIds.length > 0 ? 1.5 : 1,
                },
              ]}
              onPress={() => setVehicleModalVisible(true)}
            >
              <View style={styles.selectorContent}>
                <View
                  style={[
                    styles.selectorIcon,
                    {
                      backgroundColor:
                        selectedVehicleIds.length > 0
                          ? `${colors.primary}15`
                          : colors.backgroundSecondary,
                    },
                  ]}
                >
                  <Ionicons
                    name="car-sport"
                    size={22}
                    color={
                      selectedVehicleIds.length > 0
                        ? colors.primary
                        : colors.textTertiary
                    }
                  />
                </View>
                <View style={styles.selectorTextBlock}>
                  {selectedVehicleIds.length > 0 ? (
                    <>
                      <Text
                        style={[styles.selectorTitle, { color: colors.text }]}
                      >
                        {selectedVehicleIds.length} vehicle
                        {selectedVehicleIds.length > 1 ? "s" : ""} selected
                      </Text>
                      <Text
                        style={[
                          styles.selectorSubtext,
                          { color: colors.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {vehicles
                          .filter((v) => selectedVehicleIds.includes(v.id))
                          .map((v) => v.plate_number || v.display_name)
                          .join(", ")}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text
                        style={[
                          styles.selectorTitle,
                          { color: colors.textTertiary },
                        ]}
                      >
                        Select vehicles
                      </Text>
                      <Text
                        style={[
                          styles.selectorSubtext,
                          { color: colors.textTertiary },
                        ]}
                      >
                        Choose which vehicles to link
                      </Text>
                    </>
                  )}
                </View>
                <View style={styles.selectorRight}>
                  {selectedVehicleIds.length > 0 && (
                    <View
                      style={[
                        styles.countBadge,
                        { backgroundColor: colors.primary },
                      ]}
                    >
                      <Text style={styles.countBadgeText}>
                        {selectedVehicleIds.length}
                      </Text>
                    </View>
                  )}
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.textTertiary}
                  />
                </View>
              </View>
            </Pressable>
          </AnimatedView>

          {/* Quantity */}
          <AnimatedView entering={FadeInDown.delay(240).springify()}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              QUANTITY
            </Text>
            <View
              style={[
                styles.quantityCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.quantityContent}>
                <View
                  style={[
                    styles.selectorIcon,
                    { backgroundColor: `${colors.primary}15` },
                  ]}
                >
                  <Ionicons
                    name="layers-outline"
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.quantityTextBlock}>
                  <Text style={[styles.quantityLabel, { color: colors.text }]}>
                    Number of Cards
                  </Text>
                  <Text
                    style={[
                      styles.quantityHint,
                      { color: colors.textTertiary },
                    ]}
                  >
                    How many RFID cards do you need?
                  </Text>
                </View>
              </View>
              <View style={styles.quantityControls}>
                <Pressable
                  style={[
                    styles.qtyBtn,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                  onPress={() => {
                    const n = Math.max(1, parseInt(quantity, 10) - 1 || 0);
                    setQuantity(String(n));
                  }}
                >
                  <Ionicons name="remove" size={20} color={colors.text} />
                </Pressable>
                <TextInput
                  style={[
                    styles.qtyInput,
                    {
                      color: colors.text,
                      backgroundColor: colors.backgroundSecondary,
                      borderColor: colors.border,
                    },
                  ]}
                  value={quantity}
                  onChangeText={(t) => {
                    const cleaned = t.replace(/[^0-9]/g, "");
                    setQuantity(cleaned);
                  }}
                  keyboardType="number-pad"
                  textAlign="center"
                  maxLength={3}
                />
                <Pressable
                  style={[
                    styles.qtyBtn,
                    { backgroundColor: colors.backgroundSecondary },
                  ]}
                  onPress={() => {
                    const n = parseInt(quantity, 10) + 1 || 1;
                    setQuantity(String(n));
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.text} />
                </Pressable>
              </View>
            </View>
          </AnimatedView>

          {/* Submit Button */}
          <AnimatedView entering={FadeInDown.delay(320).springify()}>
            <Pressable
              style={[
                styles.submitButton,
                { shadowColor: colors.primary },
                saving && { opacity: 0.7 },
              ]}
              onPress={handleSubmit}
              disabled={saving}
            >
              <LinearGradient
                colors={[colors.primary, "#1a9f70"]}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="paper-plane"
                      size={20}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.submitText}>Submit Request</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </AnimatedView>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Address Selection Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={addressModalVisible}
        onRequestClose={() => setAddressModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setAddressModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalContent,
                  { backgroundColor: colors.card },
                ]}
              >
                <View style={styles.modalHandle} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  Select Address
                </Text>

                <ScrollView
                  style={styles.modalList}
                  showsVerticalScrollIndicator={false}
                >
                  {addresses.map((addr, idx) => {
                    const isSelected = selectedAddress?.id === addr.id;
                    return (
                      <Pressable
                        key={addr.id}
                        style={({ pressed }) => [
                          styles.addressOption,
                          {
                            backgroundColor: pressed
                              ? colors.backgroundSecondary
                              : isSelected
                                ? `${colors.primary}08`
                                : "transparent",
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                            borderWidth: isSelected ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => {
                          setSelectedAddress(addr);
                          setAddressModalVisible(false);
                        }}
                      >
                        <View style={styles.addressOptionContent}>
                          <View
                            style={[
                              styles.addressIconBg,
                              {
                                backgroundColor: isSelected
                                  ? `${colors.primary}15`
                                  : colors.backgroundSecondary,
                              },
                            ]}
                          >
                            <Ionicons
                              name={
                                addr.type === "CORPORATE"
                                  ? "business"
                                  : "home"
                              }
                              size={20}
                              color={
                                isSelected
                                  ? colors.primary
                                  : colors.textSecondary
                              }
                            />
                          </View>
                          <View style={styles.addressOptionText}>
                            <View style={styles.addressTitleRow}>
                              <Text
                                style={[
                                  styles.addressOptionTitle,
                                  { color: colors.text },
                                  isSelected && { color: colors.primary },
                                ]}
                              >
                                {addr.title || "My Address"}
                              </Text>
                              {addr.is_default && (
                                <View
                                  style={[
                                    styles.defaultTag,
                                    { backgroundColor: `${colors.primary}15` },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.defaultTagText,
                                      { color: colors.primary },
                                    ]}
                                  >
                                    Default
                                  </Text>
                                </View>
                              )}
                            </View>
                            <Text
                              style={[
                                styles.addressOptionAddr,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={2}
                            >
                              {addr.address}
                            </Text>
                          </View>
                          {isSelected && (
                            <Ionicons
                              name="checkmark-circle"
                              size={22}
                              color={colors.primary}
                            />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}

                  {addresses.length === 0 && (
                    <View style={styles.noResult}>
                      <Ionicons
                        name="location-outline"
                        size={40}
                        color={colors.textTertiary}
                      />
                      <Text
                        style={[
                          styles.noResultText,
                          { color: colors.textTertiary },
                        ]}
                      >
                        No addresses found
                      </Text>
                      <Pressable
                        style={[
                          styles.noResultBtn,
                          { backgroundColor: colors.primary },
                        ]}
                        onPress={() => {
                          setAddressModalVisible(false);
                          router.push("/addresses/add");
                        }}
                      >
                        <Text style={styles.noResultBtnText}>
                          Add Address
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Vehicle Selection Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={vehicleModalVisible}
        onRequestClose={() => setVehicleModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setVehicleModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View
                style={[
                  styles.modalContent,
                  { backgroundColor: colors.card },
                ]}
              >
                <View style={styles.modalHandle} />
                <View style={styles.vehicleModalHeader}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>
                    Select Vehicles
                  </Text>
                  {vehicles.length > 0 && (
                    <Pressable onPress={selectAllVehicles}>
                      <Text
                        style={[
                          styles.selectAllText,
                          { color: colors.primary },
                        ]}
                      >
                        {selectedVehicleIds.length === vehicles.length
                          ? "Deselect All"
                          : "Select All"}
                      </Text>
                    </Pressable>
                  )}
                </View>

                <ScrollView
                  style={styles.modalList}
                  showsVerticalScrollIndicator={false}
                >
                  {vehicles.map((vehicle) => {
                    const isSelected = selectedVehicleIds.includes(vehicle.id);
                    return (
                      <Pressable
                        key={vehicle.id || vehicle.uuid}
                        style={({ pressed }) => [
                          styles.vehicleOption,
                          {
                            backgroundColor: pressed
                              ? colors.backgroundSecondary
                              : isSelected
                                ? `${colors.primary}08`
                                : "transparent",
                            borderColor: isSelected
                              ? colors.primary
                              : colors.border,
                            borderWidth: isSelected ? 1.5 : 1,
                          },
                        ]}
                        onPress={() => toggleVehicle(vehicle.id)}
                      >
                        <View style={styles.vehicleOptionContent}>
                          <View
                            style={[
                              styles.vehicleCheckbox,
                              {
                                backgroundColor: isSelected
                                  ? colors.primary
                                  : "transparent",
                                borderColor: isSelected
                                  ? colors.primary
                                  : colors.textTertiary,
                              },
                            ]}
                          >
                            {isSelected && (
                              <Ionicons
                                name="checkmark"
                                size={14}
                                color="#fff"
                              />
                            )}
                          </View>
                          <View
                            style={[
                              styles.vehicleIconBg,
                              {
                                backgroundColor: isSelected
                                  ? `${colors.primary}15`
                                  : colors.backgroundSecondary,
                              },
                            ]}
                          >
                            <Ionicons
                              name="car-sport"
                              size={20}
                              color={
                                isSelected
                                  ? colors.primary
                                  : colors.textSecondary
                              }
                            />
                          </View>
                          <View style={styles.vehicleOptionText}>
                            <Text
                              style={[
                                styles.vehiclePlate,
                                { color: colors.text },
                              ]}
                            >
                              {vehicle.plate_number || "—"}
                            </Text>
                            <Text
                              style={[
                                styles.vehicleModel,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {vehicle.display_name}
                            </Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}

                  {vehicles.length === 0 && (
                    <View style={styles.noResult}>
                      <Ionicons
                        name="car-outline"
                        size={40}
                        color={colors.textTertiary}
                      />
                      <Text
                        style={[
                          styles.noResultText,
                          { color: colors.textTertiary },
                        ]}
                      >
                        No vehicles found
                      </Text>
                      <Pressable
                        style={[
                          styles.noResultBtn,
                          { backgroundColor: colors.primary },
                        ]}
                        onPress={() => {
                          setVehicleModalVisible(false);
                          router.push("/vehicles/add");
                        }}
                      >
                        <Text style={styles.noResultBtnText}>
                          Add Vehicle
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </ScrollView>

                {vehicles.length > 0 && (
                  <View style={styles.modalFooter}>
                    <Pressable
                      style={[
                        styles.modalDoneBtn,
                        { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setVehicleModalVisible(false)}
                    >
                      <Text style={styles.modalDoneBtnText}>
                        Done ({selectedVehicleIds.length} selected)
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  scrollContent: {
    padding: 20,
  },

  // Header
  headerCard: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 28,
  },
  headerIconRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  headerIconBg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },

  // Section
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
    marginTop: 4,
  },

  // Selector Cards
  selectorCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
  },
  selectorContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  selectorIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  selectorTextBlock: {
    flex: 1,
  },
  selectorTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  selectorSubtext: {
    fontSize: 13,
  },
  selectorRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  addNewLink: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: -16,
    marginBottom: 24,
    marginLeft: 4,
  },
  addNewText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Quantity
  quantityCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 28,
  },
  quantityContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  quantityTextBlock: {
    flex: 1,
    marginLeft: 14,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  quantityHint: {
    fontSize: 12,
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  qtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyInput: {
    width: 64,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 18,
    fontWeight: "700",
  },

  // Submit Button
  submitButton: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  submitGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 16,
  },
  submitText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingBottom: 40,
    maxHeight: "75%",
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 16,
  },
  modalList: {
    paddingHorizontal: 20,
  },

  // Address modal
  addressOption: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  addressOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  addressIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  addressOptionText: {
    flex: 1,
  },
  addressTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  addressOptionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  defaultTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  defaultTagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  addressOptionAddr: {
    fontSize: 13,
    lineHeight: 17,
  },

  // Vehicle modal
  vehicleModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  selectAllText: {
    fontSize: 15,
    fontWeight: "600",
  },
  vehicleOption: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  vehicleOptionContent: {
    flexDirection: "row",
    alignItems: "center",
  },
  vehicleCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  vehicleIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  vehicleOptionText: {
    flex: 1,
  },
  vehiclePlate: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 2,
  },
  vehicleModel: {
    fontSize: 13,
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalDoneBtn: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 14,
  },
  modalDoneBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  // No result
  noResult: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  noResultText: {
    fontSize: 15,
    fontWeight: "500",
  },
  noResultBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  noResultBtnText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
