import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  Image as RNImage,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View,
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import Svg, { Circle, Path } from "react-native-svg";

import { Station, StationType, stations } from "@/constants/stations";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";

const typeColors: Record<StationType, string> = {
  HPC: "#7C4DFF",
  DC: "#FF8A1F",
  AC: "#4BACE4",
};
const typeLightningCount: Record<StationType, number> = {
  AC: 1,
  DC: 2,
  HPC: 3,
};

export default function MapScreen() {
  const router = useRouter();
  const navigation = useNavigation<any>();

  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<StationType[]>([
    "HPC",
    "DC",
    "AC",
  ]);
  const [onlyEfish, setOnlyEfish] = useState(true);
  const [showPublic, setShowPublic] = useState(true);
  const [showNearby, setShowNearby] = useState(true);
  const [userLocation, setUserLocation] =
    useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const mapRef = useRef<MapView>(null);
  const snapPoints = useMemo(() => ["32%", "55%"], []);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          setLocationPermission(true);
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setUserLocation(location);

          // Haritayı kullanıcı konumuna kaydır
          if (mapRef.current && location) {
            mapRef.current.animateToRegion({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            });
          }
        } else {
          setLocationPermission(false);
        }
      } catch (error) {
        console.error("Location error:", error);
        setLocationPermission(false);
      }
    })();
  }, []);

  const initialRegion: Region = useMemo(
    () => ({
      latitude: 41.015,
      longitude: 29.04,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    }),
    []
  );

  const filteredStations = useMemo(
    () =>
      stations.filter((station) => {
        const matchesType = typeFilters.includes(station.type);
        const matchesQuery = station.name
          .toLowerCase()
          .includes(search.toLowerCase().trim());
        const matchesNetwork = (onlyEfish && station.isEfish) || !onlyEfish;
        const matchesPublic = showPublic || station.isEfish;
        return matchesType && matchesQuery && matchesNetwork && matchesPublic;
      }),
    [search, typeFilters, onlyEfish, showPublic]
  );

  useFocusEffect(
    useCallback(() => {
      const parent = navigation.getParent();
      parent?.setOptions({
        tabBarStyle: selectedStation
          ? { display: "none" }
          : { borderTopColor: "transparent", backgroundColor: "#f9fdfb" },
      });
      return () =>
        parent?.setOptions({
          tabBarStyle: {
            borderTopColor: "transparent",
            backgroundColor: "#f9fdfb",
          },
        });
    }, [navigation, selectedStation])
  );

  const withAnimation = () => {
    try {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(
          220,
          LayoutAnimation.Types.easeInEaseOut,
          LayoutAnimation.Properties.opacity
        )
      );
    } catch (e) {
      // Ignore animation errors to avoid crashes on rapid toggle.
    }
  };

  const toggleType = (type: StationType) => {
    withAnimation();
    setTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleMarkerPress = (station: Station) => {
    setSelectedStation(station);
    bottomSheetRef.current?.present();
  };

  const closeSheet = () => {
    bottomSheetRef.current?.dismiss();
    setSelectedStation(null);
  };

  const openDirections = () => {
    if (!selectedStation) return;
    router.push({
      pathname: "/modal",
      params: {
        name: selectedStation.name,
        lat: String(selectedStation.latitude),
        lng: String(selectedStation.longitude),
      },
    });
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
  );

  const sortedTypes = useMemo(() => {
    const base: StationType[] = ["HPC", "DC", "AC"];
    return [...base].sort((a, b) => {
      const aSel = typeFilters.includes(a);
      const bSel = typeFilters.includes(b);
      if (aSel !== bSel) return aSel ? -1 : 1;
      return a.localeCompare(b);
    });
  }, [typeFilters]);

  const { orderedTypes, orderedToggles } = useMemo(() => {
    const typeOrder: StationType[] = ["AC", "DC", "HPC"];
    const types = (["HPC", "DC", "AC"] as StationType[]).map((type) => {
      return {
        key: `type-${type}`,
        label: type,
        color: typeColors[type],
        active: typeFilters.includes(type),
        kind: "type" as const,
        lightningCount: typeLightningCount[type],
        onPress: () => toggleType(type),
      };
    });

    const toggles = [
      {
        key: "onlyEfish",
        label: "Only efish",
        color: "#2cdb9b",
        icon: "flash",
        active: onlyEfish,
        kind: "toggle" as const,
        onPress: () => {
          withAnimation();
          setOnlyEfish((v) => !v);
        },
      },
      {
        key: "public",
        label: "Public",
        color: "#2cdb9b",
        icon: "globe",
        active: showPublic,
        kind: "toggle" as const,
        onPress: () => {
          withAnimation();
          setShowPublic((v) => !v);
        },
      },
      {
        key: "nearby",
        label: "Nearby",
        color: "#2cdb9b",
        icon: "locate",
        active: showNearby,
        kind: "toggle" as const,
        onPress: () => {
          withAnimation();
          setShowNearby((v) => !v);
        },
      },
    ];

    const orderedTypes = [...types].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return (
        typeOrder.indexOf(a.label as StationType) -
        typeOrder.indexOf(b.label as StationType)
      );
    });

    const orderedToggles = [...toggles].sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return a.label.localeCompare(b.label);
    });

    return { orderedTypes, orderedToggles };
  }, [typeFilters, onlyEfish, showPublic, showNearby]);

  const topInset =
    Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 24 : 60;

  return (
    <View style={styles.page}>
      <View style={styles.container}>
        <MapView
          ref={mapRef}
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
          style={StyleSheet.absoluteFillObject}
          initialRegion={initialRegion}
          showsUserLocation={locationPermission}
          showsMyLocationButton={false}
          userLocationPriority="high"
          userLocationUpdateInterval={5000}
          tintColor={Colors.light.tint}
        >
          {filteredStations.map((station) => (
            <Marker
              key={station.id}
              coordinate={{
                latitude: station.latitude,
                longitude: station.longitude,
              }}
              onPress={() => handleMarkerPress(station)}
              anchor={{ x: 0.5, y: 1 }}
              flat={false}
            >
              <View style={{ width: 40, height: 52 }}>
                <Svg width={40} height={52} viewBox="0 0 40 52">
                  {/* Teardrop shape */}
                  <Path
                    d="M20 0C8.954 0 0 8.954 0 20c0 11.046 20 32 20 32s20-20.954 20-32C40 8.954 31.046 0 20 0z"
                    fill={typeColors[station.type]}
                  />
                  {/* White inner circle */}
                  <Circle cx={20} cy={18} r={13} fill="#ffffff" />
                </Svg>
                {/* Logo overlay */}
                <View style={{
                  position: "absolute",
                  top: 6,
                  left: 0,
                  right: 0,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <RNImage
                    source={require("@/assets/images/efishremovedbge.png")}
                    style={{
                      width: 24,
                      height: 24,
                    }}
                    resizeMode="contain"
                    tintColor={typeColors[station.type]}
                  />
                </View>
              </View>
            </Marker>
          ))}
        </MapView>

        <View style={[styles.overlay, { paddingTop: topInset }]}>
          <View style={styles.topRow}>
            <View style={styles.searchCard}>
              <TextInput
                placeholder="Search location..."
                placeholderTextColor="#4a5a66"
                value={search}
                onChangeText={setSearch}
                style={styles.searchInput}
              />
            </View>
            <Pressable style={styles.bell}>
              <Ionicons
                name="notifications-outline"
                size={22}
                color="#0f231c"
              />
            </Pressable>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <View>
              <View style={styles.filterLabelWrap}>
                <Text style={styles.filterLabel}>Station Types</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {orderedTypes.map((item) => (
                  <FilterChip
                    key={item.key}
                    label={item.label}
                    color={item.color}
                    active={item.active}
                    lightningCount={item.lightningCount}
                    onPress={item.onPress}
                  />
                ))}
              </View>
            </View>
            <View style={styles.filterDivider} />
            <View>
              <Text style={styles.filterLabel}>Types</Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  alignItems: "baseline",
                  justifyContent: "flex-end",
                }}
              >
                {orderedToggles.map((item) => (
                  <TogglePill
                    key={item.key}
                    label={item.label}
                    icon={item.icon}
                    active={item.active}
                    onPress={item.onPress}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </View>

        <BottomSheetModal
          ref={bottomSheetRef}
          snapPoints={snapPoints}
          onDismiss={closeSheet}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          handleIndicatorStyle={styles.handleIndicator}
        >
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.sheetContent,
              isDark ? styles.sheetContentDark : styles.sheetContentLight,
            ]}
          >
            {selectedStation && (
              <>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text
                      style={[
                        styles.stationName,
                        isDark
                          ? styles.stationNameDark
                          : styles.stationNameLight,
                      ]}
                    >
                      {selectedStation.name}
                    </Text>
                    <Text
                      style={[
                        styles.stationMeta,
                        isDark
                          ? styles.stationMetaDark
                          : styles.stationMetaLight,
                      ]}
                    >
                      {selectedStation.powerKw} kW ·{" "}
                      {selectedStation.status === "available"
                        ? "Available"
                        : "Busy"}
                    </Text>
                  </View>
                  <Pressable onPress={closeSheet} hitSlop={10}>
                    <Ionicons name="close-circle" size={26} color="#2f3d4a" />
                  </Pressable>
                </View>
                <View style={styles.stationTags}>
                  <View style={[styles.tag, { backgroundColor: "#eef7f3" }]}>
                    <Ionicons name="navigate" size={14} color="#0f231c" />
                    <Text
                      style={[
                        styles.tagText,
                        isDark ? styles.tagTextDark : styles.tagTextLight,
                      ]}
                    >
                      {selectedStation.distanceKm} km
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.tag,
                      {
                        backgroundColor:
                          typeColors[selectedStation.type] + "26",
                      },
                    ]}
                  >
                    <Ionicons
                      name="speedometer"
                      size={14}
                      color={typeColors[selectedStation.type]}
                    />
                    <Text
                      style={[
                        styles.tagText,
                        { color: typeColors[selectedStation.type] },
                        isDark ? null : styles.tagTextLight,
                      ]}
                    >
                      {selectedStation.type}
                    </Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.address,
                    isDark ? styles.addressDark : styles.addressLight,
                  ]}
                >
                  {selectedStation.address}
                </Text>
                <View
                  style={[
                    styles.connectorList,
                    isDark
                      ? styles.connectorListDark
                      : styles.connectorListLight,
                  ]}
                >
                  {selectedStation.connectors.map((connector) => (
                    <View key={connector.id} style={styles.connectorRow}>
                      <View
                        style={[
                          styles.statusDot,
                          getStatusDotStyle(connector.status),
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.connectorLabel,
                            isDark
                              ? styles.connectorLabelDark
                              : styles.connectorLabelLight,
                          ]}
                        >
                          {connector.id}
                        </Text>
                        <Text
                          style={[
                            styles.connectorPower,
                            isDark
                              ? styles.connectorPowerDark
                              : styles.connectorPowerLight,
                          ]}
                        >
                          {connector.powerKw} kW
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.connectorStatus,
                          isDark
                            ? styles.connectorStatusDark
                            : styles.connectorStatusLight,
                        ]}
                      >
                        {formatStatus(connector.status)}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.actionRow}>
                  <Pressable
                    style={[
                      styles.secondaryAction,
                      isDark
                        ? styles.secondaryActionDark
                        : styles.secondaryActionLight,
                    ]}
                  >
                    <Text
                      style={[
                        styles.secondaryActionText,
                        isDark
                          ? styles.secondaryActionTextDark
                          : styles.secondaryActionTextLight,
                      ]}
                    >
                      Reservation
                    </Text>
                  </Pressable>
                  <Pressable
                    style={styles.primaryAction}
                    onPress={openDirections}
                  >
                    <Text style={styles.primaryActionText}>Directions</Text>
                    <Ionicons name="arrow-forward" size={18} color="#0b2319" />
                  </Pressable>
                </View>
              </>
            )}
          </BottomSheetScrollView>
        </BottomSheetModal>
      </View>
    </View>
  );
}

