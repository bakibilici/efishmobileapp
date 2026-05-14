import * as Sentry from "@sentry/react-native";
import axios from "axios";
import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { clearTokens, getRefreshToken, saveTokens } from "./tokenStorage";

// Determing Base URL
const BASE_URL = __DEV__
  ? process.env.EXPO_PUBLIC_API_URL_DEV
  : process.env.EXPO_PUBLIC_API_URL_PROD;

const CLIENT_ID = process.env.EXPO_PUBLIC_CLIENT_ID;
const CLIENT_SECRET = process.env.EXPO_PUBLIC_CLIENT_SECRET;

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

const buildQueryString = (params?: Record<string, any>): string => {
  if (!params) return "";

  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (
      value === undefined ||
      value === null ||
      value === "" ||
      (typeof value === "number" && Number.isNaN(value))
    ) {
      return;
    }
    searchParams.append(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

// In-memory token variable for synchronous access
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    console.log("[API] Auth token set in memory");
  } else {
    console.log("[API] Auth token cleared");
  }
};

api.interceptors.request.use(
  (config) => {
    // Use in-memory token - synchronous and reliable
    console.log(
      `[API REQUEST] ${config.method?.toUpperCase()} ${config.url}`,
      authToken ? `Token: ${authToken.substring(0, 10)}...` : "NO TOKEN",
    );

    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    } else {
      console.log(`[API WARNING] No token for ${config.url}`);
    }

    // Always attach device headers if possible, or at least Device-ID
    const devicePayload = getDevicePayload();
    if (devicePayload.device_id) {
      config.headers["Device-ID"] = devicePayload.device_id;
    }
    if (CLIENT_ID) {
      config.headers["Client-Id"] = CLIENT_ID;
    }
    if (CLIENT_SECRET) {
      config.headers["Client-Secret"] = CLIENT_SECRET;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Prevent infinite loops
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        // Get refresh token from storage (keep this async as it's infrequent)
        const refreshToken = await getRefreshToken();

        if (refreshToken) {
          const payload = {
            refresh_token: refreshToken,
            ...getDevicePayload(),
          };

          const headers: any = {
            "Content-Type": "application/json",
          };
          if (CLIENT_ID) headers["Client-Id"] = CLIENT_ID;
          if (CLIENT_SECRET) headers["Client-Secret"] = CLIENT_SECRET;

          // Call refresh endpoint with proper headers
          const response = await axios.post(
            `${BASE_URL}/api/v1/web/auth/refresh/`,
            payload,
            {
              headers,
            },
          );

          if (response.data && response.data.access_token) {
            const newAccessToken = response.data.access_token;
            const newRefreshToken = response.data.refresh_token || refreshToken;

            // Update storage
            await saveTokens(newAccessToken, newRefreshToken);

            // Update in-memory token
            setAuthToken(newAccessToken);

            // Update header and retry
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            if (CLIENT_ID) originalRequest.headers["Client-Id"] = CLIENT_ID;
            if (CLIENT_SECRET)
              originalRequest.headers["Client-Secret"] = CLIENT_SECRET;

            return api(originalRequest);
          }
        }
      } catch (refreshError: any) {
        console.log(
          "Token refresh failed",
          refreshError.response?.status,
          refreshError.response?.data,
        );
        await clearTokens();
        setAuthToken(null);
      }
    }
    Sentry.captureException(error);
    return Promise.reject(error);
  },
);

export const getDevicePayload = () => {
  return {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    device_id: Device.osBuildId || "unknown_device_id", // Fallback, better to use proper uuid in real app
    fcm_token: "firebase_token_xyz789_new_token", // TODO: Integrate actual FCM
    platform: Platform.OS === "ios" ? "IOS" : "ANDROID",
    platform_version: `${Device.osName} ${Device.osVersion}`,
    app_version: Application.nativeApplicationVersion || "1.0.0",
    device_model: Device.modelName || "Unknown Model",
    device_name: Device.deviceName || "Unknown Device",
  };
};

export const sendOtp = async (phoneNumber: string) => {
  // phoneNumber should be formatted e.g. "90555..." or "1555..."
  const payload = {
    phone_number: phoneNumber,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  };
  const response = await api.post("/api/v1/web/auth/send-otp/", payload);
  return response.data;
};

export const verifyOtp = async (phoneNumber: string, otp: string) => {
  const devicePayload = getDevicePayload();
  const payload = {
    phone_number: phoneNumber,
    otp,
    ...devicePayload,
  };
  const response = await api.post("/api/v1/web/auth/verify-otp/", payload);
  return response.data;
};

export type RegisterPayload = {
  first_name: string;
  last_name: string;
  phone_code: string;
  phone_number: string;
  birthday: string; // YYYY-MM-DD
  is_turkish: boolean;
  // If Turkish
  tckn?: string;
  // If Foreigner
  passport_number?: string;
  registered_token: string;
};

