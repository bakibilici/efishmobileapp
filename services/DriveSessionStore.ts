import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityState } from "./ActivityStateMachine";
import {
  DriveSessionHistoryStorage,
  StoredDriveSessionRecord,
} from "./driveSessionHistory";
import { decodePolyline } from "./GoogleMapsService";

export enum DriveSessionState {
  IDLE = "IDLE",
  PROMPTING = "PROMPTING",
  CAR_SESSION_ACTIVE = "CAR_SESSION_ACTIVE",
  CAR_SESSION_COLLAPSED = "CAR_SESSION_COLLAPSED",
  AI_CONNECTING = "AI_CONNECTING",
  AI_LISTENING = "AI_LISTENING",
  AI_SPEAKING = "AI_SPEAKING",
  AI_ERROR = "AI_ERROR",
  PLANNING_ROUTE = "PLANNING_ROUTE",
  ENDING_DRIVE_CONFIRMATION = "ENDING_DRIVE_CONFIRMATION",
  NAVIGATION_ONLY = "NAVIGATION_ONLY", // Passive navigation state (UI only, voice off)
}

/** Location entry from the Electrip backend route plan. */
export interface RoutePlanLocation {
  type: 'origin' | 'station' | 'destination';
  name: string;
  coordinates: { lat: string; lon: string };
  travel_duration: number;
  travel_length: number;
  battery_status: { from: number; to: number };
  weather?: { icon: string; temp: number; text: string };
  // Station-specific fields
  id?: number;
  brand?: string;
  address?: string;
  cp_type?: string;
  ac_count?: number;
  dc_count?: number;
  hpc_count?: number;
  max_power?: number;
  charge_duration?: number;
}

/** Full Electrip backend route plan data (cleaned, no polyline/spans). */
export interface RoutePlanData {
  routes: any[];
  locations: RoutePlanLocation[];
  summary: {
    total_charge_duration: number;
    total_station_count: number;
    total_travel_duration: number;
    total_travel_length: number;
    travel_start_time: string;
    travel_finish_time: string;
  };
  waypoints: {
    origin: string;
    destination: string;
    stops: string[];
  };
}

export interface DriveSessionContext {
  sessionId: string;
  startTime: number;
  history: any[]; // Placeholder for AI conversation history
  route?: {
    routeId?: string;
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    stops: { latitude: number; longitude: number }[];
    polyline?: string | { latitude: number; longitude: number }[]; // Encoded string or decoded points
    summary?: {
      duration: number;
      distance: number;
    };
  };
  routePlanData?: RoutePlanData;
  isNavigationActive?: boolean;
  // User Preferences for Battery
  userStartBattery?: number;
  userArrivalBattery?: number;
}

interface PersistSessionOptions {
  endedAt?: number | null;
  stateOverride?: string;
}

interface RestoreDriveSessionOptions {
  reconnectVoice?: boolean;
}

const STORAGE_KEY_BATTERY_PREFS = 'drive_session_battery_prefs';

class DriveSessionStoreImpl {
  private currentState: DriveSessionState = DriveSessionState.IDLE;
  private context: DriveSessionContext | null = null;
  private listeners: Set<(state: DriveSessionState) => void> = new Set();
  private pendingVoiceReconnect = false;
  
  // Timer for end-drive confirmation
  private endDriveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly END_DRIVE_THRESHOLD_MS = 30000; // 30 seconds of inactivity before prompting

  constructor() {
    this.context = {
      sessionId: "initial",
      startTime: Date.now(),
      history: [],
      userStartBattery: 100,
      userArrivalBattery: 80,
    };
    this.initBatteryPreferences();
  }