type FilterChipProps = {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
  lightningCount?: number;
};

function FilterChip({
  label,
  color,
  active,
  onPress,
  lightningCount,
}: FilterChipProps) {
  const anim = React.useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [active, anim]);

  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#ffffff", color],
  });
  const border = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#dfe4ec", color],
  });
  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [color, "#ffffff"],
  });
  const subColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#5c6b7a", "#ffffff"],
  });
  const dotColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [color, "#ffffff"],
  });

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[
          styles.chip,
          {
            backgroundColor: bg,
            borderColor: border,
            shadowOpacity: active ? 0.12 : 0.06,
          },
        ]}
      >
        <View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {lightningCount ? (
              <View style={{ flexDirection: "row", marginRight: 6 }}>
                {Array.from({ length: lightningCount }).map((_, idx) => (
                  <View
                    key={idx}
                      style={{
                        marginLeft: idx > 0 ? -9 : 0,
                        zIndex: idx,
                      }}
                    >
                      <Ionicons
                        name="flash"
                        size={14}
                        color={active ? "#ffffff" : color}
                        style={{
                          textShadowColor: active ? color : "#ffffff",
                          textShadowOffset: { width: -2, height: 0 },
                          textShadowRadius: 1,
                        }}
                      />
                    </View>
                ))}
              </View>
            ) : null}
            <Animated.Text style={[styles.chipText, { color: textColor }]}>
              {label}
            </Animated.Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

