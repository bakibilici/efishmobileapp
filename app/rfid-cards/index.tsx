import { useTheme } from "@/context/ThemeContext";
import { deleteRfidRequest, getRfidCards, getRfidRequests, RfidCard } from "@/services/api";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";

const AnimatedView = Animated.createAnimatedComponent(View);

export default function RfidCardsScreen() {
  const router = useRouter();
  const { colors } = useTheme();

  const [activeTab, setActiveTab] = useState<"CARDS" | "REQUESTS">("CARDS");
  const tabProgress = useSharedValue(0);
  const [cards, setCards] = useState<RfidCard[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [cardsRes, reqsRes] = await Promise.all([
        getRfidCards().catch((e) => {
          console.error("Failed to fetch RFID cards", e);
          return [];
        }),
        getRfidRequests().catch((e) => {
          console.error("Failed to fetch RFID requests", e);
          return [];
        }),
      ]);

      let cList = [];
      if (cardsRes?.data && Array.isArray(cardsRes.data.results)) {
        cList = cardsRes.data.results;
      } else if (Array.isArray(cardsRes?.results)) {
        cList = cardsRes.results;
      } else if (Array.isArray(cardsRes)) {
        cList = cardsRes;
      }
      setCards(cList);

      let rList = [];
      if (reqsRes?.data && Array.isArray(reqsRes.data.results)) {
        rList = reqsRes.data.results;
      } else if (Array.isArray(reqsRes?.results)) {
        rList = reqsRes.results;
      } else if (Array.isArray(reqsRes)) {
        rList = reqsRes;
      }
      setRequests(rList);
    } catch (error) {
      console.error("Failed to fetch RFID data", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, []),
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const toggleTab = (tab: "CARDS" | "REQUESTS") => {
    setActiveTab(tab);
    tabProgress.value = withSpring(tab === "CARDS" ? 0 : 1, {
      damping: 25,
      stiffness: 120,
      mass: 0.8,
    });
  };

  const indicatorStyle = useAnimatedStyle(() => {
    return {
      left: `${tabProgress.value * 50}%`,
    };
  });

  const handleCancelRequest = (uuid: string) => {
    Alert.alert(
      "Cancel Request",
      "Are you sure you want to cancel this RFID card request?",
      [
        { text: "No", style: "cancel" },
        {
          text: "Yes, Cancel",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteRfidRequest(uuid);
              setRequests((prev) => prev.filter((r) => r.uuid !== uuid));
            } catch (error) {
              console.error("Failed to cancel request", error);
              Alert.alert("Error", "Failed to cancel the request. Please try again.");
            }
          },
        },
      ],
    );
  };

  const getStatusColor = (item: RfidCard | any) => {
    if (!item || typeof item !== "object") return "#8E8E93";

    // For My Cards, we use is_active
    if ("is_active" in item && activeTab === "CARDS") {
      return item.is_active ? "#34C759" : "#FF3B30";
    }

    // For Requests, use status string
    const status = item.status?.toLowerCase();
    switch (status) {
      case "active":
      case "delivered":
        return "#34C759";
      case "pending":
        return "#FF9500";
      case "inactive":
      case "disabled":
        return "#FF3B30";
      case "shipped":
        return "#007AFF";
      default:
        return "#8E8E93";
    }
  };

  const getStatusLabel = (item: RfidCard | any) => {
    if (!item || typeof item !== "object") return "Unknown";

    if ("is_active" in item && activeTab === "CARDS") {
      return item.is_active ? "Active" : "Inactive";
    }
    const status = item.status_display || item.status || "Unknown";
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          headerTitle: "RFID Hub",
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerBackTitle: "Profile",
        }}
      />

      {/* Tab Switcher */}
      <View style={styles.tabWrapper}>
        <View
          style={[
            styles.tabContainer,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <Animated.View
            style={[
              styles.tabIndicator,
              {
                backgroundColor: colors.card,
                shadowColor: "#000",
                borderColor: colors.background === "#ffffff" ? "transparent" : "rgba(255,255,255,0.08)",
                borderWidth: colors.background === "#ffffff" ? 0 : 1,
                shadowOpacity: colors.background === "#ffffff" ? 0.1 : 0.3,
              },
              indicatorStyle,
            ]}
          />
          <Pressable style={styles.tab} onPress={() => toggleTab("CARDS")}>
            <Text
              style={[
                styles.tabText,
                {
                  color: activeTab === "CARDS" ? colors.text : colors.textTertiary,
                  fontWeight: activeTab === "CARDS" ? "700" : "500",
                },
              ]}
            >
              My Cards
            </Text>
          </Pressable>
          <Pressable style={styles.tab} onPress={() => toggleTab("REQUESTS")}>
            <Text
              style={[
                styles.tabText,
                {
                  color:
                    activeTab === "REQUESTS" ? colors.text : colors.textTertiary,
                  fontWeight: activeTab === "REQUESTS" ? "700" : "500",
                },
              ]}
            >
              Requests
            </Text>
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <Animated.View
          key={activeTab}
          entering={FadeInDown.duration(300)}
          style={{ flex: 1 }}
        >
          {activeTab === "CARDS" ? (
            cards.length === 0 ? (
              <View style={styles.emptyContainer}>
                {/* Premium empty state illustration */}
                <View
                  style={[
                    styles.emptyCardStack,
                    { backgroundColor: colors.card }, // use subtle card
                  ]}
                >
                  <View
                    style={[
                      styles.emptyCard1,
                      {
                        backgroundColor: colors.backgroundSecondary,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.emptyCard2,
                      {
                        backgroundColor: colors.backgroundSecondary,
                        borderColor: colors.border,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.emptyMainCard,
                      {
                        backgroundColor: colors.backgroundSecondary,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Ionicons
                      name="wifi-outline"
                      size={40}
                      color={colors.textTertiary}
                    />
                    <View style={styles.emptyCardLines}>
                      <View
                        style={[
                          styles.emptyLine,
                          { backgroundColor: colors.border, width: 80 },
                        ]}
                      />
                      <View
                        style={[
                          styles.emptyLine,
                          { backgroundColor: colors.border, width: 50 },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No RFID Cards
                </Text>
                <Text style={[styles.emptySubText, { color: colors.textTertiary }]}>
                  Request an RFID card to start charging your vehicle with a simple
                  tap.
                </Text>

              </View>
            ) : (
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


                {cards.map((card, index) => {
                  const statusColor = getStatusColor(card);
                  const vehicle = card.registered_vehicle;
                  const vehicleName = vehicle?.vehicle?.model?.brand?.name && vehicle?.vehicle?.model?.name
                    ? `${vehicle.vehicle.model.brand.name} ${vehicle.vehicle.model.name}`
                    : "No linked vehicle";

                  return (
                    <AnimatedView
                      key={card.id}
                      entering={FadeInDown.delay(index * 80 + 60).springify()}
                      exiting={FadeOutUp.duration(300)}
                      layout={LinearTransition}
                      style={[
                        styles.card,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {/* Card Visual */}
                      <LinearGradient
                        colors={
                          card.is_active
                            ? [colors.primary, "#1a9f70"]
                            : ["#636366", "#48484A"]
                        }
                        style={styles.cardVisual}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        {/* NFC waves icon */}
                        <View style={styles.cardVisualTop}>
                          <Ionicons
                            name="wifi"
                            size={20}
                            color="rgba(255,255,255,0.6)"
                            style={{ transform: [{ rotate: "90deg" }] }}
                          />
                          <Text style={styles.cardBrand}>efish</Text>
                        </View>

                        {/* Card ID */}
                        <Text style={styles.cardNumber}>
                          {card.card_id
                            ? card.card_id.match(/.{1,4}/g)?.join("  ")
                            : "•••• ••••"}
                        </Text>

                        {/* IN-CARD VEHICLE INFO */}
                        {vehicle && (
                          <View style={styles.cardVisualVehicle}>
                            {vehicle?.plate_number && (
                              <View style={styles.cardVisualPlate}>
                                <Text style={styles.cardVisualPlateText}>{vehicle.plate_number}</Text>
                              </View>
                            )}
                            <Text style={styles.cardVisualVehicleName} numberOfLines={1}>
                              {vehicleName}
                            </Text>
                          </View>
                        )}
                      </LinearGradient>

                      {/* Card Info Section */}
                      <View style={styles.cardFullInfo}>
                        {/* Footer Row (Status & Date) */}
                        <View style={styles.cardInfoRow}>
                          <View style={styles.cardInfoLeft}>
                            <Text style={[styles.cardLabel, { color: colors.textTertiary }]}>Status</Text>
                            <View style={styles.statusRow}>
                              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                              <Text style={[styles.statusText, { color: statusColor }]}>
                                {getStatusLabel(card)}
                              </Text>
                            </View>
                          </View>
                          <View style={styles.cardInfoRight}>
                            <Text style={[styles.cardLabel, { color: colors.textTertiary }]}>Added On</Text>
                            <Text style={[styles.cardDate, { color: colors.text }]}>
                              {card.created_at
                                ? new Date(card.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                : "—"}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </AnimatedView>
                  );
                })}

                {/* Spacer for FAB */}
                <View style={{ height: 100 }} />
              </ScrollView>
            )
          ) : requests.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons
                name="cube-outline"
                size={60}
                color={colors.textTertiary}
                style={{ marginBottom: 20 }}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No Requests
              </Text>
              <Text
                style={[styles.emptySubText, { color: colors.textTertiary }]}
              >
                You haven't requested any RFID cards yet.
              </Text>
            </View>
          ) : (
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
              {requests.map((req, index) => {
                const statusColor = getStatusColor(req);
                return (
                  <AnimatedView
                    key={req.id}
                    entering={FadeInDown.delay(index * 80).springify()}
                    exiting={FadeOutUp.duration(300)}
                    layout={LinearTransition}
                    style={[
                      styles.reqCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={[styles.reqHeader, { borderBottomColor: colors.border }]}>
                      <View style={styles.reqHeaderLeft}>
                        <View style={[styles.reqIconBox, { backgroundColor: `${colors.primary}` }]}>
                          <Ionicons name="card-outline" size={18} color="#ffffff" />
                        </View>
                        <Text style={[styles.reqTitle, { color: colors.text }]}>
                          Request #{req.id}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.reqStatusBadge,
                          { backgroundColor: `${statusColor}15` },
                        ]}
                      >
                        <Text style={[styles.reqStatusText, { color: statusColor }]}>
                          {getStatusLabel(req)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.reqBody}>
                      {/* Meta Grid */}
                      <View style={[styles.reqMetaGrid, { backgroundColor: "rgba(150,150,150,0.06)" }]}>
                        <View style={styles.reqMetaItem}>
                          <Ionicons name="layers" size={16} color={colors.textTertiary} />
                          <View style={styles.reqMetaTextCol}>
                            <Text style={[styles.reqMetaLabel, { color: colors.textTertiary }]}>Quantity</Text>
                            <Text style={[styles.reqMetaValue, { color: colors.text }]}>{req.quantity} Cards</Text>
                          </View>
                        </View>
                        <View style={styles.reqMetaDivider} />
                        <View style={styles.reqMetaItem}>
                          <Ionicons name="calendar" size={16} color={colors.textTertiary} />
                          <View style={styles.reqMetaTextCol}>
                            <Text style={[styles.reqMetaLabel, { color: colors.textTertiary }]}>Requested On</Text>
                            <Text style={[styles.reqMetaValue, { color: colors.text }]}>
                              {req.created_at ? new Date(req.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Delivery Address */}
                      {req.delivery_address && (
                        <View style={[styles.reqFeatureBox, { backgroundColor: "rgba(150,150,150,0.04)" }]}>
                          <View style={styles.reqFeatureHeader}>
                            <Ionicons name="location" size={14} color={colors.textTertiary} />
                            <Text style={[styles.reqFeatureTitle, { color: colors.textTertiary }]}>Delivery Address</Text>
                          </View>
                          <Text style={[styles.reqFeatureContent, { color: colors.text }]}>
                            <Text style={{ fontWeight: "600" }}>{req.delivery_address.title}</Text> • {req.delivery_address.address}
                            {req.delivery_address.district?.city?.name ? `, ${req.delivery_address.district.city.name}` : ""}
                          </Text>
                        </View>
                      )}

                      {/* Linked Vehicles */}
                      {req.registered_vehicles && req.registered_vehicles.length > 0 && (
                        <View style={[styles.reqFeatureBox, { backgroundColor: "rgba(150,150,150,0.04)", marginTop: 8 }]}>
                          <View style={styles.reqFeatureHeader}>
                            <Ionicons name="car" size={14} color={colors.textTertiary} />
                            <Text style={[styles.reqFeatureTitle, { color: colors.textTertiary }]}>Linked Vehicles</Text>
                          </View>
                          <View style={styles.reqVehicleList}>
                            {req.registered_vehicles.map((vh: any) => (
                              <View key={vh.id} style={styles.reqVehicleRow}>
                                <View style={[styles.reqPlateBadge, { borderColor: colors.border, backgroundColor: colors.card }]}>
                                  <Text style={[styles.reqPlateText, { color: colors.text }]}>{vh.plate_number}</Text>
                                </View>
                                <Text style={[styles.reqVehicleName, { color: colors.textSecondary }]} numberOfLines={1}>
                                  {vh.vehicle?.model?.brand?.name} {vh.vehicle?.model?.name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Shipment Tracking */}
                      {req.shipment_company && (
                        <View style={[styles.reqShipmentBox, { backgroundColor: `${statusColor}10`, borderColor: `${statusColor}30` }]}>
                          <Ionicons name="cube" size={20} color={statusColor} />
                          <View style={styles.reqShipmentTextCol}>
                            <Text style={[styles.reqShipmentLabel, { color: statusColor }]}>Shipped via {req.shipment_company}</Text>
                            <Text style={[styles.reqShipmentValue, { color: statusColor }]} selectable>
                              Tracking: <Text style={{ fontWeight: "700" }}>{req.shipment_number}</Text>
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Cancel Button - Only for PENDING */}
                      {req.status === "PENDING" && (
                        <Pressable
                          onPress={() => handleCancelRequest(req.uuid)}
                          style={({ pressed }) => [
                            styles.reqCancelBtn,
                            { borderColor: "#FF3B3030" },
                            pressed && { backgroundColor: "#FF3B3010" },
                          ]}
                        >
                          <Ionicons name="close-circle-outline" size={18} color="#FF3B30" />
                          <Text style={styles.reqCancelText}>Cancel Request</Text>
                        </Pressable>
                      )}
                    </View>
                  </AnimatedView>
                );
              })}
              <View style={{ height: 100 }} />
            </ScrollView>
          )}

          {/* Global Action Button */}
          <Pressable
            style={[styles.addButton, { shadowColor: colors.primary }]}
            onPress={() => router.push("/rfid-cards/request")}
          >
            <LinearGradient
              colors={[colors.primary, "#1a9f70"]}
              style={styles.gradientButton}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="add" size={24} color="#fff" />
              <Text style={styles.addButtonText}>Request RFID Card</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      )}
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
  listContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Info Banner
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    borderRadius: 14,
    marginBottom: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  // Tabs
  tabWrapper: {
    paddingHorizontal: 20,
    marginTop: 10,
    marginBottom: 5,
  },
  tabContainer: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 4,
    position: "relative",
  },
  tabIndicator: {
    position: "absolute",
    width: "50%",
    top: 4,
    bottom: 4,
    borderRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  tabText: {
    fontSize: 14,
  },

  // Empty State
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    marginTop: -40,
  },
  emptyCardStack: {
    width: 160,
    height: 120,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 32,
    position: "relative",
  },
  emptyCard1: {
    position: "absolute",
    width: 100,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    top: 12,
    transform: [{ rotate: "-8deg" }],
  },
  emptyCard2: {
    position: "absolute",
    width: 100,
    height: 64,
    borderRadius: 10,
    borderWidth: 1,
    top: 16,
    transform: [{ rotate: "4deg" }],
  },
  emptyMainCard: {
    width: 110,
    height: 70,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  emptyCardLines: {
    marginTop: 6,
    gap: 4,
  },
  emptyLine: {
    height: 3,
    borderRadius: 1.5,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 10,
  },
  emptySubText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 28,
  },
  emptyRequestBtn: {
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
    borderRadius: 14,
  },
  emptyRequestBtnGradient: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyRequestBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Request Cards
  reqCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    overflow: "hidden",
  },
  reqHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reqHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  reqIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  reqTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginLeft: 10,
  },
  reqStatusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  reqStatusText: {
    fontSize: 12,
    fontWeight: "700",
  },
  reqBody: {
    padding: 16,
  },
  reqMetaGrid: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  reqMetaItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  reqMetaTextCol: {
    marginLeft: 10,
  },
  reqMetaLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
    fontWeight: "600",
  },
  reqMetaValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  reqMetaDivider: {
    width: 1,
    height: "100%",
    backgroundColor: "rgba(150,150,150,0.2)",
    marginHorizontal: 16,
  },
  reqFeatureBox: {
    borderRadius: 12,
    padding: 14,
  },
  reqFeatureHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reqFeatureTitle: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  reqFeatureContent: {
    fontSize: 14,
    lineHeight: 20,
    paddingLeft: 20,
  },
  reqVehicleList: {
    paddingLeft: 20,
    gap: 8,
  },
  reqVehicleRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reqPlateBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 10,
  },
  reqPlateText: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  reqVehicleName: {
    fontSize: 14,
    flex: 1,
  },
  reqShipmentBox: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  reqShipmentTextCol: {
    marginLeft: 12,
    flex: 1,
  },
  reqShipmentLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 2,
  },
  reqShipmentValue: {
    fontSize: 14,
  },
  reqCancelBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  reqCancelText: {
    color: "#FF3B30",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 8,
  },

  // Card
  card: {
    borderRadius: 20,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 20,
  },
  cardVisual: {
    padding: 20,
    paddingBottom: 18,
    minHeight: 170,
    justifyContent: "space-between",
  },
  cardVisualTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardBrand: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 1,
  },
  chipContainer: {
    marginTop: 16,
  },
  chip: {
    width: 40,
    height: 28,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.25)",
    padding: 4,
  },
  chipInner: {
    flex: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  cardNumber: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 2,
    marginTop: 14,
  },

  // Card Info
  cardInfoRow: {
    flexDirection: "row",
    padding: 16,
  },
  cardInfoLeft: {
    flex: 1,
  },
  cardInfoRight: {
    alignItems: "flex-end",
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  cardDate: {
    fontSize: 14,
    fontWeight: "500",
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

  // New Card Info Styles
  cardFullInfo: {
    paddingTop: 8,
  },
  cardSubSection: {
    padding: 16,
    paddingTop: 12,
  },
  cardFeatureHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  cardMetaLabel: {
    fontSize: 12,
    fontWeight: "700",
    marginLeft: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardVehicleDetail: {
    flexDirection: "row",
    alignItems: "center",
  },
  cardVehicleName: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  // In-Card Vehicle Styles
  cardVisualVehicle: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
  },
  cardVisualPlate: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderColor: "rgba(255,255,255,0.4)",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 10,
  },
  cardVisualPlateText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  cardVisualVehicleName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
});
