import { useTheme } from "@/context/ThemeContext";
import {
  createAddress,
  updateAddress,
  AddressType,
  getCountries,
  getCities,
  getDistricts,
  getAddressDetail,
  getCityDetail,
  getDistrictDetail,
  Country,
  City,
  DistrictLocation,
} from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
  Modal,
} from "react-native";
import Animated, {
  FadeInDown,
} from "react-native-reanimated";

const AnimatedView = Animated.createAnimatedComponent(View);

const ADDRESS_TYPES: { value: AddressType; label: string; icon: string }[] = [
  { value: "INDIVIDUAL", label: "Individual", icon: "person" },
  { value: "CORPORATE", label: "Corporate", icon: "business" },
];

type ModalMode = "COUNTRY" | "CITY" | "DISTRICT";

export default function AddAddressScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const [title, setTitle] = useState("");
  const [address, setAddress] = useState("");
  
  // Location States
  const [countries, setCountries] = useState<Country[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [districts, setDistricts] = useState<DistrictLocation[]>([]);
  
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [selectedCountryName, setSelectedCountryName] = useState("");
  
  const [selectedCityId, setSelectedCityId] = useState<number | null>(null);
  const [selectedCityName, setSelectedCityName] = useState("");
  
  const [district, setDistrict] = useState<number | null>(null);
  const [districtName, setDistrictName] = useState("");

  const [postalCode, setPostalCode] = useState("");
  const [type, setType] = useState<AddressType>("INDIVIDUAL");
  const [companyName, setCompanyName] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [taxOffice, setTaxOffice] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolvingLocation, setResolvingLocation] = useState(false);

  const { uuid, countryNameParam, cityNameParam, districtNameParam } =
    useLocalSearchParams<{
      uuid?: string;
      countryNameParam?: string;
      cityNameParam?: string;
      districtNameParam?: string;
    }>();
  const isEdit = !!uuid;
  
  // Modal States
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("COUNTRY");
  const [searchText, setSearchText] = useState("");

  const isCorpo = type === "CORPORATE";

  // Fetch Countries on mount
  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const res = await getCountries();
        setCountries(res.results || res.data?.results || res || []);
      } catch (error) {
        console.error("Failed to fetch countries", error);
      }
    };
    fetchCountries();
  }, []);

  // Fetch address details if in edit mode
  useEffect(() => {
    const fetchAddressDetails = async () => {
      if (!uuid) return;
      setLoading(true);
      try {
        const detail = await getAddressDetail(uuid);
        const data = detail.data || detail;

        setTitle(data.title || "");
        setAddress(data.address || "");
        setPostalCode(data.postal_code || "");
        setType(data.type || "INDIVIDUAL");
        setCompanyName(data.company_name || "");
        setTaxNumber(data.tax_number || "");
        setTaxOffice(data.tax_office || "");
        setIsDefault(data.is_default || false);

        if (data.district) {
          setResolvingLocation(true);
          try {
            // Check for nested structure provided by GET /addresses/{uuid}/
            const actualDistrictId =
              typeof data.district === "object" ? data.district?.id : data.district;
            let cityId = data.city;
            let countryId = data.country;
            let cityName = data.city_name || cityNameParam;
            let countryName = data.country_name || countryNameParam;
            let distName = data.district_name || districtNameParam;

            if (typeof data.district === "object") {
              distName = data.district.name || distName;
              cityId = data.district.city?.id || cityId;
              cityName = data.district.city?.name || cityName;
              countryId = data.district.city?.country?.id || countryId;
              countryName = data.district.city?.country?.name || countryName;
            }

            // RESOLUTION logic: Use IDs if available, else try names
            if (countryId || countryName) {
              const resCountry = await getCountries();
              const countriesList =
                resCountry.results || resCountry.data?.results || resCountry || [];
              setCountries(countriesList);

              let foundCountry = countryId
                ? countriesList.find((c: any) => c.id === countryId)
                : countriesList.find(
                    (c: any) =>
                      c.name.toLowerCase() === countryName?.toLowerCase(),
                  );

              if (foundCountry) {
                const actualCountryId = foundCountry.id;
                setSelectedCountryId(actualCountryId);
                setSelectedCountryName(foundCountry.name);

                // Fetch cities for this country
                const resCities = await getCities(actualCountryId);
                const citiesList =
                  resCities.results || resCities.data?.results || resCities || [];
                setCities(citiesList);

                if (cityId || cityName) {
                  let foundCity = cityId
                    ? citiesList.find((c: any) => c.id === cityId)
                    : citiesList.find(
                        (c: any) =>
                          c.name.toLowerCase() === cityName?.toLowerCase(),
                      );

                  if (foundCity) {
                    const actualCityId = foundCity.id;
                    setSelectedCityId(actualCityId);
                    setSelectedCityName(foundCity.name);

                    // Fetch districts for this city
                    const resDistricts = await getDistricts(actualCityId);
                    const districtsList =
                      resDistricts.results ||
                      resDistricts.data?.results ||
                      resDistricts ||
                      [];
                    setDistricts(districtsList);

                    if (actualDistrictId || distName) {
                      let foundDist = actualDistrictId
                        ? districtsList.find((d: any) => d.id === actualDistrictId)
                        : districtsList.find(
                            (d: any) =>
                              d.name.toLowerCase() === distName?.toLowerCase(),
                          );

                      if (foundDist) {
                        setDistrict(foundDist.id);
                        setDistrictName(foundDist.name);
                      }
                    }
                  }
                }
              }
            }
          } catch (err) {
            console.error("Failed to resolve location hierarchy", err);
          } finally {
            setResolvingLocation(false);
          }
        }
      } catch (error) {
        console.error("Failed to fetch address details", error);
        Alert.alert("Error", "Failed to load address details.");
      } finally {
        setLoading(false);
      }
    };

    fetchAddressDetails();
  }, [uuid]);

  // Handle Country Selection
  const handleCountrySelect = async (id: number, name: string) => {
    setSelectedCountryId(id);
    setSelectedCountryName(name);
    
    // Reset city and district
    setSelectedCityId(null);
    setSelectedCityName("");
    setDistrict(null);
    setDistrictName("");
    setCities([]);
    setDistricts([]);
    
    try {
      const res = await getCities(id);
      setCities(res.results || res.data?.results || res || []);
    } catch (error) {
      console.error("Failed to fetch cities", error);
    }
  };

  // Handle City Selection
  const handleCitySelect = async (id: number, name: string) => {
    setSelectedCityId(id);
    setSelectedCityName(name);
    
    // Reset district
    setDistrict(null);
    setDistrictName("");
    setDistricts([]);
    
    try {
      const res = await getDistricts(id);
      setDistricts(res.results || res.data?.results || res || []);
    } catch (error) {
      console.error("Failed to fetch districts", error);
    }
  };

  const filteredItems = useMemo(() => {
    let items: { id: number; name: string }[] = [];
    if (modalMode === "COUNTRY") items = countries;
    else if (modalMode === "CITY") items = cities;
    else if (modalMode === "DISTRICT") items = districts;

    return items.filter((item) =>
      item.name.toLowerCase().includes(searchText.toLowerCase())
    );
  }, [modalMode, countries, cities, districts, searchText]);

  const openModal = (mode: ModalMode) => {
    if (mode === "CITY" && !selectedCountryId) {
      Alert.alert("Notice", "Please select a country first.");
      return;
    }
    if (mode === "DISTRICT" && !selectedCityId) {
      Alert.alert("Notice", "Please select a city first.");
      return;
    }
    setModalMode(mode);
    setSearchText("");
    setModalVisible(true);
  };

  const handleSave = async () => {
    // Validation
    if (!title.trim()) {
      Alert.alert("Warning", "Please enter an address title.");
      return;
    }
    if (!address.trim()) {
      Alert.alert("Warning", "Please enter the address.");
      return;
    }
    if (isCorpo && !companyName.trim()) {
      Alert.alert("Warning", "Please enter the company name.");
      return;
    }
    if (isCorpo && !taxNumber.trim()) {
      Alert.alert("Warning", "Please enter the tax number.");
      return;
    }
    if (isCorpo && !taxOffice.trim()) {
      Alert.alert("Warning", "Please enter the tax office.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        address: address.trim(),
        district,
        postal_code: postalCode.trim(),
        type,
        company_name: companyName.trim(),
        tax_number: taxNumber.trim(),
        tax_office: taxOffice.trim(),
        is_default: isDefault,
      };

      if (isEdit && uuid) {
        await updateAddress(uuid, payload);
      } else {
        await createAddress(payload);
      }
      router.back();
    } catch (error: any) {
      console.error(`Failed to ${isEdit ? "update" : "create"} address`, error);
      const message =
        error.response?.data?.message ||
        error.response?.data?.detail ||
        `An error occurred while ${isEdit ? "updating" : "adding"} the address.`;
      Alert.alert("Error", message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: isEdit ? "Edit Address" : "New Address",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: "Back",
        }}
      />

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textTertiary }}>
            Loading address details...
          </Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={100}
        >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Address Type Selector */}
          <AnimatedView entering={FadeInDown.delay(50).springify()}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              ADDRESS TYPE
            </Text>
            <View style={styles.typeRow}>
              {ADDRESS_TYPES.map((t) => {
                const isSelected = type === t.value;
                return (
                  <Pressable
                    key={t.value}
                    style={[
                      styles.typeCard,
                      {
                        backgroundColor: isSelected
                          ? colors.primary
                          : colors.card,
                        borderColor: isSelected
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                    onPress={() => setType(t.value)}
                  >
                    <Ionicons
                      name={t.icon as any}
                      size={24}
                      color={isSelected ? "#fff" : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.typeLabel,
                        {
                          color: isSelected ? "#fff" : colors.text,
                        },
                      ]}
                    >
                      {t.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.typeCheckmark}>
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#fff"
                        />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </AnimatedView>

          {/* Basic Info Section */}
          <AnimatedView entering={FadeInDown.delay(120).springify()}>
            <Text style={[styles.sectionTitle, { color: colors.textTertiary }]}>
              ADDRESS DETAILS
            </Text>
            <View
              style={[
                styles.formCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              {/* Title */}
              <FormField
                label="Address Title"
                placeholder="e.g. Home, Work, Summer House"
                value={title}
                onChangeText={setTitle}
                colors={colors}
                icon="bookmark-outline"
              />

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Address */}
              <FormField
                label="Address"
                placeholder="Street, neighborhood, building no..."
                value={address}
                onChangeText={setAddress}
                colors={colors}
                icon="location-outline"
                multiline
              />

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Country Selector */}
              <Pressable
                style={styles.fieldContainer}
                onPress={() => openModal("COUNTRY")}
              >
                <View style={styles.fieldIconRow}>
                  <View
                    style={[
                      styles.fieldIcon,
                      { backgroundColor: `${colors.primary}15` },
                    ]}
                  >
                    <Ionicons
                      name="globe-outline"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.fieldContent}>
                    <Text
                      style={[styles.fieldLabel, { color: colors.textTertiary }]}
                    >
                      Country
                    </Text>
                    <View style={styles.selectRow}>
                      <Text
                        style={[
                          styles.selectText,
                          {
                            color: selectedCountryId
                              ? colors.text
                              : colors.textTertiary,
                          },
                        ]}
                      >
                        {selectedCountryName || "Select Country"}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </View>
                  </View>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* City Selector */}
              <Pressable
                style={styles.fieldContainer}
                onPress={() => openModal("CITY")}
              >
                <View style={styles.fieldIconRow}>
                  <View
                    style={[
                      styles.fieldIcon,
                      { backgroundColor: `${colors.primary}15` },
                    ]}
                  >
                    <Ionicons
                      name="business-outline"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.fieldContent}>
                    <Text
                      style={[styles.fieldLabel, { color: colors.textTertiary }]}
                    >
                      City
                    </Text>
                    <View style={styles.selectRow}>
                      <Text
                        style={[
                          styles.selectText,
                          {
                            color: selectedCityId
                              ? colors.text
                              : colors.textTertiary,
                          },
                        ]}
                      >
                        {resolvingLocation
                          ? "Loading city..."
                          : selectedCityName ||
                            (selectedCountryId
                              ? "Select City"
                              : "Please select country first")}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </View>
                  </View>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* District Selector */}
              <Pressable
                style={styles.fieldContainer}
                onPress={() => openModal("DISTRICT")}
              >
                <View style={styles.fieldIconRow}>
                  <View
                    style={[
                      styles.fieldIcon,
                      { backgroundColor: `${colors.primary}15` },
                    ]}
                  >
                    <Ionicons
                      name="map-outline"
                      size={18}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.fieldContent}>
                    <Text
                      style={[styles.fieldLabel, { color: colors.textTertiary }]}
                    >
                      District
                    </Text>
                    <View style={styles.selectRow}>
                      <Text
                        style={[
                          styles.selectText,
                          {
                            color: district
                              ? colors.text
                              : colors.textTertiary,
                          },
                        ]}
                      >
                        {resolvingLocation
                          ? "Loading district..."
                          : districtName ||
                            (selectedCityId
                              ? "Select District"
                              : "Please select city first")}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </View>
                  </View>
                </View>
              </Pressable>

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              {/* Postal Code */}
              <FormField
                label="Postal Code"
                placeholder="e.g. 34710"
                value={postalCode}
                onChangeText={setPostalCode}
                colors={colors}
                icon="mail-outline"
                keyboardType="number-pad"
                isLast
              />
            </View>
          </AnimatedView>

          {/* Corporate Fields */}
          {isCorpo && (
            <AnimatedView entering={FadeInDown.delay(50).springify()}>
              <Text
                style={[styles.sectionTitle, { color: colors.textTertiary }]}
              >
                COMPANY DETAILS
              </Text>
              <View
                style={[
                  styles.formCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <FormField
                  label="Company Name"
                  placeholder="Enter company name"
                  value={companyName}
                  onChangeText={setCompanyName}
                  colors={colors}
                  icon="business-outline"
                />

                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />

                <FormField
                  label="Tax Number"
                  placeholder="Enter tax number"
                  value={taxNumber}
                  onChangeText={setTaxNumber}
                  colors={colors}
                  icon="document-text-outline"
                  keyboardType="number-pad"
                />

                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />

                <FormField
                  label="Tax Office"
                  placeholder="Enter tax office"
                  value={taxOffice}
                  onChangeText={setTaxOffice}
                  colors={colors}
                  icon="reader-outline"
                  isLast
                />
              </View>
            </AnimatedView>
          )}

          {/* Default Switch */}
          <AnimatedView entering={FadeInDown.delay(180).springify()}>
            <View
              style={[
                styles.defaultRow,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <View style={styles.defaultInfo}>
                <View
                  style={[
                    styles.fieldIcon,
                    { backgroundColor: `${colors.primary}15` },
                  ]}
                >
                  <Ionicons
                    name="star-outline"
                    size={18}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.defaultLabel, { color: colors.text }]}>
                    Default Address
                  </Text>
                  <Text
                    style={[
                      styles.defaultHint,
                      { color: colors.textTertiary },
                    ]}
                  >
                    This address will be used for billing and delivery
                  </Text>
                </View>
              </View>
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                trackColor={{
                  false: colors.border,
                  true: `${colors.primary}80`,
                }}
                thumbColor={isDefault ? colors.primary : "#f4f4f4"}
              />
            </View>
          </AnimatedView>

          {/* Save Button */}
          <AnimatedView entering={FadeInDown.delay(240).springify()}>
            <Pressable
              style={[
                styles.saveButton,
                { shadowColor: colors.primary },
                saving && { opacity: 0.7 },
              ]}
              onPress={handleSave}
              disabled={saving}
            >
              <LinearGradient
                colors={[colors.primary, "#1a9f70"]}
                style={styles.saveGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color="#fff"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.saveText}>Save Address</Text>
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </AnimatedView>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    )}

      {/* Generic Selection Modal */}
      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableWithoutFeedback
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={[styles.modalContent, { backgroundColor: colors.card }]}
              >
                <View style={styles.modalHandle} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>
                  {modalMode === "COUNTRY"
                    ? "Select Country"
                    : modalMode === "CITY"
                      ? "Select City"
                      : "Select District"}
                </Text>

                <View
                  style={[
                    styles.searchContainer,
                    {
                      backgroundColor: colors.inputBackground,
                      borderColor: colors.inputBorder,
                    },
                  ]}
                >
                  <Ionicons
                    name="search"
                    size={18}
                    color={colors.textTertiary}
                    style={{ marginRight: 8 }}
                  />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder={
                      modalMode === "COUNTRY"
                        ? "Search country..."
                        : modalMode === "CITY"
                          ? "Search city..."
                          : "Search district..."
                    }
                    placeholderTextColor={colors.textTertiary}
                    value={searchText}
                    onChangeText={setSearchText}
                    autoFocus
                  />
                  {searchText.length > 0 && (
                    <Pressable onPress={() => setSearchText("")}>
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={colors.textTertiary}
                      />
                    </Pressable>
                  )}
                </View>

                <ScrollView
                  style={styles.modalList}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredItems.map((item, idx) => {
                    let isSelected = false;
                    if (modalMode === "COUNTRY")
                      isSelected = selectedCountryId === item.id;
                    else if (modalMode === "CITY")
                      isSelected = selectedCityId === item.id;
                    else if (modalMode === "DISTRICT")
                      isSelected = district === item.id;

                    return (
                      <Pressable
                        key={item.id}
                        style={({ pressed }) => [
                          styles.modalOption,
                          {
                            borderBottomColor: colors.border,
                            backgroundColor: pressed
                              ? colors.backgroundSecondary
                              : "transparent",
                          },
                          idx === filteredItems.length - 1 && {
                            borderBottomWidth: 0,
                          },
                        ]}
                        onPress={() => {
                          if (modalMode === "COUNTRY")
                            handleCountrySelect(item.id, item.name);
                          else if (modalMode === "CITY")
                            handleCitySelect(item.id, item.name);
                          else if (modalMode === "DISTRICT") {
                            setDistrict(item.id);
                            setDistrictName(item.name);
                          }
                          setModalVisible(false);
                          setSearchText("");
                        }}
                      >
                        <Text
                          style={[
                            styles.modalOptionText,
                            { color: colors.text },
                            isSelected && {
                              color: colors.primary,
                              fontWeight: "700",
                            },
                          ]}
                        >
                          {item.name}
                        </Text>
                        {isSelected && (
                          <Ionicons
                            name="checkmark"
                            size={20}
                            color={colors.primary}
                          />
                        )}
                      </Pressable>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <View style={styles.noResult}>
                      <Text
                        style={[
                          styles.noResultText,
                          { color: colors.textTertiary },
                        ]}
                      >
                        No results found
                      </Text>
                    </View>
                  )}
                </ScrollView>
              </KeyboardAvoidingView>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function FormField({
  label,
  placeholder,
  value,
  onChangeText,
  colors,
  icon,
  multiline,
  keyboardType,
  isLast,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  colors: any;
  icon: string;
  multiline?: boolean;
  keyboardType?: any;
  isLast?: boolean;
}) {
  return (
    <View style={styles.fieldContainer}>
      <View style={styles.fieldIconRow}>
        <View
          style={[
            styles.fieldIcon,
            { backgroundColor: `${colors.primary}15` },
          ]}
        >
          <Ionicons name={icon as any} size={18} color={colors.primary} />
        </View>
        <View style={styles.fieldContent}>
          <Text style={[styles.fieldLabel, { color: colors.textTertiary }]}>
            {label}
          </Text>
          <TextInput
            style={[
              styles.fieldInput,
              { color: colors.text },
              multiline && { minHeight: 56, textAlignVertical: "top" },
            ]}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            value={value}
            onChangeText={onChangeText}
            multiline={multiline}
            keyboardType={keyboardType}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    padding: 20,
  },

  // Section Title
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginLeft: 4,
    marginTop: 8,
  },

  // Type Selector
  typeRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  typeCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    position: "relative",
  },
  typeLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 8,
  },
  typeCheckmark: {
    position: "absolute",
    top: 10,
    right: 10,
  },

  // Form Card
  formCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  fieldContainer: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldIconRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  fieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    marginTop: 2,
  },
  fieldContent: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  fieldInput: {
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 4,
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  selectText: {
    fontSize: 16,
    fontWeight: "500",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 64,
  },

  // Default Row
  defaultRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 24,
  },
  defaultInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginRight: 12,
  },
  defaultLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  defaultHint: {
    fontSize: 12,
  },

  // Save Button
  saveButton: {
    borderRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  saveGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    borderRadius: 16,
  },
  saveText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },

  // Modal
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
    height: "90%",
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
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 2,
  },
  modalList: {
    paddingHorizontal: 20,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalOptionText: {
    fontSize: 16,
    fontWeight: "500",
  },
  noResult: {
    alignItems: "center",
    paddingVertical: 32,
  },
  noResultText: {
    fontSize: 15,
  },
});