type TogglePillProps = {
  label: string;
  icon: any;
  active: boolean;
  onPress: () => void;
};

function TogglePill({ label, icon, active, onPress }: TogglePillProps) {
  const anim = React.useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [active, anim]);

  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#ffffff", "#2cdb9b"],
  });
  const border = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#dfe4ec", "#2cdb9b"],
  });
  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#2f3d4a", "#0b2319"],
  });
  const iconBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#eef2f6", "#ffffff"],
  });
  const iconColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#0f231c", "#2cdb9b"],
  });

  return (
    <Pressable onPress={onPress}>
      <Animated.View
        style={[
          styles.toggle,
          {
            backgroundColor: bg,
            borderColor: border,
            shadowOpacity: active ? 0.1 : 0.06,
          },
        ]}
      >
        <Animated.View style={[styles.toggleIcon, { backgroundColor: iconBg }]}>
          <Animated.View>
            <Ionicons
              name={icon}
              size={14}
              color={active ? "#2cdb9b" : "#0f231c"}
            />
          </Animated.View>
        </Animated.View>
        <Animated.Text
          style={[styles.toggleText, { color: active ? "#ffffff" : textColor }]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

function formatStatus(status: Station["status"]) {
  switch (status) {
    case "available":
      return "Available";
    case "busy":
      return "Busy";
    case "charging":
      return "Charging";
    default:
      return "Offline";
  }
}

function getStatusDotStyle(status: Station["status"]) {
  switch (status) {
    case "available":
      return { backgroundColor: "#2CDD9D" };
    case "busy":
      return { backgroundColor: "#FF8A1F" };
    case "charging":
      return { backgroundColor: "#4BACE4" };
    default:
      return { backgroundColor: "#9BA1A6" };
  }
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  container: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    left: 12,
    right: 12,
    gap: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  searchCard: {
    backgroundColor: "#ffffff",
    borderRadius: 28,
    paddingHorizontal: 0,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 12,
    borderWidth: 1,
    borderColor: "#eef2f5",
    gap: 8,
    flex: 1,
  },
  searchInput: {
    height: 30,
    borderRadius: 22,
    backgroundColor: "#f7f9fb",
    paddingHorizontal: 18,
    fontSize: 16,
    color: "#0f231c",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    elevation: 4,
  },
  quickActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  bell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#ffffffee",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 14,
    elevation: 8,
    borderWidth: 1,
    borderColor: "#e5f4ec",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
    paddingVertical: 6,
  },
  filterLabelWrap: {
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  filterLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#0f231c",
    marginBottom: 4,
  },
  filterDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#dfe4ec",
    marginHorizontal: 6,
    alignSelf: "center",
  },
  marker: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 2,
    borderColor: "#ffffffcc",
  },
  markerText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
  },
  pinWrapper: {
    alignItems: "center",
    width: 48,
    height: 58,
  },
  pinCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  pinWhiteCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  pinLogo: {
    width: 14,
    height: 14,
  },
  pinPoint: {
    marginTop: -20,
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderTopWidth: 20,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    zIndex: 1,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontWeight: "700",
    fontSize: 13,
  },
  chipSub: {
    color: "#3b4a55",
    fontWeight: "600",
    fontSize: 11,
  },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  toggleText: {
    fontWeight: "700",
    color: "#0f231c",
    fontSize: 13,
  },
  toggleIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  handleIndicator: {
    backgroundColor: "#ffffffaa",
    width: 76,
    height: 6,
    borderRadius: 999,
    marginTop: 8,
    marginBottom: 4,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContentDark: {
    backgroundColor: "#0c1f3c",
  },
  sheetContentLight: {
    backgroundColor: "#ffffff",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stationName: {
    fontSize: 20,
    fontWeight: "800",
  },
  stationNameDark: {
    color: "#ffffff",
  },
  stationNameLight: {
    color: "#0f231c",
  },
  stationMeta: {
    fontWeight: "600",
    marginTop: 2,
  },
  stationMetaDark: {
    color: "#d9e4f2",
  },
  stationMetaLight: {
    color: "#4a5a66",
  },
  stationTags: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
  },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  tagText: {
    fontWeight: "700",
  },
  tagTextDark: {
    color: "#ffffff",
  },
  tagTextLight: {
    color: "#0f231c",
  },
  address: {
    fontSize: 14,
    marginTop: 4,
  },
  addressDark: {
    color: "#c8d6ec",
  },
  addressLight: {
    color: "#2f3d4a",
  },
  connectorList: {
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  connectorListDark: {
    backgroundColor: "#10294f",
  },
  connectorListLight: {
    backgroundColor: "#f4f6f9",
  },
  connectorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  connectorLabel: {
    fontWeight: "800",
  },
  connectorLabelDark: {
    color: "#ffffff",
  },
  connectorLabelLight: {
    color: "#0f231c",
  },
  connectorPower: {},
  connectorPowerDark: {
    color: "#c8d6ec",
  },
  connectorPowerLight: {
    color: "#4a5a66",
  },
  connectorStatus: {
    fontWeight: "700",
  },
  connectorStatusDark: {
    color: "#ffffff",
  },
  connectorStatusLight: {
    color: "#0f231c",
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  secondaryAction: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryActionDark: {
    backgroundColor: "#143260",
  },
  secondaryActionLight: {
    backgroundColor: "#e6ecf5",
  },
  secondaryActionText: {
    fontWeight: "800",
    fontSize: 15,
  },
  secondaryActionTextDark: {
    color: "#d9e4f2",
  },
  secondaryActionTextLight: {
    color: "#0f231c",
  },
  primaryAction: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#2CDD9D",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  primaryActionText: {
    color: "#0b2319",
    fontWeight: "800",
    fontSize: 15,
  },
});
