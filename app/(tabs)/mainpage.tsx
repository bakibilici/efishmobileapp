import ChargingScreen from "@/components/ChargingScreen";
import ChargingWidget from "@/components/ChargingWidget";
import SocketErrorModal from "@/components/SocketErrorModal";
import { useUser } from "@/context/UserContext";
import { useChargingSimulation } from "@/hooks/useChargingSimulation";
import { getRegisteredVehicles, getStationDetails, startChargingSession, stopChargingSession } from "@/services/api";
import { getAccessToken } from "@/services/tokenStorage";
import FontAwesome5 from "@expo/vector-icons/FontAwesome5";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetScrollView
} from "@gorhom/bottom-sheet";
import * as Haptics from 'expo-haptics';
import * as Localization from "expo-localization";
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
  Dimensions,
  Image,
  Keyboard,
  LayoutAnimation,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  UIManager,
  View
} from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, Region } from "react-native-maps";

// ... existing imports ...


import { Station, StationType } from "@/constants/stations";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/context/ThemeContext";
import Voice from '@react-native-voice/voice';
import { Flash, Microphone2, Notification, Setting4 } from "iconsax-react-native";


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

const pinImagesSelected: Record<string, any> = {
  HPC: require("../../assets/images/hpcstationmappin.png"),
  DC: require("../../assets/images/dcstationmappin.png"),
  AC: require("../../assets/images/acstationmappin.png"),
};

const pinImagesUnselected: Record<string, any> = {
  HPC: require("../../assets/images/hpcmappinunselected.png"),
  DC: require("../../assets/images/dcmappinunselected.png"),
  AC: require("../../assets/images/acmappinunselected.png"),
};

// Keep old reference for backward compat
const pinImages = pinImagesSelected;

const typeLightningCount: Record<StationType, number> = {
  AC: 1,
  DC: 2,
  HPC: 3,
};

// Marker size as percentage of screen width — consistent across all resolutions.
const SCREEN_W = Dimensions.get('window').width;
const PIN_W = Math.round(SCREEN_W * 0.08);   // 8% of screen width
const PIN_H = Math.round(PIN_W * 1.78);       // maintain pin aspect ratio
const PIN_SIZE = { w: PIN_W, h: PIN_H };

// Marker component — fixed size, only image source changes on selection.
const isAndroid = Platform.OS === 'android';