  private async initBatteryPreferences() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY_BATTERY_PREFS);
      if (saved) {
        const { start, arrival } = JSON.parse(saved);
        if (this.context) {
          this.context = {
            ...this.context,
            userStartBattery: start,
            userArrivalBattery: arrival,
          };
        }
      }
    } catch (e) {
      console.warn('Failed to load battery preferences', e);
    }
    this.notifyListeners();
  }

  public getState(): DriveSessionState {
    return this.currentState;
  }

  public getContext(): DriveSessionContext | null {
    return this.context;
  }

  public onStateChange(listener: (state: DriveSessionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public startPrompt() {
    // If we're already driving or ending, don't re-prompt
    if (this.currentState === DriveSessionState.CAR_SESSION_ACTIVE ||
        this.currentState === DriveSessionState.CAR_SESSION_COLLAPSED) {
      return;
    }
    
    // Auto-transition to ACTIVE if prompt was called — user preferences are now handled in settings
    this.startSession();
  }

  public startSession(route?: DriveSessionContext["route"]) {
    this.context = {
      sessionId: Math.random().toString(36).substring(7),
      startTime: Date.now(),
      history: [],
      route,
      userStartBattery: this.context?.userStartBattery || 100,
      userArrivalBattery: this.context?.userArrivalBattery || 80,
    };
    this.pendingVoiceReconnect = false;
    this.setState(DriveSessionState.CAR_SESSION_ACTIVE);
    this.clearEndDriveTimer();
    this.persistCurrentSession();
  }

  public async setBatteryPreferences(start: number, arrival: number) {
    if (!this.context) {
      this.context = {
        sessionId: "pending",
        startTime: Date.now(),
        history: [],
        userStartBattery: start,
        userArrivalBattery: arrival,
      };
    } else {
      this.context = {
        ...this.context,
        userStartBattery: start,
        userArrivalBattery: arrival,
      };
    }
    
    try {
      await AsyncStorage.setItem(STORAGE_KEY_BATTERY_PREFS, JSON.stringify({ start, arrival }));
    } catch (e) {
      console.warn('Failed to save battery preferences', e);
    }
    
    this.persistCurrentSession();
    this.notifyListeners();
  }

  public getBatteryPreferences() {
    return {
      start: this.context?.userStartBattery ?? 100,
      arrival: this.context?.userArrivalBattery ?? 80,
    };
  }

  public collapse() {
    if (this.currentState === DriveSessionState.CAR_SESSION_ACTIVE) {
      this.setState(DriveSessionState.CAR_SESSION_COLLAPSED);
    }
  }

  public expand() {
    if (this.currentState === DriveSessionState.CAR_SESSION_COLLAPSED) {
      this.setState(DriveSessionState.CAR_SESSION_ACTIVE);
    }
  }

  public setAiState(state: DriveSessionState) {
    this.setState(state);
  }

  public updateRouteFromSocket(data: { 
    routeId: string; 
    polyline: string | { latitude: number; longitude: number }[]; 
    summary: { duration: number; distance: number };
    steps: any[];
  }) {
    if (this.context) {
      // If polyline comes as a string (encoded), decode it immediately for consistent storage
      const decodedPolyline = typeof data.polyline === 'string' 
        ? decodePolyline(data.polyline) 
        : data.polyline;

      this.context = {
        ...this.context,
        route: {
          ...this.context.route,
          routeId: data.routeId,
          polyline: decodedPolyline,
          summary: data.summary,
        } as any
      };
      this.persistCurrentSession();
      this.notifyListeners();
    }
  }

  public setRouteFromFrontend(data: {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    stops: { latitude: number; longitude: number }[];
    polyline: { latitude: number; longitude: number }[];
    summary: { duration: number; distance: number };
  }) {
    if (this.context) {
      this.context = {
        ...this.context,
        route: {
          routeId: `frontend-${Date.now()}`,
          origin: data.origin,
          destination: data.destination,
          stops: data.stops,
          polyline: data.polyline,
          summary: data.summary,
        }
      };
      this.persistCurrentSession();
      this.notifyListeners();
    }
  }

  public setRoutePlanData(data: RoutePlanData) {
    if (this.context) {
      this.context = {
        ...this.context,
        routePlanData: data
      };
      console.log("[DriveSessionStore] 📋 Route plan data set:", data.summary);
      this.persistCurrentSession();
      this.notifyListeners();
    }
  }

  public getRoutePlanData(): RoutePlanData | undefined {
    return this.context?.routePlanData;
  }

  public startNavigation() {
    if (this.context) {
      this.context = {
        ...this.context,
        isNavigationActive: true
      };
      this.persistCurrentSession();
      this.notifyListeners();
    }
  }

  public endSession() {
    this.persistCurrentSession({ endedAt: Date.now() });
    this.currentState = DriveSessionState.IDLE;
    this.context = null;
    this.pendingVoiceReconnect = false;
    this.clearEndDriveTimer();
    this.notifyListeners();
  }

  public restoreSession(
    record: StoredDriveSessionRecord,
    options: RestoreDriveSessionOptions = {},
  ) {
    const restoredContext = this.buildRestoredContext(record);
    this.context = restoredContext;
    this.pendingVoiceReconnect = !!options.reconnectVoice;
    this.clearEndDriveTimer();
    this.setState(
      options.reconnectVoice
        ? DriveSessionState.AI_CONNECTING
        : DriveSessionState.NAVIGATION_ONLY,
    );
    this.persistCurrentSession();
    this.notifyListeners();
  }

  public consumePendingVoiceReconnect(): boolean {
    const pending = this.pendingVoiceReconnect;
    this.pendingVoiceReconnect = false;
    return pending;
  }

  public hasPendingVoiceReconnect(): boolean {
    return this.pendingVoiceReconnect;
  }

  public clearPendingVoiceReconnect() {
    this.pendingVoiceReconnect = false;
  }

  public requestEndConfirmation() {
    this.setState(DriveSessionState.ENDING_DRIVE_CONFIRMATION);
  }

  public cancelEndConfirmation() {
    if (this.currentState === DriveSessionState.ENDING_DRIVE_CONFIRMATION) {
      this.setState(DriveSessionState.CAR_SESSION_ACTIVE);
    }
  }

  /**
   * Called when ActivityStateMachine detects a state change.
   * Logic for delayed end-drive confirmation.
   */
  public handleActivityChange(newState: ActivityState) {
    if (newState !== ActivityState.CAR && this.isSessionActive()) {
      // Start timer to confirm if drive ended
      if (!this.endDriveTimer) {
        this.endDriveTimer = setTimeout(() => {
          this.requestEndConfirmation();
        }, this.END_DRIVE_THRESHOLD_MS);
      }
    } else if (newState === ActivityState.CAR) {
      this.clearEndDriveTimer();
      if (this.currentState === DriveSessionState.ENDING_DRIVE_CONFIRMATION) {
        this.setState(DriveSessionState.CAR_SESSION_ACTIVE);
      }
    }
  }

  private isSessionActive(): boolean {
    return [
      DriveSessionState.CAR_SESSION_ACTIVE,
      DriveSessionState.CAR_SESSION_COLLAPSED,
      DriveSessionState.AI_CONNECTING,
      DriveSessionState.AI_LISTENING,
      DriveSessionState.AI_SPEAKING,
      DriveSessionState.AI_ERROR,
      DriveSessionState.PLANNING_ROUTE,
      DriveSessionState.ENDING_DRIVE_CONFIRMATION,
      DriveSessionState.NAVIGATION_ONLY
    ].includes(this.currentState);
  }

  private setState(newState: DriveSessionState) {
    if (this.currentState !== newState) {
      this.currentState = newState;
      this.notifyListeners();
    }
  }

  private buildRestoredContext(
    record: StoredDriveSessionRecord,
  ): DriveSessionContext {
    const rawContext = record.routeContext || {};
    const restoredRoute = rawContext.route
      ? {
          ...rawContext.route,
          routeId: `restored-${rawContext.route.routeId || record.sessionId}-${Date.now()}`,
        }
      : undefined;

    return {
      sessionId: record.sessionId,
      startTime: rawContext.startTime || record.startedAt || Date.now(),
      history: Array.isArray(rawContext.history) ? rawContext.history : [],
      route: restoredRoute,
      routePlanData: rawContext.routePlanData,
      isNavigationActive:
        rawContext.isNavigationActive ??
        !!(rawContext.routePlanData || rawContext.route),
      userStartBattery:
        rawContext.userStartBattery ?? this.context?.userStartBattery ?? 100,
      userArrivalBattery:
        rawContext.userArrivalBattery ?? this.context?.userArrivalBattery ?? 80,
    };
  }

  private getSessionSnapshot(
    options: PersistSessionOptions = {},
  ) {
    if (
      !this.context ||
      (!this.context.route && !this.context.routePlanData)
    ) {
      return null;
    }

    const locations = this.context.routePlanData?.locations ?? [];
    const originName =
      locations.find((location) => location.type === "origin")?.name ||
      this.context.routePlanData?.waypoints.origin ||
      "Başlangıç";
    const destinationName =
      locations.find((location) => location.type === "destination")?.name ||
      this.context.routePlanData?.waypoints.destination ||
      "Hedef";
    const durationSeconds =
      this.context.route?.summary?.duration ??
      (this.context.routePlanData?.summary?.total_travel_duration != null
        ? this.context.routePlanData.summary.total_travel_duration * 60
        : null);
    const distanceKm =
      this.context.route?.summary?.distance ??
      this.context.routePlanData?.summary?.total_travel_length ??
      null;
    const stationCount =
      this.context.routePlanData?.summary?.total_station_count ??
      this.context.route?.stops?.length ??
      0;

    return {
      sessionId: this.context.sessionId,
      title:
        originName && destinationName
          ? `${originName} → ${destinationName}`
          : destinationName,
      originName,
      destinationName,
      state: options.stateOverride ?? this.currentState,
      startedAt: this.context.startTime,
      updatedAt: Date.now(),
      endedAt: options.endedAt ?? null,
      durationSeconds,
      distanceKm,
      stationCount,
      routeContext: this.context,
    };
  }

  private persistCurrentSession(options: PersistSessionOptions = {}) {
    const snapshot = this.getSessionSnapshot(options);
    if (!snapshot) return;
    void DriveSessionHistoryStorage.upsertSession(snapshot);
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this.currentState));
  }

  private clearEndDriveTimer() {
    if (this.endDriveTimer) {
      clearTimeout(this.endDriveTimer);
      this.endDriveTimer = null;
    }
  }
}

export const DriveSessionStore = new DriveSessionStoreImpl();
