
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
        console.log(`[API REQUEST] ${config.method?.toUpperCase()} ${config.url}`, authToken ? `Token: ${authToken.substring(0, 10)}...` : "NO TOKEN");

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
    }
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
                    const response = await axios.post(`${BASE_URL}/api/v1/web/auth/refresh/`, payload, {
                        headers
                    });

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
                        if (CLIENT_SECRET) originalRequest.headers["Client-Secret"] = CLIENT_SECRET;

                        return api(originalRequest);
                    }
                }
            } catch (refreshError: any) {
                console.log("Token refresh failed", refreshError.response?.status, refreshError.response?.data);
                await clearTokens();
                setAuthToken(null);
            }
        }
        return Promise.reject(error);
    }
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
    // Add other profile fields if needed
};

export const getProfile = async () => {
    const response = await api.get("/api/v1/web/users/me/");
    console.log("getProfile response:", JSON.stringify(response.data, null, 2));

    // Handle different response structures
    if (response.data?.data) {
        return response.data.data;
    }
    return response.data;
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
        distanceKm: 0 // calculated on UI
    }));
};


export const getStationDetails = async (id: string) => {
    // Ensure trailing slash for Django-like backends
    const response = await api.get(`/api/v1/web/stations/charge-areas/${id}/`);
    console.log(`Station Details (${id}):`, JSON.stringify(response.data, null, 2));
    return response.data.data ? response.data.data : response.data;
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

export const addRegisteredVehicle = async (data: { vehicle: string; plate_number: string; vehicle_type: string }) => {
    const response = await api.post("/api/v1/web/registered-vehicles/", data);
    return response.data;
};

export const updateRegisteredVehicle = async (uuid: string, data: { plate_number?: string; vehicle?: string; vehicle_type?: string }) => {
    const response = await api.patch(`/api/v1/web/registered-vehicles/${uuid}/`, data);
    return response.data;
};

export const deleteRegisteredVehicle = async (uuid: string) => {
    const response = await api.delete(`/api/v1/web/registered-vehicles/${uuid}/`);
    return response.data;
};

export const startChargingSession = async (data: { vehicle_id: number; socket_uuid: string }) => {
    const response = await api.post("/api/v1/web/chargesessions/start/", data);
    return response.data;
};

export const stopChargingSession = async (data: { charge_session_uuid: string }) => {
    const response = await api.post("/api/v1/web/chargesessions/stop/", data);
    return response.data;
};

export default api;
