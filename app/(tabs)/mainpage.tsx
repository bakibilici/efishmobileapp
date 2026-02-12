import ChargingScreen from "@/components/ChargingScreen";
import ChargingWidget from "@/components/ChargingWidget";
import SocketErrorModal from "@/components/SocketErrorModal";
import { useUser } from "@/context/UserContext";
import { useChargingSimulation } from "@/hooks/useChargingSimulation";
import { getRegisteredVehicles, getStationDetails, getStations, startChargingSession, stopChargingSession } from "@/services/api";
import { getAccessToken } from "@/services/tokenStorage";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetModal,
  BottomSheetScrollView
} from "@gorhom/bottom-sheet";
import * as Location from "expo-location";
import {
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useRouter,
} from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  DeviceEventEmitter,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  Image as RNImage,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  UIManager,
  View
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";
import Svg, { Circle, Path } from "react-native-svg";

// ... existing imports ...


import { Station, StationType } from "@/constants/stations";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";

const typeColors: Record<StationType, string> = {
  HPC: "#7C4DFF",
  DC: "#FF8A1F",
  AC: "#4BACE4",
};

const getStationColor = (type: string | null | undefined) => {
  if (!type) return "#000000";
  // We cast to any to allow checking against the record keys
  const color = typeColors[type as StationType];
  return color || "#000000";
};

const typeLightningCount: Record<StationType, number> = {
  AC: 1,
  DC: 2,
  HPC: 3,
};