export const register = async (data: RegisterPayload) => {
  const devicePayload = getDevicePayload();
  const payload = {
    ...data,
    ...devicePayload,
  };
  const response = await api.post("/api/v1/web/auth/register/", payload);
  return response.data;
};

export type UserProfile = {
  id: number;
  uuid?: string;
  username: string;
  email: string; // May be empty
  first_name: string;
  last_name: string;
  phone_code: string;
  phone_number: string;
  is_turkish: boolean;
  tckn?: string;
  passport_number?: string;
  birthday?: string;
  // Non-null when the user has a charge in progress (possibly started from
  // another device). On bootstrap / foreground, open the session WS immediately.
  active_charge_session_uuid?: string | null;
  // Add other profile fields if needed
};

export const getProfile = async () => {
  const response = await api.get("/api/v1/web/profile/");
  console.log("getProfile response:", JSON.stringify(response.data, null, 2));

  // Handle different response structures
  let profileData = response.data;
  if (profileData?.data) {
    profileData = profileData.data;
  }

  // API returns paginated results: { count, next, previous, results: [...] }
  // Extract the first (and typically only) profile from results
  if (profileData?.results && Array.isArray(profileData.results)) {
    return profileData.results[0] || null;
  }

  return profileData;
};

export const logout = async () => {
  const devicePayload = getDevicePayload();
  const response = await api.post("/api/v1/web/auth/logout/", devicePayload);
  return response.data;
};

export const getStations = async (bbox: string, types?: string[]) => {
  // bbox format: minLon,minLat,maxLon,maxLat
  let url = `/api/v1/web/stations/charge-areas/?bbox=${bbox}`;
  if (types && types.length > 0) {
    url += `&type=${types.join(",").toLowerCase()}`;
  }

  const response = await api.get(url);
  const results = response.data.results || [];

  return results.map((item: any) => ({
    id: String(item.id),
    uuid: item.uuid,
    name: item.name,
    latitude: parseFloat(item.lat),
    longitude: parseFloat(item.lng),
    type: item.type,
    powerKw: item.max_power,
    status: item.status.toLowerCase(),
    isEfish: false, // Default or parse if available
    address: "", // Not in list response
    is_public: item.is_public,
    is_24h: item.is_24h,
    socket_stats: item.socket_stats,
    connectors: [], // populated only on detail
    distanceKm: 0, // calculated on UI
  }));
};

/**
 * Harita bounding box + zoom ile pin ve cluster verisi çeker.
 * Haritanın moveend/zoomend event'lerinde ~300ms debounce ile çağrılmalı.
 */
export const getMapStations = async (params: {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
  zoom: number;
}) => {
  const qs = buildQueryString(params);
  const response = await api.get(`/api/v1/web/stations/charge-areas/map/${qs}`);
  const data = response.data?.data || response.data;
  return data;
};

export const getStationDetails = async (id: string) => {
  // Ensure trailing slash for Django-like backends
  const response = await api.get(`/api/v1/web/stations/charge-areas/${id}/`);
  console.log(
    `Station Details (${id}):`,
    JSON.stringify(response.data, null, 2),
  );
  return response.data.data ? response.data.data : response.data;
};

// EV catalog endpoints for cascading dropdowns

export const getVehicleBrands = async (params?: {
  ordering?: string;
  page?: number;
  page_size?: number;
  search?: string;
}) => {
  const qs = buildQueryString(params);
  const response = await api.get(`/api/v1/ev/web/brands/${qs}`);
  return response.data;
};

export const getVehicleModelsByBrand = async (
  brandUuid: string,
  params?: {
    ordering?: string;
    page?: number;
    page_size?: number;
    search?: string;
  },
) => {
  const qs = buildQueryString({ ...params, brand: brandUuid });
  const response = await api.get(`/api/v1/ev/web/models/${qs}`);
  return response.data;
};

export const getVehiclesByBrandAndModel = async (
  brandUuid: string,
  modelUuid: string,
  params?: {
    ordering?: string;
    page?: number;
    page_size?: number;
    search?: string;
  },
) => {
  const qs = buildQueryString({
    ...params,
    brand: brandUuid,
    model: modelUuid,
  });
  const response = await api.get(`/api/v1/ev/web/vehicles/${qs}`);
  return response.data;
};

export const getRegisteredVehicles = async () => {
  const response = await api.get("/api/v1/web/registered-vehicles/");
  return response.data;
};

export const getRegisteredVehicleDetail = async (id: string) => {
  const response = await api.get(`/api/v1/web/registered-vehicles/${id}/`);
  return response.data;
};

export const getVehicleModels = async () => {
  const response = await api.get("/api/v1/ev/web/vehicles/");
  return response.data;
};

export const addRegisteredVehicle = async (data: {
  vehicle: string;
  plate_number: string;
  vehicle_type: string;
}) => {
  const response = await api.post("/api/v1/web/registered-vehicles/", data);
  return response.data;
};