const MapPinMarker = React.memo(({ station, isSelected, onPress }: {
  station: Station;
  isSelected: boolean;
  onPress: (station: Station) => void;
}) => {
  const typeKey = String(station.type || "DC").toUpperCase();
  const imgSource = isSelected
    ? (pinImagesSelected[typeKey] || pinImagesSelected.DC)
    : (pinImagesUnselected[typeKey] || pinImagesUnselected.DC);

  const stationColor = getStationColor(station.type);

  const availableCount = station.socket_stats
    ? Object.values(station.socket_stats).reduce((acc: number, curr: any) => acc + (curr.available || 0), 0)
    : 0;

  // Android-only: bitmap tracking for 1.5s after visual changes
  const [tracking, setTracking] = React.useState(isAndroid);
  const visKey = `${isSelected}-${availableCount}-${typeKey}`;

  React.useEffect(() => {
    if (!isAndroid) return; // iOS needs NO tracking — fully static
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 1500);
    return () => clearTimeout(timer);
  }, [visKey]);

  return (
    <Marker
      coordinate={{ latitude: station.latitude, longitude: station.longitude }}
      onPress={() => onPress(station)}
      anchor={isAndroid ? { x: 0.5, y: 0.87 } : undefined}
      tracksViewChanges={isAndroid ? tracking : false}
      zIndex={isSelected ? 999 : 0}
    >
      {/* @ts-ignore */}
      <View collapsable={false} style={{
        width: PIN_SIZE.w,
        height: PIN_SIZE.h,
      }}>
        <Image
          source={imgSource}
          style={{ width: PIN_SIZE.w, height: PIN_SIZE.h }}
          resizeMode="stretch"
          fadeDuration={0}
        />
        <Text style={{
          position: 'absolute',
          bottom: '13%',
          width: '100%',
          textAlign: 'center',
          color: stationColor,
          fontSize: 11,
          fontWeight: '800',
          includeFontPadding: false,
        }}>
          {availableCount}
        </Text>
      </View>
    </Marker>
  );
});


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
  const reconnectAttempts = useRef(0);

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
    setTimeout(() => {
      bottomSheetRef.current?.snapToIndex(0);
    }, 50);

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


  const sendBoundingBoxUpdate = useCallback((region: Region) => {
    if (meterWsRef.current?.readyState === WebSocket.OPEN) {
      const minLon = region.longitude - region.longitudeDelta / 2;
      const maxLon = region.longitude + region.longitudeDelta / 2;
      const minLat = region.latitude - region.latitudeDelta / 2;
      const maxLat = region.latitude + region.latitudeDelta / 2;

      const payload = {
        type: "update_bounding_box",
        min_lat: minLat,
        max_lat: maxLat,
        min_lng: minLon,
        max_lng: maxLon
      };
      // console.log("🔌 WS SEND BBOX:", JSON.stringify(payload));
      meterWsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Debounced version of sendBoundingBoxUpdate
  // Debounced version of sendBoundingBoxUpdate
  const sendBoundingBoxUpdateDebounced = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (region: Region) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        sendBoundingBoxUpdate(region);
      }, 500); // 500ms debounce
    };
  }, [sendBoundingBoxUpdate]);


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

      // Method 1: No token in Query Param, use Header
      const wsUrl = `${scheme}://${host}/ws/meter-values/`;

      // @ts-ignore - React Native WebSocket accepts options as 3rd arg
      const ws = new WebSocket(wsUrl, [], {
        headers: {
          Origin: `https://${host}`,
          Authorization: `Bearer ${token}`
        },
      });

      ws.onopen = () => {
        console.log("Meter values WebSocket connected:", wsUrl);
        meterBaseWhRef.current = null;
        reconnectAttempts.current = 0; // Reset attempts on successful connection
      };

      ws.onmessage = (event) => {
        // console.log("🔌 WS RECV:", event.data);
        try {
          const data = JSON.parse(event.data);

          if (data.type === "connection_established") {
            console.log("WS Connection Established:", data.message);
            // Send initial bbox if available
            if (currentRegion.current) {
              sendBoundingBoxUpdate(currentRegion.current);
            }
            return;
          }

          if (data.type === "charge_areas_update") {
            if (Array.isArray(data.charge_areas)) {
              const stations = data.charge_areas.map((s: any) => {
                const lat = Number(s.lat);
                const lng = Number(s.lng);

                // Calculate total available sockets from socket_stats
                // Example stats: {"AC": {"available": 0, "total": 1}, "HPC": {"available": 1, "total": 1}}
                let availableCount = 0;
                let totalCount = 0;
                if (s.socket_stats) {
                  Object.values(s.socket_stats).forEach((stat: any) => {
                    availableCount += (stat.available || 0);
                    totalCount += (stat.total || 0);
                  });
                }

                // If no specific connectors list is sent, we can mock it or leave it empty
                // The map mostly needs location, status, type, and available count.
                // Detail view fetches full details separately.

                return {
                  id: s.id,
                  uuid: s.uuid,
                  name: s.name,
                  latitude: lat,
                  longitude: lng,
                  type: s.type, // "AC", "HPC", etc.
                  powerKw: s.max_power,
                  status: (s.status || "").toLowerCase(),
                  isEfish: true, // Assuming these are all efish for now
                  is_public: s.is_public,
                  is_24h: s.is_24h,
                  address: '',
                  socket_stats: s.socket_stats,
                  // We don't have full connector list in this update, but that's okay for the map pin
                  connectors: []
                };
              });

              setStationsList(stations);
            }
            return;
          }

          if (data.type === "charge_area_detail") {
            const detailData = data.data;
            if (detailData) {
              // Convert to our app's internal format if needed, mainly lat/lng are string in JSON
              const formattedDetail = {
                ...detailData,
                latitude: parseFloat(detailData.lat),
                longitude: parseFloat(detailData.lng),
                connectors: detailData.charge_points // Map your charge_points to connectors or keep as is? App seems to use 'connectors' in some places, but DetailView might use raw data.
              };
              setStationDetails(formattedDetail);
              setIsFetchingDetails(false);
            }
            return;
          }

          if (data.type === "socket_status") {
            const statusData = data.data;
            console.log("🔌 SOCKET CHANGE RECEIVED:", JSON.stringify(statusData, null, 2));
            if (statusData) {
              // 1. Update StationDetails (if open)
              setStationDetails((currentDetails: any) => {
                if (!currentDetails || !currentDetails.charge_points) return currentDetails;

                let hasChange = false;
                const updatedPoints = currentDetails.charge_points.map((cp: any) => {
                  if (!cp.sockets) return cp;
                  const updatedSockets = cp.sockets.map((s: any) => {
                    if (s.uuid === statusData.uuid) {
                      hasChange = true;
                      return {
                        ...s,
                        status: statusData.status,
                        status_display: statusData.status,
                      };
                    }
                    return s;
                  });
                  if (updatedSockets !== cp.sockets) {
                    // Check if any socket changed actually? 
                    // logic above creates new array if map runs, but elements only change if uuid matches.
                    // Actually cp.sockets.map returns new array always.
                    // We need to be careful about reference equality if we want to rely on 'hasChange' solely?
                    // But I set hasChange = true inside.
                    return { ...cp, sockets: updatedSockets };
                  }
                  return cp;
                });

                return hasChange ? { ...currentDetails, charge_points: updatedPoints } : currentDetails;
              });

              // 2. Update Map Markers
              if (currentRegion.current) {
                sendBoundingBoxUpdateDebounced(currentRegion.current);
              }
            }
            // Fallthrough to generic logic below
          }


          // Handle generic meter values / socket status for Active Charging Session
          let payload: any = {};
          let rawData = data;

          // Normalize if wrapped in "data"
          if (data.type === "socket_status" || data.type === "meter_values" || data.type === "charge_session") {
            rawData = data.data || {};
          }

          // Backend: type "socket_status" -> data.status "Charging", data.power, data.counter
          if (data.type === "socket_status" || (rawData.status && rawData.power)) {
            // ... existing charging widget update logic ... 
            // We reuse the parsing logic you already had, just ensuring it handles the new format which is cleaner.
            // The new 'socket_status' for a *specific* socket (global update) might not belong to *my* session.
            // We should verify if this socket update is relevant to MY active session if possible.
            // But existing logic seemed to assume any 'socket_status' *with power/counter* meant my session?
            // No, the new 'socket_status' is broadcasted. 
            // IMPORTANT: We must filter 'socket_status' to only update 'charging' simulation/widget 
            // IF it matches our session or we are just showing "A socket is charging".

            // The specification says "meter_values" is "sadece sarj yapan kullaniciya ozel".
            // So "meter_values" is the source of truth for the active session widget.
            // "socket_status" is for the map/details.
            // I will separate them to prevent map updates from confusing the charging widget.
          }

          if (data.type === "meter_values" || data.type === "charge_session") {
            console.log("🔌 METER VALUES RECEIVED:", JSON.stringify(data, null, 2));
            const d = rawData;
            const isCharging = (d.status || "").toLowerCase() === "charging" || !d.isCompleted;

            // Capture the charge session UUID if broadcasted, to allow stopping it after app restart
            if (d.uuid || d.charge_session_uuid) {
              activeChargeSessionUuidRef.current = d.uuid || d.charge_session_uuid;
            }

            // Spec: energy is Wh -> /1000 for kWh
            // Spec: power is W -> /1000 for kW
            // Spec: total_energy is kWh already.

            // Prioritize "total_energy" from message if available
            let chargedKwh = undefined;
            if (d.total_energy != null) {
              chargedKwh = parseFloat(String(d.total_energy));
            } else if (d.energy != null) {
              // If total not sent, maybe calculate from start meter?
              // But usually total_energy is sent.
              // Fallback: energy(Wh) / 1000
              chargedKwh = d.energy / 1000;
            }

            const powerKw = d.power != null ? d.power / 1000 : 0;
            const batteryLevel = d.soc ?? null;

            payload = {
              power_kw: powerKw,
              charged_kwh: chargedKwh,
              cost: d.price != null && d.total_energy != null ? (d.price * d.total_energy) : undefined,
              batteryLevel: batteryLevel,
              started_at: d.started_at
            };

            if (Object.keys(payload).length > 0) {
              charging.updateFromMeterValues({
                batteryLevel: payload.batteryLevel,
                power_kw: payload.power_kw,
                charged_kwh: payload.charged_kwh,
                cost: payload.cost,
                started_at: payload.started_at,
                socket_type: d.socket_type, // HPC, DC, AC
                start_soc: d.start_soc,     // Initial battery level
                status: d.status,           // INITIATED, CHARGING, etc.
              } as any);
            }
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

        // Stop reconnecting if we get a 403 Forbidden
        if (event.reason && event.reason.includes("403")) {
          console.warn("WebSocket Auth Failed (403). Stopping reconnect loop.");
          return;
        }

        // Uygulama açıkken sürekli dinleyebilmek için kapanınca yeniden bağlan (giriş yapmış kullanıcı için)
        if (user && !reconnectTimeoutRef.current) {
          reconnectAttempts.current += 1;
          const attempt = reconnectAttempts.current;
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s... max 30s
          const delay = isReconnect ? Math.min(30000, 1000 * Math.pow(2, attempt - 1)) : 1000;

          console.log(`WebSocket Reconnecting in ${delay}ms (Attempt ${attempt})`);

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
  }, [charging.updateFromMeterValues, user, sendBoundingBoxUpdate]);

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
  }, [charging]);

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
    // If WS is open, send request
    if (meterWsRef.current?.readyState === WebSocket.OPEN) {
      console.log("Requesting details via WS for:", uuid);
      meterWsRef.current.send(JSON.stringify({
        type: "get_charge_area_detail",
        uuid: uuid
      }));
      // We don't await here, we wait for 'charge_area_detail' message
      // Timeout fallback? 
      // For now assume it works. State 'isFetchingDetails' will stay true until message received.
      // Add a safety timeout to clear loader?
      setTimeout(() => {
        setIsFetchingDetails((current) => {
          if (current) return false; // turn off if still on
          return current;
        });
      }, 5000);
    } else {
      // Fallback to HTTP if WS not connected
      try {
        const data = await getStationDetails(uuid);
        setStationDetails(data);
      } catch (e) {
        console.error("Fetch details error", e);
      } finally {
        setIsFetchingDetails(false);
      }
    }
  };

  const [search, setSearch] = useState("");
  const [typeFilters, setTypeFilters] = useState<StationType[]>([]);
  const [onlyEfish, setOnlyEfish] = useState(false);
  const [showPublic, setShowPublic] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [userLocation, setUserLocation] =
    useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean>(false);

  const topInset =
    Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 24 : 60;

  const { colors, themeScheme } = useTheme();
  const isDark = themeScheme === 'dark';

  const [isFiltersVisible, setIsFiltersVisible] = useState(false);
  const filterDrawerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(filterDrawerAnim, {
      toValue: isFiltersVisible ? 1 : 0,
      duration: 250,
      useNativeDriver: false, // height cannot use native driver
    }).start();
  }, [isFiltersVisible]);

  const toggleFilters = () => {
    setIsFiltersVisible(!isFiltersVisible);
  };

  // Login Success Toast

  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const toastAnim = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    if (charging.isActive && !charging.isMinimized) {
      // Small delay to ensure ref is ready
      const timer = setTimeout(() => {
        chargingBottomSheetRef.current?.present();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      chargingBottomSheetRef.current?.dismiss();
    }
  }, [charging.isActive, charging.isMinimized]);

  // Header Slide Down Animation
  const headerAnim = useRef(new Animated.Value(-200)).current;

  useEffect(() => {
    // If charging screen is full-screen (not minimized), slide header up and away
    const isBottomSheetOpen = charging.isActive && !charging.isMinimized;
    Animated.spring(headerAnim, {
      toValue: isBottomSheetOpen ? -200 : 0,
      useNativeDriver: true,
      speed: 12,
      bounciness: 6,
    }).start();

    // Tell _layout.tsx to hide/show the tab bar
    DeviceEventEmitter.emit('toggleBottomSheet', isBottomSheetOpen);
  }, [charging.isActive, charging.isMinimized]);

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
  const snapPoints = useMemo(() => ["50%", "90%"], []);

  const typeListBottomSheetRef = useRef<BottomSheetModal>(null);
  const typeListSnapPoints = useMemo(() => ["15%", "35%", "90%"], []);
  const [bottomSheetSelectedType, setBottomSheetSelectedType] = useState<StationType | null>(null);
  const [isTypeListOpen, setIsTypeListOpen] = useState(false);

  const chargingBottomSheetRef = useRef<BottomSheetModal>(null);
  const chargingSnapPoints = useMemo(() => ["90%"], []);

  useEffect(() => {
    if (
      Platform.OS === "android" &&
      UIManager.setLayoutAnimationEnabledExperimental
    ) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Animated value for type buttons slide in/out
  const typeButtonsAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const shouldShow = !isFiltersVisible && !isTypeListOpen;
    Animated.timing(typeButtonsAnim, {
      toValue: shouldShow ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isFiltersVisible, isTypeListOpen]);

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


  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechError = (e) => {
      // Gracefully handle "No speech detected" timeouts
      const isNoSpeech = e.error?.message?.includes("No speech detected") || e.error?.code === "7";
      if (!isNoSpeech) {
        console.error("Speech Error:", e);
      }
      setIsListening(false);
    };
    Voice.onSpeechResults = (e) => {
      if (e.value && e.value.length > 0) {
        setSearch(e.value[0]);
      }
    };
    Voice.onSpeechPartialResults = (e) => {
      if (e.value && e.value.length > 0) {
        setSearch(e.value[0]);
      }
    };

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  const toggleListening = async () => {
    try {
      if (isListening) {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await Voice.stop();
      } else {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const locale = Localization.getLocales()[0].languageTag || "tr-TR";
        await Voice.start(locale);
      }
    } catch (e) {
      console.error("Toggle Listening Error:", e);
    }
  };

  // Keep track of current region to refetch when filters change
  const currentRegion = useRef<Region>(initialRegion);

  const onRegionChangeComplete = (region: Region) => {
    currentRegion.current = region;
    sendBoundingBoxUpdate(region);

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

  // Re-fetch when filters change (send update over socket)
  useEffect(() => {
    sendBoundingBoxUpdate(currentRegion.current);
  }, [typeFilters, sendBoundingBoxUpdate]);

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
    Keyboard.dismiss();
    setSelectedStation(station);
    setStationDetails(null); // Reset details
    setBottomSheetMode('details'); // Ensure we start in details mode
    bottomSheetRef.current?.present();
    // Force snap to index 0 (50%) specifically with a small timeout to let it mount
    setTimeout(() => {
      bottomSheetRef.current?.snapToIndex(0);
    }, 50);

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
        color: "#007aff", // iOS Blue
        icon: "globe",
        active: showPublic,
        kind: "toggle" as const,
        onPress: () => {
          withAnimation();
          setShowPublic((v) => !v);
        },
      },
      {
        key: "favorites",
        label: "Favorites",
        color: "#ff3b30", // iOS Red for heart
        icon: "heart",
        active: showFavorites,
        kind: "toggle" as const,
        onPress: () => {
          withAnimation();
          setShowFavorites((v) => !v);
        },
      },
    ];

    return { types, toggles };
  }, [typeFilters, onlyEfish, showPublic, showFavorites]);

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.page, { backgroundColor: colors.background }]}>
        <View style={styles.container}>
          <MapView
            ref={mapRef}
            onPress={() => Keyboard.dismiss()}
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

            {filteredStations.map((station) => (
              <MapPinMarker
                key={station.id}
                station={station}
                isSelected={selectedStation?.id === station.id}
                onPress={handleMarkerPress}
              />
            ))}
          </MapView>

          <View style={[styles.overlay, { paddingTop: topInset }]}>
            {/* Main Header Card Container */}
            <Animated.View style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              paddingTop: Platform.OS === 'ios' ? topInset : topInset - 15,
              backgroundColor: isDark ? "rgba(30, 30, 30, 0.85)" : "rgba(255, 255, 255, 0.95)", // Semi-transparent for glass effect
              borderBottomLeftRadius: 24,
              borderBottomRightRadius: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 }, // Reduced shadow
              shadowOpacity: 0.1,
              shadowRadius: 12,
              elevation: 8,
              zIndex: 10,
              transform: [{ translateY: headerAnim }],
              overflow: 'hidden' // FIX: Ensure child content (chips) doesn't overflow rounded corners
            }}>
              {/* Row 1: Search & Bell/Login */}
              <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, marginBottom: 12, alignItems: 'center' }}>
                <View style={{
                  flex: 1,
                  height: 48, // Slightly taller
                  backgroundColor: isDark ? "#333" : "#fff", // Use white in light mode for contrast
                  borderRadius: 99,
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: isDark ? "#444" : "#e0e0e0", // Subtle borde
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                    <TextInput
                      placeholder={isTypeListOpen && bottomSheetSelectedType ? `${bottomSheetSelectedType} Stations` : "Search"}
                      placeholderTextColor={isTypeListOpen && bottomSheetSelectedType ? colors.text : colors.textTertiary}
                      value={search}
                      onChangeText={setSearch}
                      editable={!isTypeListOpen}
                      style={{
                        flex: 1,
                        paddingHorizontal: 16,
                        fontSize: 16,
                        color: colors.text,
                        fontWeight: isTypeListOpen && bottomSheetSelectedType ? '700' : 'normal',
                      }}
                    />
                    {isTypeListOpen && bottomSheetSelectedType ? (
                      <Pressable
                        onPress={() => {
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          setBottomSheetSelectedType(null);
                          setIsTypeListOpen(false);
                          typeListBottomSheetRef.current?.dismiss();
                          DeviceEventEmitter.emit('toggleBottomSheet', false);
                        }}
                        style={{ paddingRight: 12 }}
                      >
                        <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
                      </Pressable>
                    ) : (
                      <Pressable
                        onPress={toggleListening}
                        style={{ paddingRight: 12 }}
                      >
                        <Microphone2
                          size={20}
                          color={isListening ? colors.primary : colors.textTertiary}
                          variant={isListening ? "Bold" : "Outline"}
                        />
                      </Pressable>
                    )}
                  </View>

                </View>
                <Pressable
                  onPress={toggleFilters}
                  hitSlop={8}
                  style={{ padding: 4 }}
                >
                  <Setting4
                    size={22}
                    color={isFiltersVisible ? colors.primary : colors.textSecondary}
                    variant={isFiltersVisible ? "Bold" : "Outline"}
                  />
                </Pressable>
                {user ? (
                  <Pressable style={{
                    width: 48, // Match height
                    height: 48,
                    borderRadius: 99,
                    alignItems: "center",
                    justifyContent: "center"
                  }}>
                    <Notification
                      size={24}
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
                    style={{
                      height: 48,
                      paddingHorizontal: 16,
                      backgroundColor: colors.primary,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      shadowColor: colors.primary,
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: 0.3,
                      shadowRadius: 8,
                      elevation: 4,
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Log In</Text>
                  </Pressable>
                )}
              </View>
              {/* Row 2: Filters (Animated Drawer) */}
              <Animated.View style={{
                height: filterDrawerAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 90] // Enough height for exactly 2 lines + gaps
                }),
                opacity: filterDrawerAnim,
                overflow: 'hidden',
                paddingHorizontal: 16,
                marginTop: 4,
                gap: 12,
              }}>
                {/* Row 1: Types */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {types.map((item) => (
                    <FilterChip
                      key={item.key}
                      label={item.label}
                      color={item.color}
                      active={item.active}
                      lightningCount={item.lightningCount}
                      onPress={item.onPress}
                      colors={colors}
                      compact
                      style={{ flex: 1 }}
                    />
                  ))}
                </View>

                {/* Row 2: Toggles (now rendering as FilterChips) */}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {toggles.map((item) => (
                    <FilterChip
                      key={item.key}
                      label={item.label}
                      color={item.color}
                      active={item.active}
                      icon={item.icon}
                      onPress={item.onPress}
                      colors={colors}
                      compact
                      style={{ flex: 1 }}
                    />
                  ))}
                </View>
              </Animated.View>

              {/* Solid Type Buttons — animated slide in/out */}
              <Animated.View style={{
                overflow: 'hidden',
                height: typeButtonsAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 52],
                }),
                opacity: typeButtonsAnim,
              }}>
                <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 12, marginTop: 4 }}>
                  {(["HPC", "DC", "AC"] as StationType[]).map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setBottomSheetSelectedType(t);
                        setIsTypeListOpen(true);
                        bottomSheetRef.current?.dismiss();
                        typeListBottomSheetRef.current?.present();
                        // Provide a short timeout so BottomSheet has time to mount before we force snap
                        setTimeout(() => {
                          typeListBottomSheetRef.current?.snapToIndex(1);
                        }, 50);
                        DeviceEventEmitter.emit('toggleBottomSheet', true);

                        // Zoom out the map to a wider view (delta ≈ 0.2)
                        if (mapRef.current) {
                          const center = userLocation ? {
                            latitude: userLocation.coords.latitude,
                            longitude: userLocation.coords.longitude,
                          } : {
                            latitude: currentRegion.current.latitude,
                            longitude: currentRegion.current.longitude,
                          };

                          mapRef.current.animateToRegion({
                            ...center,
                            latitudeDelta: 0.2,
                            longitudeDelta: 0.2,
                          }, 500);
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: typeColors[t],
                        paddingVertical: 10,
                        borderRadius: 99,
                        alignItems: 'center',
                        flexDirection: 'row',
                        justifyContent: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 4 }}>
                        {Array.from({ length: typeLightningCount[t] }).map((_, i) => (
                          <View key={i} style={{ marginLeft: i > 0 ? -10 : 0, zIndex: i }}>
                            <Flash variant="Bold" size={16} color="#ffffff" />
                          </View>
                        ))}
                      </View>
                      <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </Animated.View>

            </Animated.View>

          </View>

          {/* Floating Charging Widget at Bottom */}
          {charging.isActive && charging.isMinimized && (
            <View style={styles.floatingWidgetContainer}>
              <ChargingWidget
                state={charging}
                onExpand={() => {
                  charging.toggleMinimize();
                }}
              />
            </View>
          )}

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
            index={0}
            snapPoints={snapPoints}
            onDismiss={closeSheet}
            enablePanDownToClose
            backdropComponent={renderBackdrop}
            handleComponent={null}
            enableDynamicSizing={false}
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
                              {`${v.vehicle?.model?.brand?.name} - ${v.vehicle?.model?.name}`}
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
                          <View style={{ flexDirection: 'row' }}>
                            <Text
                              style={[
                                styles.stationName,
                                isDark ? styles.stationNameDark : styles.stationNameLight]}
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
                        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
                          <Pressable
                            onPress={closeSheet}
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

          {/* Full Screen Charging Bottom Sheet */}
          <BottomSheetModal
            ref={chargingBottomSheetRef}
            index={0}
            snapPoints={chargingSnapPoints}
            enablePanDownToClose={true}
            style={{ zIndex: 999, elevation: 999 }}
            onDismiss={() => {
              // If swiped down by user (or dismissed any other way), state updates natively.
              // Using setMinimized(true) instead of toggle prevents looping.
              if (charging.isActive && !charging.isMinimized) {
                charging.setMinimized(true);
              }
            }}
            backgroundStyle={{ backgroundColor: isDark ? '#121212' : '#F2F2F7' }}
            handleIndicatorStyle={{ backgroundColor: isDark ? '#333' : '#E5E5EA' }}
          >
            <BottomSheetScrollView contentContainerStyle={{ flexGrow: 1 }}>
              <ChargingScreen
                state={charging}
                onMinimize={() => {
                  charging.setMinimized(true);
                }}
                onStop={() => {
                  charging.setMinimized(true);
                  handleStopCharging();
                }}
                onToggleDev={charging.setMode}
              />
            </BottomSheetScrollView>
          </BottomSheetModal>

          {/* Type List Bottom Sheet */}
          <BottomSheetModal
            ref={typeListBottomSheetRef}
            index={1} // Default open to 50%
            snapPoints={typeListSnapPoints}
            enablePanDownToClose={false}
            enableOverDrag={false}
            enableDynamicSizing={false}
            backgroundStyle={{ backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }}
            handleIndicatorStyle={{ backgroundColor: isDark ? '#333' : '#E5E5EA' }}
          >
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 12, marginTop: 8 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>
                  {bottomSheetSelectedType} Stations
                </Text>
                <Pressable
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setBottomSheetSelectedType(null);
                    setIsTypeListOpen(false);
                    typeListBottomSheetRef.current?.dismiss();
                    DeviceEventEmitter.emit('toggleBottomSheet', false);
                  }}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close" size={24} color={colors.textSecondary} />
                </Pressable>
              </View>
              <BottomSheetFlatList
                data={stationsList.filter(s => {
                  if (!bottomSheetSelectedType) return false;
                  // Look at primary type OR check socket_stats for matching type
                  return s.type === bottomSheetSelectedType ||
                    (s.socket_stats && s.socket_stats[bottomSheetSelectedType] && s.socket_stats[bottomSheetSelectedType].total > 0);
                })}
                keyExtractor={(item: Station) => item.id}
                bounces={false}
                contentContainerStyle={[
                  { paddingHorizontal: 16, paddingBottom: 24 },
                  stationsList.filter(s => {
                    if (!bottomSheetSelectedType) return false;
                    return s.type === bottomSheetSelectedType ||
                      (s.socket_stats && s.socket_stats[bottomSheetSelectedType] && s.socket_stats[bottomSheetSelectedType].total > 0);
                  }).length === 0 ? { flex: 1 } : { gap: 12 }
                ]}
                ListEmptyComponent={() => (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', minHeight: 150, padding: 20 }}>
                    <Ionicons name="search-outline" size={48} color={colors.textTertiary} style={{ marginBottom: 16 }} />
                    <Text style={{ fontSize: 18, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' }}>
                      No stations found.
                    </Text>
                    <Text style={{ fontSize: 14, color: colors.textTertiary, textAlign: 'center', marginTop: 8 }}>
                      There are no stations matching the selected type in this area.
                    </Text>
                  </View>
                )}
                renderItem={({ item }: { item: Station }) => {
                  let distanceText = "";
                  if (userLocation) {
                    const dist = getDistanceFromLatLonInKm(
                      userLocation.coords.latitude,
                      userLocation.coords.longitude,
                      item.latitude,
                      item.longitude
                    );
                    distanceText = ` • ${dist.toFixed(1)} km`;
                  } else if (item.distanceKm) {
                    distanceText = ` • ${item.distanceKm} km`;
                  }

                  const isAvailable = item.status === "available";

                  return (
                    <Pressable
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setBottomSheetSelectedType(null);
                        setIsTypeListOpen(false);
                        typeListBottomSheetRef.current?.dismiss();
                        DeviceEventEmitter.emit('toggleBottomSheet', false);
                        handleMarkerPress(item); // Focus on map and open details
                      }}
                      style={{
                        backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                        padding: 16,
                        borderRadius: 20,
                        borderWidth: 1,
                        borderColor: isDark ? '#333333' : '#EAEAEA',
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.05,
                        shadowRadius: 10,
                        elevation: 3,
                        marginBottom: 4,
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <View style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}>
                        {/* Avatar / Icons with Tighter Stacking */}
                        <View style={{
                          width: 48,
                          height: 48,
                          borderRadius: 24,
                          backgroundColor: getStationColor(item.type) + '15',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 14,
                          flexDirection: 'row'
                        }}>
                          {Array.from({ length: typeLightningCount[item.type as StationType] || 1 }).map((_, i) => (
                            <View key={i} style={{ marginLeft: i > 0 ? -12 : 0, zIndex: i }}>
                              <Ionicons name="flash" size={20} color={getStationColor(item.type)} />
                            </View>
                          ))}

                          {/* Live Status Indicator attached to the Avatar */}
                          <View style={{
                            position: 'absolute',
                            top: 4,
                            right: -2,
                            width: 16,
                            height: 16,
                            borderRadius: 96,
                            backgroundColor: isAvailable ? "#2cdb9b" : "#ff3b30",
                            borderWidth: 3,
                            borderColor: isDark ? '#1C1C1E' : '#FFFFFF'
                          }} />
                        </View>

                        {/* Station Text Details */}
                        <View style={{ flex: 1, justifyContent: 'center', paddingRight: 8 }}>
                          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 4 }} numberOfLines={1}>{item.name}</Text>
                          <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '500' }}>
                            {item.powerKw} kW{distanceText}
                          </Text>
                        </View>
                      </View>

                      {/* Action Buttons Aligned Right */}
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <Pressable
                          onPress={() => {
                            DeviceEventEmitter.emit('toggleBottomSheet', false);
                            router.push({
                              pathname: "/modal",
                              params: {
                                name: item.name,
                                lat: String(item.latitude),
                                lng: String(item.longitude),
                              },
                            });
                          }}
                          style={{
                            backgroundColor: colors.primary,
                            paddingHorizontal: 14,
                            height: 38,
                            borderRadius: 19,
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            gap: 4
                          }}
                        >
                          <Ionicons name="navigate" size={16} color="#fff" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: "#fff" }}>Directions</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                }}
              />
            </View>
          </BottomSheetModal>

        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}