export default function MapScreen() {
  const router = useRouter();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const params = useLocalSearchParams();

  const [stationsList, setStationsList] = useState<Station[]>([]);
  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [stationDetails, setStationDetails] = useState<any>(null); // For detail view
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [showAddress, setShowAddress] = useState(false);

  // Charge Start Flow State
  const [bottomSheetMode, setBottomSheetMode] = useState<'details' | 'vehicle_select'>('details');
  const [targetSocketUuid, setTargetSocketUuid] = useState<string | null>(null);
  const [myVehicles, setMyVehicles] = useState<any[]>([]);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const isSwitchingMode = useRef(false);

  // Meter values WebSocket
  const meterWsRef = useRef<WebSocket | null>(null);
  const meterBaseWhRef = useRef<number | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start'tan dönen session uuid; Stop'ta kullanılır
  const activeChargeSessionUuidRef = useRef<string | null>(null);

  // Socket Error State
  const [showSocketError, setShowSocketError] = useState(false);
  const [pendingVehicle, setPendingVehicle] = useState<any>(null);

  // Charging Simulation
  const charging = useChargingSimulation();

  const handleStartPress = async (socketUuid: string) => {
    setTargetSocketUuid(socketUuid);
    // Don't dismiss, just switch mode
    setBottomSheetMode('vehicle_select');
    // Force present/expand just in case it's closed
    bottomSheetRef.current?.present();

    setIsLoadingVehicles(true);

    try {
      const data = await getRegisteredVehicles();

      let list: any[] = [];
      if (Array.isArray(data)) {
        // Direct array
        list = data;
      } else if (data && Array.isArray(data.results)) {
        // Django Rest Framework standard pagination at root
        list = data.results;
      } else if (data && data.data && Array.isArray(data.data.results)) {
        // Custom wrapped response with pagination inside data
        list = data.data.results;
      } else if (data && data.data && Array.isArray(data.data)) {
        // Custom wrapped response with direct array in data
        list = data.data;
      }

      setMyVehicles(list);

    } catch (e) {
      console.error(e);
      Alert.alert("Error", "Could not load vehicles");
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  const connectMeterValuesSocket = useCallback(async (isReconnect = false) => {
    try {
      const token = await getAccessToken();
      if (!token) {
        console.warn("No access token found for meter values websocket.");
        return;
      }

      // Close any existing socket before opening a new one
      if (meterWsRef.current) {
        meterWsRef.current.close();
        meterWsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const apiUrl = __DEV__
        ? process.env.EXPO_PUBLIC_API_URL_DEV
        : process.env.EXPO_PUBLIC_API_URL_PROD;
      const scheme = (apiUrl || "").startsWith("https") ? "wss" : "ws";
      const host =
        typeof apiUrl === "string" ? new URL(apiUrl).host : "efish-backend.uptecra.com";
      const wsUrl = `${scheme}://${host}/ws/meter-values/?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log("Meter values WebSocket connected:", wsUrl);
        meterBaseWhRef.current = null;
      };

      ws.onmessage = (event) => {
        console.log("Meter values message raw:", event.data);
        try {
          const data = JSON.parse(event.data);
          let payload: any = {};

          if (data && typeof data === "object") {
            // Backend: type "socket_status" -> data.status "Charging", data.power, data.counter
            if (data.type === "socket_status" && data.data && typeof data.data === "object") {
              const d = data.data;
              const isCharging = (d.status || "").toLowerCase() === "charging";
              const powerKw = typeof d.power === "number" ? d.power : parseFloat(d.power);
              const counterKwh = typeof d.counter === "number" ? d.counter : parseFloat(d.counter);
              payload = {
                power_kw: isCharging ? (Number.isFinite(powerKw) ? powerKw : 1) : 0,
                charged_kwh: Number.isFinite(counterKwh) ? counterKwh : undefined,
                cost: typeof d.cost === "number" ? d.cost : undefined,
              };
              if (!isCharging) {
                charging.updateFromMeterValues({ power_kw: 0, charged_kwh: payload.charged_kwh, cost: payload.cost } as any);
                return;
              }
            }
            // Simple backend payload (flat soc, power_kw, energy_kwh)
            else if (
              data.soc != null ||
              data.batteryLevel != null ||
              data.power_kw != null ||
              data.power != null ||
              data.energy_kwh != null ||
              data.charged_kwh != null
            ) {
              payload = {
                batteryLevel: data.batteryLevel ?? data.soc,
                power_kw: data.power_kw ?? data.power,
                charged_kwh: data.charged_kwh ?? data.energy_kwh,
                cost: data.cost,
                duration_sec: data.duration_sec ?? data.duration,
              };
            }
            // Raw OCPP-style MeterValues payload
            else if (Array.isArray(data.meterValue)) {
              const mv = data.meterValue[0];
              const sv = Array.isArray(mv?.sampledValue) ? mv.sampledValue : [];
              let soc: number | undefined;
              let powerW: number | undefined;
              let energyWh: number | undefined;

              sv.forEach((s: any) => {
                if (s.measurand === "SoC") {
                  soc = Number(s.value);
                } else if (s.measurand === "Power.Active.Import") {
                  powerW = Number(s.value);
                } else if (s.measurand === "Energy.Active.Import.Register") {
                  energyWh = Number(s.value);
                }
              });

              let chargedKwh: number | undefined;
              if (typeof energyWh === "number" && !Number.isNaN(energyWh)) {
                if (meterBaseWhRef.current == null) {
                  meterBaseWhRef.current = energyWh;
                }
                chargedKwh = Math.max(0, (energyWh - meterBaseWhRef.current) / 1000);
              }

              payload = {
                batteryLevel: soc,
                power_kw: typeof powerW === "number" && !Number.isNaN(powerW) ? powerW / 1000 : undefined,
                charged_kwh: chargedKwh,
              };
            }
          }

          if (payload && Object.keys(payload).length > 0) {
            charging.updateFromMeterValues({
              batteryLevel: payload.batteryLevel,
              power_kw: payload.power_kw,
              charged_kwh: payload.charged_kwh,
              cost: payload.cost,
              duration_sec: payload.duration_sec,
            } as any);
          }
        } catch (e) {
          console.log("Failed to parse meter values message", e);
        }
      };

      ws.onerror = (event) => {
        console.log("Meter values WebSocket error:", event);
      };

      ws.onclose = (event) => {
        console.log("Meter values WebSocket closed:", event.code, event.reason);
        meterWsRef.current = null;
        // Uygulama açıkken sürekli dinleyebilmek için kapanınca yeniden bağlan (giriş yapmış kullanıcı için)
        if (user && !reconnectTimeoutRef.current) {
          const delay = isReconnect ? 5000 : 3000;
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connectMeterValuesSocket(true);
          }, delay);
        }
      };

      meterWsRef.current = ws;
    } catch (error) {
      console.error("Failed to connect meter values WebSocket:", error);
      if (user && !reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connectMeterValuesSocket(true);
        }, 5000);
      }
    }
  }, [charging.updateFromMeterValues, user]);

  const handleStopCharging = useCallback(async () => {
    const uuid = activeChargeSessionUuidRef.current;
    try {
      if (uuid) {
        await stopChargingSession({ charge_session_uuid: uuid });
      }
    } catch (e: any) {
      console.error("Stop charging session error", e);
      Alert.alert("Error", e.response?.data?.message || "Failed to stop charging session.");
    } finally {
      activeChargeSessionUuidRef.current = null;
      charging.stopSimulation();
    }
  }, [charging.stopSimulation]);

  const handleVehicleSelect = async (vehicle: any) => {
    if (!targetSocketUuid) return;
    try {
      bottomSheetRef.current?.dismiss(); // Close sheet immediately
      const res = await startChargingSession({
        vehicle_id: vehicle.id,
        socket_uuid: targetSocketUuid
      });

      // Start başarılı: session uuid'yi sakla (Stop'ta kullanılacak)
      const session = res?.data ?? res;
      activeChargeSessionUuidRef.current = session?.uuid ?? null;

      // Hemen şarj widget'ını göster (WebSocket verisi gelene kadar simülasyon/session verisi).
      const initialSoc = session?.battery_level != null ? Number(session.battery_level) : undefined;
      const initialEnergy = session?.total_energy != null ? parseFloat(String(session.total_energy)) : undefined;
      charging.startSimulation('DC');
      if (initialSoc != null || initialEnergy != null) {
        charging.updateFromMeterValues({
          batteryLevel: initialSoc,
          charged_kwh: initialEnergy,
          power_kw: session?.avg_charge_power != null ? parseFloat(String(session.avg_charge_power)) : undefined,
        } as any);
      }

      // Meter-values WebSocket'i bağla; canlı veri gelince widget güncellenir.
      connectMeterValuesSocket();
    } catch (e: any) {
      console.error("Start session error", e);
      if (e.response?.data?.message_key === "socket.not_plugged") {
        setPendingVehicle(vehicle);
        setShowSocketError(true);
      } else {
        Alert.alert("Error", e.response?.data?.message || "Failed to start charging session.");
      }
    }
  };

  const handleSocketRetry = () => {
    setShowSocketError(false);
    if (pendingVehicle) {
      // Add small delay for modal interaction
      setTimeout(() => handleVehicleSelect(pendingVehicle), 300);
    }
  };

  const handleSocketRepair = () => {
    // Placeholder logic for "Repair Manually" - STARTS SIMULATION
    setShowSocketError(false);
    charging.startSimulation('DC'); // Default to DC as requested? Or let user pick? Prompt implied "dev environment", defaulting to DC for now as per "Dev toggle" feature availability.
  };

  const handleFetchDetails = async (uuid: string) => {
    setIsFetchingDetails(true);
    try {
      const data = await getStationDetails(uuid);
      setStationDetails(data);
      // Expand sheet if needed?
      // bottomSheetRef.current?.expand();
    } catch (e) {
      console.error("Fetch details error", e);
    } finally {
      setIsFetchingDetails(false);
    }
  };

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

  const topInset =
    Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 24 : 60;

  const { colors, themeScheme } = useTheme();
  const isDark = themeScheme === 'dark';

  // Login Success Toast

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const toastAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (params.showLoginSuccess === "true") {
      setShowSuccessToast(true);
      // Slide Down
      Animated.spring(toastAnim, {
        toValue: topInset + 10,
        useNativeDriver: true,
        speed: 12,
        bounciness: 8,
      }).start();

      // Hide after 3s
      const timer = setTimeout(() => {
        // Slide Up
        Animated.timing(toastAnim, {
          toValue: -100,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setShowSuccessToast(false));
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [params.showLoginSuccess, topInset]);

  // Uygulama açılır açılmaz giriş yapmışsa meter-values WebSocket'e bağlan (halihazırda şarj varsa widget güncellenir)
  useEffect(() => {
    if (!user) return;
    connectMeterValuesSocket();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (meterWsRef.current) {
        meterWsRef.current.close();
        meterWsRef.current = null;
      }
    };
  }, [user, connectMeterValuesSocket]);

  // Handle QR Scan Result via Event Emitter
  useEffect(() => {
    const scanSubscription = DeviceEventEmitter.addListener('evt_QR_SCANNED', (data: { socketUuid: string }) => {
      if (data && data.socketUuid) {
        handleStartPress(data.socketUuid);
      }
    });

    // Handle QR Not Plugged event - show error modal
    const notPluggedSubscription = DeviceEventEmitter.addListener('evt_QR_NOT_PLUGGED', () => {
      console.log('=== MAINPAGE: evt_QR_NOT_PLUGGED received ===');
      // Wait for scanner to close first
      setTimeout(() => {
        setShowSocketError(true);
      }, 600);
    });

    // Check params for legacy support or deep linking
    if (params.socketUuid) {
      handleStartPress(params.socketUuid as string);
      router.setParams({ socketUuid: "" });
    }

    return () => {
      scanSubscription.remove();
      notPluggedSubscription.remove();
    };
  }, [params.socketUuid]);

  const initialRegion: Region = useMemo(
    () => ({
      latitude: 41.015,
      longitude: 29.04,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    }),
    []
  );

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const mapRef = useRef<MapView>(null);
  const snapPoints = useMemo(() => ["45%", "85%"], []);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const [showRecenter, setShowRecenter] = useState(false);

  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return d;
  };

  const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
  };

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

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      if (meterWsRef.current) {
        meterWsRef.current.close();
        meterWsRef.current = null;
      }
    };
  }, []);

  const fetchStations = async (region: Region, types: StationType[]) => {
    try {
      const minLon = region.longitude - region.longitudeDelta / 2;
      const maxLon = region.longitude + region.longitudeDelta / 2;
      const minLat = region.latitude - region.latitudeDelta / 2;
      const maxLat = region.latitude + region.latitudeDelta / 2;

      const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
      // Pass the current type filters to the API
      const data = await getStations(bbox, types);

      if (Array.isArray(data)) {
        setStationsList(data);
      }
    } catch (error: any) {
      console.error("Failed to fetch stations", error);
    }
  };

  // Keep track of current region to refetch when filters change
  const currentRegion = useRef<Region>(initialRegion);

  const onRegionChangeComplete = (region: Region) => {
    currentRegion.current = region;
    fetchStations(region, typeFilters);

    if (userLocation) {
      const dist = getDistanceFromLatLonInKm(
        userLocation.coords.latitude,
        userLocation.coords.longitude,
        region.latitude,
        region.longitude
      );
      setShowRecenter(dist > 0.1);
    }
  };

  // Re-fetch when filters change
  useEffect(() => {
    fetchStations(currentRegion.current, typeFilters);
  }, [typeFilters]);

  const handleRecenter = () => {
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: userLocation.coords.latitude,
        longitude: userLocation.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      setShowRecenter(false);
    }
  };



  // Client-side filtering for other toggles (onlyEfish, public) if API doesn't support them yet
  const filteredStations = useMemo(
    () =>
      stationsList.filter((station) => {
        // The API already filters by Type (AC/DC/HPC).
        // We might still filter by name (search) or other client-side toggles here.
        const matchesQuery = station.name
          .toLowerCase()
          .includes(search.toLowerCase().trim());
        // For now ignoring onlyEfish / showPublic if API data doesn't provide enough info, 
        // or filtering based on what we have.
        return matchesQuery;
      }),
    [stationsList, search, onlyEfish, showPublic]
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
    }
  };

  const toggleType = (type: StationType) => {
    withAnimation();
    setTypeFilters((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
    // useEffect will handle refetch
  };

  const handleMarkerPress = (station: Station) => {
    setSelectedStation(station);
    setStationDetails(null); // Reset details
    setBottomSheetMode('details'); // Ensure we start in details mode
    bottomSheetRef.current?.present();

    // Auto-focus logic: Center the map on the pin
    // We subtract a small amount from latitude to shift the map down, 
    // effectively moving the pin UP into the visible area above the bottom sheet.
    // 0.005 is a rough approximation, adjust based on zoom level if needed.
    if (mapRef.current) {
      const region = {
        latitude: station.latitude - 0.002, // slight offset to show pin above sheet
        longitude: station.longitude,
        latitudeDelta: 0.01, // Zoom in
        longitudeDelta: 0.01,
      };
      mapRef.current.animateToRegion(region, 500);
    }

    // Auto-fetch details immediately
    if (station.uuid) {
      handleFetchDetails(station.uuid);
    }
  };

  const closeSheet = () => {
    if (isSwitchingMode.current) {
      isSwitchingMode.current = false;
      return;
    }
    bottomSheetRef.current?.dismiss();
    setSelectedStation(null);
    setStationDetails(null);
    setShowAddress(false);
    setBottomSheetMode('details');
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

  // Return null to disable backdrop and allow map interaction
  const renderBackdrop = useCallback(
    (props: any) => null,
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

  const { types, toggles } = useMemo(() => {
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

    return { types, toggles };
  }, [typeFilters, onlyEfish, showPublic, showNearby]);

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
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
          tintColor={colors.tint}
          onRegionChangeComplete={onRegionChangeComplete}
          userInterfaceStyle={themeScheme === 'dark' ? 'dark' : 'light'}
          customMapStyle={themeScheme === 'dark' ? [
            {
              "elementType": "geometry",
              "stylers": [{ "color": "#242f3e" }]
            },
            {
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#746855" }]
            },
            {
              "elementType": "labels.text.stroke",
              "stylers": [{ "color": "#242f3e" }]
            },
            {
              "featureType": "administrative.locality",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#d59563" }]
            },
            {
              "featureType": "poi",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#d59563" }]
            },
            {
              "featureType": "poi.park",
              "elementType": "geometry",
              "stylers": [{ "color": "#263c3f" }]
            },
            {
              "featureType": "poi.park",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#6b9a76" }]
            },
            {
              "featureType": "road",
              "elementType": "geometry",
              "stylers": [{ "color": "#38414e" }]
            },
            {
              "featureType": "road",
              "elementType": "geometry.stroke",
              "stylers": [{ "color": "#212a37" }]
            },
            {
              "featureType": "road",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#9ca5b3" }]
            },
            {
              "featureType": "road.highway",
              "elementType": "geometry",
              "stylers": [{ "color": "#746855" }]
            },
            {
              "featureType": "road.highway",
              "elementType": "geometry.stroke",
              "stylers": [{ "color": "#1f2835" }]
            },
            {
              "featureType": "road.highway",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#f3d19c" }]
            },
            {
              "featureType": "transit",
              "elementType": "geometry",
              "stylers": [{ "color": "#2f3948" }]
            },
            {
              "featureType": "transit.station",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#d59563" }]
            },
            {
              "featureType": "water",
              "elementType": "geometry",
              "stylers": [{ "color": "#17263c" }]
            },
            {
              "featureType": "water",
              "elementType": "labels.text.fill",
              "stylers": [{ "color": "#515c6d" }]
            },
            {
              "featureType": "water",
              "elementType": "labels.text.stroke",
              "stylers": [{ "color": "#17263c" }]
            }
          ] : []}>

          {filteredStations.map((station) => {
            const availableCount = station.socket_stats
              ? Object.values(station.socket_stats).reduce((acc: number, curr: any) => acc + (curr.available || 0), 0)
              : 0;
            const stationColor = getStationColor(station.type);

            return (
              <Marker
                key={station.id}
                coordinate={{
                  latitude: station.latitude,
                  longitude: station.longitude,
                }}
                onPress={() => handleMarkerPress(station)}
                anchor={{ x: 0.5, y: 1 }}
                flat={false}
                tracksViewChanges={true}
              >
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 40, height: 52 }}>
                    <Svg width={40} height={52} viewBox="0 0 40 52">
                      {/* Teardrop shape */}
                      <Path
                        d="M20 0C8.954 0 0 8.954 0 20c0 11.046 20 32 20 32s20-20.954 20-32C40 8.954 31.046 0 20 0z"
                        fill={stationColor}
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
                        tintColor={stationColor}
                      />
                    </View>
                  </View>

                  {/* Available Socket Badge */}
                  <View style={{
                    backgroundColor: stationColor,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: '#fff',
                    minWidth: 22,
                    height: 22,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: -10, // Pull up to overlap with pin tip
                    zIndex: 2,
                    elevation: 2,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.2,
                    shadowRadius: 1,
                  }}>
                    <Text style={{
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: '900',
                      textAlign: 'center'
                    }}>
                      {availableCount}
                    </Text>
                  </View>
                </View>
              </Marker>
            )
          })}
        </MapView>

        <View style={[styles.overlay, { paddingTop: topInset }]}>
          <View style={styles.topRow}>
            <View style={[styles.searchCard, { backgroundColor: colors.card, shadowColor: colors.shadow, borderColor: colors.border }]}>
              <TextInput
                placeholder="Search location..."
                placeholderTextColor={colors.textTertiary}
                value={search}
                onChangeText={setSearch}
                style={[styles.searchInput, { backgroundColor: "transparent", color: colors.text }]}
              />
            </View>
            {user ? (
              <Pressable style={[styles.bell, { backgroundColor: colors.card, shadowColor: colors.shadow, borderColor: colors.border }]}>
                <Ionicons
                  name="notifications-outline"
                  size={22}
                  color={colors.text}
                />
              </Pressable>
            ) : (
              <Pressable
                onPress={() => {
                  if (router.canDismiss()) {
                    router.dismissAll();
                  }
                  router.replace("/");
                }}
                style={[
                  styles.bell,
                  {
                    width: 'auto',
                    paddingHorizontal: 16,
                    backgroundColor: colors.primary,
                    borderColor: colors.primary,
                  }
                ]}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Log In</Text>
              </Pressable>
            )}
          </View>

          {/* Filter Row (Always visible now) */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <View>
              <View style={styles.filterLabelWrap}>
                <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Station Types</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {types.map((item) => (
                  <FilterChip
                    key={item.key}
                    label={item.label}
                    color={item.color}
                    active={item.active}
                    lightningCount={item.lightningCount}
                    onPress={item.onPress}
                    colors={colors}
                  />
                ))}
              </View>
            </View>
            <View style={[styles.filterDivider, { backgroundColor: colors.border }]} />
            <View>
              <Text style={[styles.filterLabel, { color: colors.textSecondary }]}>Types</Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  alignItems: "baseline",
                  justifyContent: "flex-end",
                }}
              >
                {toggles.map((item) => (
                  <TogglePill
                    key={item.key}
                    label={item.label}
                    icon={item.icon}
                    active={item.active}
                    onPress={item.onPress}
                    colors={colors}
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Charging Widget (Floating below filters) */}
          {charging.isActive && charging.isMinimized && (
            <ChargingWidget
              state={charging}
              onExpand={charging.toggleMinimize}
            />
          )}

        </View>

        {/* Re-center Button - Hide when widget is active to avoid clutter? Or keep? Keeping for now. */}
        {
          showRecenter && !charging.isActive && (
            <Animated.View
              style={styles.recenterBtnWrapper}
            >
              <Pressable onPress={handleRecenter} style={[styles.recenterBtn, { backgroundColor: colors.card, shadowColor: colors.shadow }]}>
                <FontAwesome5 name="location-arrow" size={22} color={colors.text} />
              </Pressable>
            </Animated.View>
          )
        }

        <BottomSheetModal
          ref={bottomSheetRef}
          snapPoints={snapPoints}
          onDismiss={closeSheet}
          enablePanDownToClose
          backdropComponent={renderBackdrop}
          handleComponent={null}
          backgroundStyle={{ backgroundColor: isDark ? "#161616" : "#ffffff" }}
        >
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.sheetContent,
              isDark ? styles.sheetContentDark : styles.sheetContentLight,
            ]}
          >
            {bottomSheetMode === 'vehicle_select' ? (
              <View style={{ minHeight: 300 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <Pressable
                      onPress={() => setBottomSheetMode('details')}
                      hitSlop={15}
                      style={{
                        padding: 4,
                      }}
                    >
                      <Ionicons name="chevron-back" size={24} color={colors.text} />
                    </Pressable>
                    <Text style={[styles.stationName, isDark ? styles.stationNameDark : styles.stationNameLight, { fontSize: 18 }]}>
                      Select Vehicle
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => bottomSheetRef.current?.dismiss()}
                    hitSlop={10}
                    style={{
                      padding: 4,
                      backgroundColor: isDark ? "#252525ff" : "#f0f2f5",
                      borderRadius: 20
                    }}
                  >
                    <Ionicons name="close" size={20} color={colors.text} />
                  </Pressable>
                </View>

                {isLoadingVehicles ? (
                  <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
                ) : myVehicles.length === 0 ? (
                  <View style={{ alignItems: 'center', padding: 20, marginTop: 20 }}>
                    <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>No vehicles found.</Text>
                    <Pressable
                      onPress={() => {
                        bottomSheetRef.current?.dismiss();
                        router.push("/vehicles/add");
                      }}
                      style={{
                        backgroundColor: colors.primary,
                        paddingHorizontal: 20,
                        paddingVertical: 10,
                        borderRadius: 12
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: '700' }}>Add Vehicle</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={{ gap: 12 }}>
                    {myVehicles.map((v) => (
                      <Pressable
                        key={v.id || v.uuid}
                        onPress={() => handleVehicleSelect(v)}
                        style={({ pressed }) => [{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 16,
                          backgroundColor: colors.card,
                          borderRadius: 16,
                          borderWidth: 1,
                          borderColor: colors.border,
                          gap: 12,
                        }, pressed && { opacity: 0.8 }]}
                      >
                        <View style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: colors.backgroundSecondary,
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          <Ionicons name="car-sport" size={20} color={colors.primary} />
                        </View>
                        <View>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
                            {v.plate_number}
                          </Text>
                          <Text style={{ fontSize: 13, color: colors.textSecondary }}>
                            {v.vehicle_name || `${v.vehicle_details?.brand || ''} ${v.vehicle_details?.model || ''}`}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }} />
                        <Ionicons name="chevron-forward" size={20} color={colors.textTertiary} />
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            ) : selectedStation && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "flex-end" }}><Pressable
                  onPress={closeSheet}
                  hitSlop={10}
                  style={{
                    padding: 4,
                    backgroundColor: isDark ? "#252525ff" : "#f0f2f5",
                    borderRadius: 20
                  }}
                >
                  <Ionicons name="close" size={20} color={colors.text} />
                </Pressable></View>
                <View style={styles.sheetHeader}>

                  <View style={{ flex: 1, marginRight: 10 }}>

                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>{/* Status Light */}
                        <View style={{
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: selectedStation.status === "available" ? "#2cdb9b" : "#ff3b30",
                          shadowColor: selectedStation.status === "available" ? "#2cdb9b" : "#ff3b30",
                          shadowOffset: { width: 0, height: 0 },
                          shadowOpacity: 0.8,
                          shadowRadius: 6,
                        }} />
                        <Text
                          style={[
                            styles.stationName,
                            isDark ? styles.stationNameDark : styles.stationNameLight,
                            { flex: 1 }
                          ]}
                          numberOfLines={1}
                        >
                          {stationDetails?.name || selectedStation.name}
                        </Text>
                        {/* Address Toggle Chevron */}
                        <Pressable
                          onPress={() => {
                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                            setShowAddress(!showAddress);
                          }}
                          hitSlop={10}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name={showAddress ? "chevron-up" : "chevron-down"} size={20} color={colors.textSecondary} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Chips Row */}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {/* Type Chip */}
                  <View style={{
                    backgroundColor: getStationColor(selectedStation.type),
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 88,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Ionicons name="flash" size={16} color="#fff" />
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{selectedStation.type} {selectedStation.powerKw} kW</Text>
                  </View>

                  {/* Public/Private Chip */}
                  <View style={{
                    backgroundColor: colors.card,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 88,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    borderWidth: 1,
                    borderColor: colors.border
                  }}>
                    <Ionicons name={selectedStation.is_public ? "lock-open" : "lock-closed"} size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
                      {selectedStation.is_public !== undefined ? (selectedStation.is_public ? "Public" : "Private") : "Public"}
                    </Text>
                  </View>

                  {/* 24h Chip */}
                  <View style={{
                    backgroundColor: colors.card,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 88,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    borderWidth: 1,
                    borderColor: colors.border
                  }}>
                    <Ionicons name="time" size={16} color={colors.text} />
                    <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>
                      {selectedStation.is_24h ? "7/24 Available" : "Only work hours"}
                    </Text>
                  </View>


                </View>
                {/* Address Detail */}
                {showAddress && (
                  <View style={{ marginTop: 2 }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary, marginBottom: 4 }}>Address</Text>
                    <Text style={{ fontSize: 14, color: colors.text, lineHeight: 18 }}>
                      {stationDetails?.address || "Address loading..."}
                    </Text>
                    {stationDetails.directions && (
                      <View style={{
                        marginTop: 2
                      }}>
                        <Text style={{ fontSize: 14, fontWeight: "600", color: colors.primary, marginBottom: 4, marginTop: 4 }}>Notes</Text>
                        <Text style={{ color: colors.text, lineHeight: 20 }}>{stationDetails.directions}</Text>
                      </View>
                    )}
                  </View>
                )}
                {/* Functionality Buttons */}
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
                  <Pressable
                    onPress={openDirections}
                    style={{
                      flex: 1,
                      backgroundColor: colors.primary,
                      height: 48,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'row',
                      gap: 8,
                    }}>
                    <Ionicons name="navigate" size={20} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>Directions</Text>
                  </Pressable>
                </View>

                {isFetchingDetails && !stationDetails ? (
                  <View style={{ padding: 20, alignItems: 'center', minHeight: 100 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ marginTop: 10, color: colors.textTertiary }}>Loading details...</Text>
                  </View>
                ) : (
                  stationDetails ? (
                    <View>
                      <Text style={[styles.filterLabel, { color: colors.text, marginBottom: 8, fontSize: 18, fontWeight: "700" }]}>Charge Points</Text>

                      {stationDetails.charge_points?.map((cp: any) => (
                        <View key={cp.id} style={{ marginBottom: 12 }}>
                          <Text style={{ fontSize: 14, fontWeight: "500", color: colors.textSecondary, marginBottom: 8 }}>{cp.name} ({cp.status})</Text>
                          {cp.sockets?.map((socket: any) => {
                            const status = (socket.status_display || "").toLowerCase();

                            // Colors based on status
                            let statusColor = colors.border;
                            if (status === "available") statusColor = "#4BACE4"; // Blue
                            else if (status === "preparing") statusColor = "#2cdb9b"; // Green
                            else if (status === "charging") statusColor = "#FFCC00"; // Yellow

                            // Helper for Pulse Effect (simplified inline for now or use Lottie if needed)
                            // We will use a simple opacity animation for Charging

                            return (
                              <View key={socket.id} style={{
                                backgroundColor: colors.card,
                                borderRadius: 12,
                                padding: 16,
                                marginBottom: 8,
                                borderWidth: 1,
                                borderColor: statusColor, // Border matches status color
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}>
                                <View>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons name="flash" size={16} color={colors.text} />
                                    <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>{socket.power} kW {socket.type}</Text>
                                  </View>
                                  <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 13 }}>{socket.name}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end', gap: 6 }}>

                                  {/* Status Actions & Display */}
                                  {status === "available" ? (
                                    <Pressable
                                      onPress={() => setShowSocketError(true)} // Show "Not Plugged" modal
                                      style={({ pressed }) => ({
                                        backgroundColor: "#4BACE4", // Blue
                                        paddingHorizontal: 14,
                                        paddingVertical: 8,
                                        borderRadius: 88,
                                        opacity: pressed ? 0.8 : 1
                                      })}
                                    >
                                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Available</Text>
                                      </View>
                                    </Pressable>
                                  ) : status === "preparing" ? (
                                    <Pressable
                                      onPress={() => handleStartPress(socket.uuid)} // Standard Start Flow
                                      style={({ pressed }) => ({
                                        backgroundColor: "#2cdb9b", // Green
                                        paddingHorizontal: 14,
                                        paddingVertical: 8,
                                        borderRadius: 88,
                                        opacity: pressed ? 0.8 : 1
                                      })}
                                    >
                                      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                        <Ionicons name="flash" size={16} color="#fff" />
                                        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 12 }}>Start</Text>
                                      </View>
                                    </Pressable>
                                  ) : status === "charging" ? (
                                    <View
                                      style={{
                                        backgroundColor: "rgba(255, 204, 0, 0.15)", // Light Yellow bg
                                        paddingHorizontal: 12,
                                        paddingVertical: 6,
                                        borderRadius: 88,
                                        borderWidth: 1,
                                        borderColor: "#FFCC00"
                                      }}
                                    >
                                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                                        <Ionicons name="flash" size={14} color="#FFCC00" />
                                        <Text style={{ color: "#FFCC00", fontWeight: "800", fontSize: 12 }}>Charging</Text>
                                      </View>
                                    </View>
                                  ) : (
                                    /* Fallback / Other statuses */
                                    <Text style={{
                                      fontSize: 14,
                                      fontWeight: "700",
                                      color: "#ffb74d"
                                    }}>
                                      {socket.status_display}
                                    </Text>
                                  )}

                                  <Text style={{ color: colors.text, fontWeight: "600", fontSize: 13 }}>
                                    {socket.price_info?.price} ₺ / kWh
                                  </Text>
                                </View>
                              </View>
                            )
                          })}
                        </View>
                      ))}
                    </View>
                  ) : null
                )}
              </>
            )}

          </BottomSheetScrollView>
        </BottomSheetModal >

        {
          showSuccessToast && (
            <Animated.View style={{
              position: 'absolute',
              transform: [{ translateY: toastAnim }],
              alignSelf: 'center',
              backgroundColor: '#2CDD9D',
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 12,
              elevation: 10,
              zIndex: 100,
            }}>
              <Ionicons name="checkmark-circle" size={20} color="#0b2319" />
              <Text style={{ color: "#0b2319", fontWeight: "700", fontSize: 13 }}>Successfully logged in!</Text>
            </Animated.View>
          )
        }

        <SocketErrorModal
          visible={showSocketError}
          onClose={() => setShowSocketError(false)}
          onRetry={handleSocketRetry}
          onRepair={handleSocketRepair}
        />

        {/* Full Screen Charging Modal */}
        <Modal
          visible={charging.isActive && !charging.isMinimized}
          animationType="slide"
          presentationStyle="fullScreen"
        >
          <ChargingScreen
            state={charging}
            onMinimize={charging.toggleMinimize}
            onStop={handleStopCharging}
            onToggleDev={charging.setMode}
          />
        </Modal>

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
  colors,
}: FilterChipProps & { colors: any }) {
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
    outputRange: [colors.card, color],
  });
  const border = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, color],
  });
  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [color, "#ffffff"],
  });
  const subColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.textSecondary, "#ffffff"],
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

function TogglePill({ label, icon, active, onPress, colors }: TogglePillProps & { colors: any }) {
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
    outputRange: [colors.card, colors.primary],
  });
  const border = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.primary],
  });
  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.text, colors.primaryText],
  });
  const iconBg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.backgroundSecondary, colors.card],
  });
  const iconColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.text, colors.primary],
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
              color={active ? colors.primary : colors.text}
            />
          </Animated.View>
        </Animated.View>
        <Animated.Text
          style={[styles.toggleText, { color: textColor }]}
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 14,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContentDark: {
    backgroundColor: "#161616",
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
    flexDirection: "column",
    gap: 8,
    marginTop: 6,
  },
  tagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
    fontWeight: "900",
    fontSize: 15,
  },
  recenterBtnWrapper: {
    position: "absolute",
    bottom: 120, // Enough to be above potential bottom sheet tab or bottom nav
    right: 20,
    zIndex: 50,
  },
  recenterBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    elevation: 8,
  },
  recenterText: {
    fontWeight: "700",
    color: "#0f231c",
    fontSize: 14,
  },
});