export const updateRegisteredVehicle = async (
  uuid: string,
  data: { plate_number?: string; vehicle?: string; vehicle_type?: string },
) => {
  const response = await api.patch(
    `/api/v1/web/registered-vehicles/${uuid}/`,
    data,
  );
  return response.data;
};

export const deleteRegisteredVehicle = async (uuid: string) => {
  const response = await api.delete(`/api/v1/web/registered-vehicles/${uuid}/`);
  return response.data;
};

export const startChargingSession = async (
  data: { vehicle: number; address?: number },
  socket_uuid: string,
) => {
  const response = await api.post(
    `/api/v1/web/chargesessions/${socket_uuid}/start/`,
    data,
  );
  return response.data;
};

export const stopChargingSession = async (
  charge_session_uuid: string,
  end_reason?: string,
) => {
  const response = await api.post(
    `/api/v1/web/chargesessions/${charge_session_uuid}/stop/`,
    end_reason ? { end_reason } : undefined,
  );
  return response.data;
};

// ────────────── Addresses ──────────────

export type AddressType = "CORPORATE" | "INDIVIDUAL";

export type Address = {
  id: number;
  uuid: string;
  address: string;
  district: number | null;
  city?: number;
  country?: number;
  district_name?: string;
  city_name?: string;
  country_name?: string;
  postal_code: string;
  title: string;
  company_name: string;
  type: AddressType;
  tax_number: string;
  tax_office: string;
  is_default: boolean;
};

export type CreateAddressPayload = {
  address: string;
  district: number | null;
  postal_code: string;
  title: string;
  company_name: string;
  type: AddressType;
  tax_number: string;
  tax_office: string;
  is_default: boolean;
};

export const getAddresses = async () => {
  const response = await api.get("/api/v1/web/addresses/");
  return response.data;
};

export const getAddressDetail = async (uuid: string) => {
  const response = await api.get(`/api/v1/web/addresses/${uuid}/`);
  return response.data;
};

export const createAddress = async (data: CreateAddressPayload) => {
  const response = await api.post("/api/v1/web/addresses/", data);
  return response.data;
};

export const updateAddress = async (
  uuid: string,
  data: CreateAddressPayload,
) => {
  const response = await api.put(`/api/v1/web/addresses/${uuid}/`, data);
  return response.data;
};

export const patchAddress = async (
  uuid: string,
  data: Partial<CreateAddressPayload>,
) => {
  const response = await api.patch(`/api/v1/web/addresses/${uuid}/`, data);
  return response.data;
};

export const deleteAddress = async (uuid: string) => {
  const response = await api.delete(`/api/v1/web/addresses/${uuid}/`);
  return response.data;
};

// ────────────── Locations ──────────────

export type Country = {
  id: number;
  name: string;
};

export type City = {
  id: number;
  name: string;
  country: number;
};

export type DistrictLocation = {
  id: number;
  name: string;
  city: number;
};

export const getCityDetail = async (id: number) => {
  const response = await api.get(`/api/v1/web/locations/cities/${id}/`);
  return response.data;
};

export const getDistrictDetail = async (id: number) => {
  const response = await api.get(`/api/v1/web/locations/districts/${id}/`);
  return response.data;
};

export const getCountries = async () => {
  const response = await api.get("/api/v1/web/locations/countries/");
  return response.data;
};

export const getCities = async (countryId: number) => {
  const response = await api.get(
    `/api/v1/web/locations/cities/?country=${countryId}`,
  );
  return response.data;
};

export const getDistricts = async (cityId: number) => {
  const response = await api.get(
    `/api/v1/web/locations/districts/?city=${cityId}`,
  );
  return response.data;
};

// ────────────── RFID Cards ──────────────

export type RfidCard = {
  id: number;
  uuid: string;
  card_id: string;
  type: string;
  type_display: string;
  is_active: boolean;
  created_at: string;
  registered_vehicle?: {
    id: number;
    uuid: string;
    plate_number: string;
    vehicle?: {
      name: string;
      model?: {
        name: string;
        brand?: {
          name: string;
        };
      };
    };
  };
  user?: any;
};

export type CreateRfidRequestPayload = {
  delivery_address: number;
  registered_vehicles: number[];
  user: number;
  quantity: number;
};

export const getRfidCards = async () => {
  const response = await api.get("/api/v1/web/rfid-cards/");
  return response.data;
};

export const createRfidRequest = async (data: CreateRfidRequestPayload) => {
  const response = await api.post("/api/v1/web/rfid-requests/", data);
  return response.data;
};

export const getRfidRequests = async () => {
  const response = await api.get("/api/v1/web/rfid-requests/");
  return response.data;
};

export const deleteRfidRequest = async (uuid: string) => {
  const response = await api.delete(`/api/v1/web/rfid-requests/${uuid}/`);
  return response.data;
};

export default api;