type FilterChipProps = {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
  lightningCount?: number;
  icon?: any;
  compact?: boolean;
  style?: any;
};

function FilterChip({
  label,
  color,
  active,
  onPress,
  lightningCount,
  icon,
  colors,
  compact,
  style,
}: FilterChipProps & { colors: any }) {
  const anim = React.useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: active ? 1 : 0,
      tension: 50,
      friction: 7,
      useNativeDriver: false,
    }).start();
  }, [active, anim]);

  // Use a subtle gray for inactive state.
  const inactiveColor = "#9e9e9e";

  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", colors.card], // transparent when unselected, card when selected
  });
  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveColor, color], // gray when unselected, colored when selected
  });

  return (
    <Pressable onPress={onPress} style={style}>
      <Animated.View
        style={[
          styles.chip,
          {
            backgroundColor: bg,
            width: '100%',
          },
        ]}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: 'center', borderWidth: 0.5, borderColor: "rgba(0, 0, 0, 0.1)", flex: 1, paddingVertical: 6, borderRadius: 99 }}>
          {lightningCount ? (
            <View style={{ flexDirection: "row", marginRight: label ? (compact ? 4 : 6) : 0 }}>
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
                    size={compact ? 16 : 16}
                    color={active ? color : inactiveColor}
                  />
                </View>
              ))}
            </View>
          ) : icon ? (
            <Ionicons
              name={icon}
              size={compact ? 16 : 16}
              color={active ? color : inactiveColor}
              style={{ marginRight: label ? (compact ? 4 : 6) : 0 }}
            />
          ) : null}
          {label && label.length > 0 ? (
            <Animated.Text style={[styles.chipText, { color: textColor, fontSize: compact ? 15 : 15 }]}>
              {label}
            </Animated.Text>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
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
    left: 0, // Reset to 0
    right: 0, // Reset to 0
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
    borderRadius: 999,
  },
  chipDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  chipText: {
    fontWeight: "700",
    fontSize: 16,
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
    paddingTop: 20
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
  floatingWidgetContainer: {
    position: 'absolute',
    top: 180, // Safely below header + chips
    left: 16,
    right: 16,
    zIndex: 60,
  },
  recenterBtn: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 999,
    width: 60,
    height: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  recenterText: {
    fontWeight: "700",
    color: "#0f231c",
    fontSize: 14,
  },
});
