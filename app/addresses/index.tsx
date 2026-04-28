import { useTheme } from "@/context/ThemeContext";
import {
  Address,
  deleteAddress,
  getAddresses,
  patchAddress,
} from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedView = Animated.createAnimatedComponent(View);
const AnimatedText = Animated.createAnimatedComponent(Text);
const AnimatedIonicons = Animated.createAnimatedComponent(Ionicons) as any;

if (Platform.OS === "android") {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

export default function AddressesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAddresses = async () => {
    try {
      const response = await getAddresses();
      let list: Address[] = [];
      if (response?.data && Array.isArray(response.data.results)) {
        list = response.data.results;
      } else if (Array.isArray(response?.results)) {
        list = response.results;
      } else if (Array.isArray(response)) {
        list = response;
      }
      // Sort: default first
      list.sort((a, b) => (b.is_default ? 1 : 0) - (a.is_default ? 1 : 0));
      setAddresses(list);
    } catch (error) {
      console.error("Failed to fetch addresses", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchAddresses();
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchAddresses();
  };

  const handleSetDefault = async (uuid: string) => {
    try {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      await patchAddress(uuid, { is_default: true });
      await fetchAddresses();
    } catch (error) {
      Alert.alert("Error", "Failed to change default address.");
    }
  };

  const handleDelete = (uuid: string) => {
    Alert.alert("Delete Address", "Are you sure you want to delete this address?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteAddress(uuid);
            setAddresses((prev) => prev.filter((a) => a.uuid !== uuid));
          } catch (error) {
            Alert.alert("Error", "Failed to delete address.");
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: "My Addresses",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: "Profile",
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : addresses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View
            style={[
              styles.emptyIconCircle,
              { backgroundColor: colors.backgroundSecondary },
            ]}
          >
            <Ionicons
              name="location-outline"
              size={56}
              color={colors.textTertiary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No addresses yet
          </Text>
          <Text style={[styles.emptySubText, { color: colors.textTertiary }]}>
            Add an address for billing and delivery purposes.
          </Text>
          <Pressable
            style={[styles.emptyAddButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/addresses/add")}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.emptyAddButtonText}>Add Address</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {addresses.map((item, index) => (
              <AddressCard
                key={item.id}
                item={item}
                index={index}
                colors={colors}
                onSetDefault={handleSetDefault}
                onEdit={(itemToEdit) => {
                  const distObj: any = typeof itemToEdit.district === "object" ? itemToEdit.district : {};
                  const distName = distObj?.name || itemToEdit.district_name;
                  const cityName = distObj?.city?.name || itemToEdit.city_name;
                  const countryName = distObj?.city?.country?.name || itemToEdit.country_name;

                  router.push({
                    pathname: "/addresses/add",
                    params: {
                      uuid: itemToEdit.uuid,
                      countryNameParam: countryName,
                      cityNameParam: cityName,
                      districtNameParam: distName,
                    },
                  });
                }}
                onDelete={handleDelete}
              />
            ))}
            {/* Spacer for FAB */}
            <View style={{ height: 100 }} />
          </ScrollView>

          <Pressable
            style={[styles.addButton, { shadowColor: colors.primary }]}
            onPress={() => router.push("/addresses/add")}
          >
            <LinearGradient
              colors={[colors.primary, "#1a9f70"]}
              style={styles.gradientButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.addButtonText}>Add New Address</Text>
            </LinearGradient>
          </Pressable>
        </>
      )}
    </View>
  );
}

function AddressCard({
  item,
  index,
  colors,
  onSetDefault,
  onEdit,
  onDelete,
}: {
  item: Address;
  index: number;
  colors: any;
  onSetDefault: (uuid: string) => void;
  onEdit: (item: Address) => void;
  onDelete: (uuid: string) => void;
}) {
  const isDefault = item.is_default;
  const isCorpo = item.type === "CORPORATE";

  const progress = useDerivedValue(() => {
    return withTiming(isDefault ? 1 : 0, { duration: 350 });
  }, [isDefault]);

  const containerStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(progress.value, [0, 1], [
      colors.card,
      colors.primary,
    ]);
    const borderColor = interpolateColor(progress.value, [0, 1], [
      colors.border,
      colors.primary,
    ]);
    return { backgroundColor, borderColor };
  });

  const textStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, [0, 1], [
      colors.text,
      "#ffffff",
    ]);
    return { color };
  });

  const subTextStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, [0, 1], [
      colors.textSecondary,
      "rgba(255,255,255,0.8)",
    ]);
    return { color };
  });

  const iconBgStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(progress.value, [0, 1], [
      colors.backgroundSecondary,
      "rgba(255,255,255,0.2)",
    ]);
    return { backgroundColor };
  });

  const iconStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, [0, 1], [
      colors.primary,
      "#ffffff",
    ]);
    return { color };
  });

  const infoBoxBgStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(progress.value, [0, 1], [
      "rgba(150,150,150,0.06)",
      "rgba(255,255,255,0.15)",
    ]);
    return { backgroundColor };
  });

  const detailIconStyle = useAnimatedStyle(() => {
    const color = interpolateColor(progress.value, [0, 1], [
      colors.textTertiary,
      "rgba(255,255,255,0.8)",
    ]);
    return { color };
  });

  return (
    <AnimatedView
      entering={FadeInDown.delay(index * 80).springify()}
      exiting={FadeOutUp.duration(300)}
      layout={LinearTransition}
      style={[styles.card, containerStyle]}
    >
      {/* Top Row */}
      <View style={styles.cardTop}>
        <AnimatedView style={[styles.cardIconCircle, iconBgStyle]}>
          <AnimatedIonicons
            name={isCorpo ? "business" : "home"}
            size={22}
            style={iconStyle}
          />
        </AnimatedView>
        <View style={styles.cardTitleBlock}>
          <AnimatedText style={[styles.cardTitle, textStyle]}>
            {item.title || "My Address"}
          </AnimatedText>
          <View style={styles.cardBadgeRow}>
            <AnimatedView
              style={[
                styles.typeBadge,
                {
                  backgroundColor: isDefault
                    ? "rgba(255,255,255,0.2)"
                    : isCorpo
                      ? "rgba(88,86,214,0.12)"
                      : "rgba(44,221,157,0.12)",
                },
              ]}
            >
              <AnimatedText
                style={[
                  styles.typeBadgeText,
                  {
                    color: isDefault
                      ? "#fff"
                      : isCorpo
                        ? "#5856D6"
                        : colors.primary,
                  },
                ]}
              >
                {isCorpo ? "Corporate" : "Individual"}
              </AnimatedText>
            </AnimatedView>
            {isDefault && (
              <View style={styles.defaultBadge}>
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#fff"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.defaultBadgeText}>Default</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Address Detail */}
      <View style={{ marginBottom: 14 }}>
        <AnimatedText
          style={[styles.cardAddress, textStyle]}
          numberOfLines={2}
        >
          {item.address}
        </AnimatedText>
      </View>

      <AnimatedView style={[styles.infoBox, infoBoxBgStyle]}>
        {(() => {
          const distObj: any = typeof item.district === "object" ? item.district : {};
          const distName = distObj?.name || item.district_name;
          const cityName = distObj?.city?.name || item.city_name;
          const countryName = distObj?.city?.country?.name || item.country_name;

          if (distName || cityName || countryName) {
            return (
              <View style={styles.infoRow}>
                <AnimatedIonicons
                  name="location"
                  size={15}
                  style={[styles.infoIcon, detailIconStyle]}
                />
                <AnimatedText style={[styles.infoText, subTextStyle]}>
                  {[distName, cityName, countryName].filter(Boolean).join(", ")}
                </AnimatedText>
              </View>
            );
          }
          return null;
        })()}

        {item.postal_code ? (
          <View style={styles.infoRow}>
            <AnimatedIonicons
              name="mail"
              size={15}
              style={[styles.infoIcon, detailIconStyle]}
            />
            <AnimatedText style={[styles.infoText, subTextStyle]}>
              {item.postal_code}
            </AnimatedText>
          </View>
        ) : null}

        {isCorpo && item.company_name ? (
          <View style={styles.infoRow}>
            <AnimatedIonicons
              name="business"
              size={15}
              style={[styles.infoIcon, detailIconStyle]}
            />
            <AnimatedText style={[styles.infoText, subTextStyle]}>
              {item.company_name}
              {item.tax_number ? ` • Tax ID: ${item.tax_number}` : ""}
            </AnimatedText>
          </View>
        ) : null}
      </AnimatedView>

      {/* Actions Row */}
      <View
        style={[
          styles.cardActions,
          {
            borderTopColor: isDefault
              ? "rgba(255,255,255,0.2)"
              : colors.border,
          },
        ]}
      >
        {!isDefault ? (
          <Pressable
            onPress={() => onSetDefault(item.uuid)}
            style={({ pressed }) => [
              styles.actionBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Ionicons
              name="checkmark-circle-outline"
              size={18}
              color={colors.primary}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.actionText, { color: colors.primary }]}>
              Set as Default
            </Text>
          </Pressable>
        ) : (
          <View style={styles.actionBtn}>
            <Ionicons
              name="checkmark-done"
              size={18}
              color="rgba(255,255,255,0.7)"
              style={{ marginRight: 6 }}
            />
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: "600" }}>
              Default Address
            </Text>
          </View>
        )}
        <View style={styles.actionRightRow}>
          <Pressable
            onPress={() => onEdit(item)}
            style={({ pressed }) => [
              styles.editBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <AnimatedIonicons
              name="create-outline"
              size={20}
              style={isDefault ? { color: "rgba(255,255,255,0.8)" } : { color: colors.textSecondary }}
            />
          </Pressable>
          <Pressable
            onPress={() => onDelete(item.uuid)}
            style={({ pressed }) => [
              styles.deleteBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <AnimatedIonicons
              name="trash-outline"
              size={20}
              style={isDefault ? { color: "rgba(255,255,255,0.8)" } : { color: colors.danger }}
            />
          </Pressable>
        </View>
      </View>
    </AnimatedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    marginTop: -40,
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
  },
  emptySubText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  emptyAddButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyAddButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 8,
  },

  // Card
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  cardIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  cardTitleBlock: { flex: 1 },
  cardTitle: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 4,
  },
  cardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  defaultBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  defaultBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  cardAddress: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  infoBox: {
    borderRadius: 12,
    padding: 12,
    gap: 8,
    marginBottom: 2,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoIcon: {
    marginTop: 2,
    marginRight: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    marginTop: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  actionRightRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  editBtn: {
    padding: 4,
  },
  deleteBtn: {
    padding: 4,
  },

  // FAB
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
});
