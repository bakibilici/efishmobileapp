import AsyncStorage from "@react-native-async-storage/async-storage";
import { ActivityState } from "./ActivityStateMachine";
import {
  DriveSessionHistoryStorage,
  StoredDriveSessionRecord,
} from "./driveSessionHistory";
import { decodePolyline } from "./GoogleMapsService";
import { LocalUserStorage } from "./localUserStorage";
import { isCoordinatePair, type RouteDestinationDisplay } from "./placeTitle";
import { withoutProviderNamesInPlan } from "./providerNames";
import { withoutPhotosInPlan } from "./routePlanGateway";

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

const DEFAULT_ROUTE_START_BATTERY = 75;
const DEFAULT_ROUTE_ARRIVAL_BATTERY = 10;

/** Location entry from the Electrip backend route plan. */
export interface RoutePlanLocation {
  type: "origin" | "station" | "destination";
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
  interest_highlight?: RoutePlanInterestHighlight;
}

export interface RoutePlanInterestHighlight {
  id: string;
  interestKey: string;
  interestLabel: string;
  icon: string;
  shortLabel: string;
  title: string;
  message: string;
  stationName: string;
  /** Server gateway (snake_case mapped): nearby POI label */
  poiName?: string;
  poiCategory?: string;
  distanceM?: number;
  stationIndex?: number;
  /** 'places' when poiName is a real Google Places result, 'none' when only the generic suggestion applies. */
  poiSource?: "places" | "none";
  /**
   * Gateway path ('/api/place-photo?…') for the chosen place's photo, resolved
   * against the gateway's own origin when it is rendered (placePhotoUri in
   * components/route-sheet/breakDetail). Absent whenever the place has no
   * photo worth showing, and then the category tile stands in for it.
   */
  photoUrl?: string;
  /** Google's attribution for that photo, plain text. Shown wherever the photo is shown. */
  photoAttribution?: string;
  /** Next-best places of other kinds at the same stop (ranker path only). */
  alternatives?: RoutePlanHighlightAlternative[];
}

export interface RoutePlanHighlightAlternative {
  name: string;
  title?: string;
  category?: string;
  distanceM?: number;
  reason?: string;
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
  interest_highlights?: RoutePlanInterestHighlight[];
  route_optimization_summary?: string;
  /**
   * The agent's short name for the destination (planEvRoute tool_end), e.g.
   * "Metrogarden AVM" where the location only carries the full address.
   * Read through destinationTitle() in services/placeTitle.
   */
  destination_display?: RouteDestinationDisplay;
  /**
   * The destination's own photograph, when Google has one: a path on the route
   * gateway's own origin ("/api/place-photo?…"), signed there and short-lived.
   * Absent for a place with no photo, for a destination that came from the
   * geocoding fallback, for a gateway with its photos switched off, and from
   * every stored plan — the signature expires within a day or two, so the
   * agent strips photos from the session context it saves (withoutPhotos) and
   * this store strips them from the drive history it writes and from anything
   * it reads back (withoutPhotosInPlan). Read through destinationPhotoUri() in
   * components/route-sheet/placePhoto, as a break photo's photoUrl is.
   */
  destination_photo_url?: string;
  /** That photo's credit as plain text ("Ayşe K."); Google requires it beside the photo. */
  destination_photo_attribution?: string;
}

export interface DriveSessionContext {
  sessionId: string;
  startTime: number;
  history: any[]; // Placeholder for AI conversation history
  isPreviewMode?: boolean;
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

const BATTERY_PREFS_KEY = "akba.battery_prefs";

class DriveSessionStoreImpl {
  private currentState: DriveSessionState = DriveSessionState.IDLE;
  private context: DriveSessionContext | null = null;
  /**
   * Where the route sheet sits, as a level that means the same with every
   * snap-point set: -1 closed, 0 the low peek (previews only), 1 the middle,
   * 2 and up higher. Reported by RoutePlanSheet.
   */
  private routePlanSheetIndex = -1;
  /**
   * The driver put the route sheet away (the back button or a swipe down). It
   * stays away, with the reopen capsule on screen, until they open it again
   * or a new route arrives.
   */
  private routeSheetDismissed = false;
  /**
   * The route the driver took off this drive ("Rotayı kaldır"), kept only so
   * the drive's history record still has one: without it the record could no
   * longer be written, and "Sürüşü Bitir" would leave it without an endedAt.
   */
  private removedRoute: {
    sessionId: string;
    route: DriveSessionContext["route"];
    routePlanData: RoutePlanData | undefined;
  } | null = null;
  /**
   * The driver started this drive themselves ("Sürüş Modu", "Sürüşe Geç", the
   * prompt, a resumed record). Such a drive outlives the voice session, so
   * closing the conversation before the first route keeps the drive on
   * screen, as the confirmation promises. A session AKBA opened by itself to
   * hold a route plan is not one.
   */
  private driverStarted = false;
  /** Survives endSession(null context); kept in sync with AsyncStorage + context */
  private persistedBatteryPrefs: { start: number; arrival: number } | null =
    null;
  /** When the driver last set the start level; null until they ever have. */
  private batteryUpdatedAt: number | null = null;
  private listeners: Set<(state: DriveSessionState) => void> = new Set();
  private batteryListeners: Set<() => void> = new Set();
  private routeClearedListeners: Set<() => void> = new Set();
  /** Keeps route ids unique even for two routes set within one millisecond. */
  private routeSeq = 0;
  private pendingVoiceReconnect = false;
  /**
   * True while a stored drive is only being looked at ("Rotayı Aç"). Such a
   * preview must leave the stored record as it was — no endedAt reset, no new
   * updatedAt — until it turns into a real drive or gets a new route.
   */
  private previewIsReadOnly = false;

  // Timer for end-drive confirmation
  private endDriveTimer: ReturnType<typeof setTimeout> | null = null;
  // A red light or a queue easily lasts 40 s; asking "Sürüş bitti mi?" that
  // early reads as a false detection. Two minutes covers ordinary traffic.
  private readonly END_DRIVE_THRESHOLD_MS = 120000;

  constructor() {
    this.context = {
      sessionId: "initial",
      startTime: Date.now(),
      history: [],
      userStartBattery: DEFAULT_ROUTE_START_BATTERY,
      userArrivalBattery: DEFAULT_ROUTE_ARRIVAL_BATTERY,
    };
    this.initBatteryPreferences();
  }

  private async initBatteryPreferences() {
    this.persistedBatteryPrefs = {
      start: DEFAULT_ROUTE_START_BATTERY,
      arrival: DEFAULT_ROUTE_ARRIVAL_BATTERY,
    };
    try {
      const raw = await AsyncStorage.getItem(BATTERY_PREFS_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && Number.isFinite(saved.start) && Number.isFinite(saved.arrival)) {
        this.persistedBatteryPrefs = { start: saved.start, arrival: saved.arrival };
        this.batteryUpdatedAt = Number.isFinite(saved.updatedAt) ? saved.updatedAt : null;
        if (this.context) {
          this.context = {
            ...this.context,
            userStartBattery: saved.start,
            userArrivalBattery: saved.arrival,
          };
        }
      }
    } catch (error) {
      console.error("[DriveSessionStore] battery prefs load failed:", error);
    }
    this.notifyListeners();
    this.batteryListeners.forEach((listener) => listener());
  }

  public getState(): DriveSessionState {
    return this.currentState;
  }

  public getContext(): DriveSessionContext | null {
    return this.context;
  }

  public getRoutePlanSheetIndex(): number {
    return this.routePlanSheetIndex;
  }

  public setRoutePlanSheetIndex(index: number) {
    if (this.routePlanSheetIndex === index) return;
    this.routePlanSheetIndex = index;
    this.notifyListeners();
  }

  public isRouteSheetDismissed(): boolean {
    return this.routeSheetDismissed;
  }

  /** The driver closed the route sheet; the car-mode view offers it back. */
  public dismissRouteSheet() {
    if (this.routeSheetDismissed || !this.context?.routePlanData) return;
    this.routeSheetDismissed = true;
    this.notifyListeners();
  }

  /** Brings a closed route sheet back (the capsule, the header's trip). */
  public openRouteSheet() {
    if (!this.routeSheetDismissed) return;
    this.routeSheetDismissed = false;
    this.notifyListeners();
  }

  public onStateChange(
    listener: (state: DriveSessionState) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public startPrompt() {
    // If we're already driving or ending, don't re-prompt
    if (
      this.currentState === DriveSessionState.CAR_SESSION_ACTIVE ||
      this.currentState === DriveSessionState.CAR_SESSION_COLLAPSED
    ) {
      return;
    }

    // Auto-transition to ACTIVE if prompt was called — user preferences are now handled in settings
    this.startSession();
  }

  /**
   * `startedByDriver` is false only for the session AKBA opens by itself to
   * hold a route plan; every other start is the driver's own doing.
   */
  public startSession(
    route?: DriveSessionContext["route"],
    options: { startedByDriver?: boolean } = {},
  ) {
    this.context = {
      sessionId: Math.random().toString(36).substring(7),
      startTime: Date.now(),
      history: [],
      isPreviewMode: false,
      route,
      userStartBattery:
        this.context?.userStartBattery ??
        this.persistedBatteryPrefs?.start ??
        DEFAULT_ROUTE_START_BATTERY,
      userArrivalBattery:
        this.context?.userArrivalBattery ??
        this.persistedBatteryPrefs?.arrival ??
        DEFAULT_ROUTE_ARRIVAL_BATTERY,
    };
    this.pendingVoiceReconnect = false;
    this.previewIsReadOnly = false;
    this.routeSheetDismissed = false;
    this.removedRoute = null;
    this.driverStarted = options.startedByDriver !== false;
    this.setState(DriveSessionState.CAR_SESSION_ACTIVE);
    this.clearEndDriveTimer();
    this.persistCurrentSession();
  }

  /**
   * `confirmed`: the driver typed or picked this level just now. Without it the
   * timestamp only moves when the level actually changes, so starting a drive
   * with an untouched slider does not pass an old value off as current.
   */
  public async setBatteryPreferences(start: number, arrival: number, confirmed = false) {
    if (confirmed || start !== this.getBatteryPreferences().start) {
      this.batteryUpdatedAt = Date.now();
    }
    // With no drive in progress only the stored level changes; creating a
    // context here made the next route skip startSession().
    if (this.context) {
      this.context = {
        ...this.context,
        userStartBattery: start,
        userArrivalBattery: arrival,
      };
    }
    this.persistedBatteryPrefs = { start, arrival };
    this.persistCurrentSession();
    this.notifyListeners();
    this.batteryListeners.forEach((listener) => listener());
    AsyncStorage.setItem(
      BATTERY_PREFS_KEY,
      JSON.stringify({ start, arrival, updatedAt: this.batteryUpdatedAt }),
    ).catch((error) => console.error("[DriveSessionStore] battery prefs save failed:", error));
  }

  public onBatteryPreferencesChange(listener: () => void): () => void {
    this.batteryListeners.add(listener);
    return () => this.batteryListeners.delete(listener);
  }

  public getBatteryPreferences() {
    return {
      updatedAt: this.batteryUpdatedAt,
      start:
        this.context?.userStartBattery ??
        this.persistedBatteryPrefs?.start ??
        DEFAULT_ROUTE_START_BATTERY,
      arrival:
        this.context?.userArrivalBattery ??
        this.persistedBatteryPrefs?.arrival ??
        DEFAULT_ROUTE_ARRIVAL_BATTERY,
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
      const decodedPolyline =
        typeof data.polyline === "string"
          ? decodePolyline(data.polyline)
          : data.polyline;

      this.context = {
        ...this.context,
        route: {
          ...this.context.route,
          routeId: data.routeId,
          polyline: decodedPolyline,
          summary: data.summary,
        } as any,
      };
      this.previewIsReadOnly = false;
      // A new route opens the sheet again.
      this.routeSheetDismissed = false;
      this.persistCurrentSession();
      this.notifyListeners();
    }
  }

  /** Sets a new route and returns its id (null without a drive). */
  public setRouteFromFrontend(data: {
    origin: { latitude: number; longitude: number };
    destination: { latitude: number; longitude: number };
    stops: { latitude: number; longitude: number }[];
    polyline: { latitude: number; longitude: number }[];
    summary: { duration: number; distance: number };
  }): string | null {
    if (!this.context) return null;
    this.routeSeq += 1;
    const routeId = `frontend-${Date.now()}-${this.routeSeq}`;
    this.context = {
      ...this.context,
      route: {
        routeId,
        origin: data.origin,
        destination: data.destination,
        stops: data.stops,
        polyline: data.polyline,
        summary: data.summary,
      },
    };
    this.previewIsReadOnly = false;
    // A new route opens the sheet again.
    this.routeSheetDismissed = false;
    this.persistCurrentSession();
    this.notifyListeners();
    return routeId;
  }

  /**
   * The road shape (Google Directions) for a route already on screen. It
   * lands only on the route it was fetched for: a newer route, or none
   * ("Rotayı kaldır"), leaves it unused. Neither the route's id nor a sheet
   * the driver put away changes, so the sheet stays where the driver left it.
   */
  public updateRouteGeometry(
    routeId: string | null | undefined,
    polyline: { latitude: number; longitude: number }[],
    summary: { duration: number; distance: number },
  ): boolean {
    const context = this.context;
    const route = context?.route;
    if (!context || !route || !routeId || route.routeId !== routeId) return false;
    this.context = { ...context, route: { ...route, polyline, summary } };
    this.persistCurrentSession();
    this.notifyListeners();
    return true;
  }

  public setRoutePlanData(data: RoutePlanData) {
    if (this.context) {
      this.context = {
        ...this.context,
        routePlanData: data,
      };
      console.log("[DriveSessionStore] 📋 Route plan data set:", data.summary);
      this.previewIsReadOnly = false;
      this.persistCurrentSession();
      this.notifyListeners();
    }
  }

  public getRoutePlanData(): RoutePlanData | undefined {
    return this.context?.routePlanData;
  }

  /**
   * "Rotayı kaldır": takes the planned route off the drive (map line and
   * markers, the header's trip, the sheet and its capsule). The drive and the
   * voice session go on, and nothing is ended: no endedAt is written. A drive
   * that was only following the route (NAVIGATION_ONLY) becomes an ordinary
   * drive without one; the AI states are left to the voice session. A
   * preview only looks at a stored route and cannot remove it.
   */
  public clearRoute() {
    const context = this.context;
    if (!context || context.isPreviewMode) return;
    if (!context.route && !context.routePlanData) return;

    this.removedRoute = {
      sessionId: context.sessionId,
      route: context.route,
      routePlanData: context.routePlanData,
    };
    this.context = {
      ...context,
      route: undefined,
      routePlanData: undefined,
      isNavigationActive: false,
    };
    this.routePlanSheetIndex = -1;
    this.routeSheetDismissed = false;
    if (this.currentState === DriveSessionState.NAVIGATION_ONLY) {
      this.currentState = DriveSessionState.CAR_SESSION_ACTIVE;
    }
    this.persistCurrentSession();
    this.notifyListeners();
    // The voice session tells AKBA (useDrivingAgent: route_cleared).
    this.routeClearedListeners.forEach((listener) => listener());
  }

  /** The driver removed this drive's route; the drive and AKBA go on. */
  public onRouteCleared(listener: () => void): () => void {
    this.routeClearedListeners.add(listener);
    return () => this.routeClearedListeners.delete(listener);
  }

  /**
   * This drive had a route and the driver removed it ("Rotayı kaldır"). Such
   * a drive stays on screen when AKBA goes quiet, like one with a route, so
   * it can still be ended ("Sürüşü Bitir") and recorded with its endedAt.
   */
  public hasRemovedRoute(): boolean {
    return (
      !!this.removedRoute &&
      !!this.context &&
      this.removedRoute.sessionId === this.context.sessionId
    );
  }

  /**
   * The driver started this drive themselves, so it is theirs to end: it
   * stays on screen when AKBA goes quiet, route or no route.
   */
  public isDriverStarted(): boolean {
    return this.driverStarted && !!this.context;
  }

  public startNavigation() {
    if (this.context) {
      this.context = {
        ...this.context,
        isNavigationActive: true,
      };
      this.persistCurrentSession();
      this.notifyListeners();
    }
  }

  public exitPreviewMode() {
    if (!this.context?.isPreviewMode) return;

    this.context = {
      ...this.context,
      isPreviewMode: false,
    };
    this.previewIsReadOnly = false;

    this.persistCurrentSession();
    this.notifyListeners();
  }

  /**
   * Leaves a session preview without driving it. A preview that was only
   * looked at writes nothing: the stored record keeps its endedAt, state and
   * updatedAt, so a drive the list shows as "Kaydedildi" still does after a
   * look at its route. A preview that already turned into a live drive
   * ("AKBA ile Bağlan", a new route) is closed like one, with its endedAt.
   */
  public closePreview() {
    if (!this.context?.isPreviewMode) return;

    if (!this.previewIsReadOnly) {
      this.persistCurrentSession({ endedAt: Date.now() });
    }
    this.currentState = DriveSessionState.IDLE;
    this.context = null;
    this.routePlanSheetIndex = -1;
    this.routeSheetDismissed = false;
    this.removedRoute = null;
    this.driverStarted = false;
    this.pendingVoiceReconnect = false;
    this.previewIsReadOnly = false;
    this.clearEndDriveTimer();
    this.notifyListeners();
  }

  public endSession() {
    this.persistCurrentSession({ endedAt: Date.now() });
    this.currentState = DriveSessionState.IDLE;
    this.context = null;
    this.routePlanSheetIndex = -1;
    this.routeSheetDismissed = false;
    this.removedRoute = null;
    this.driverStarted = false;
    this.pendingVoiceReconnect = false;
    this.previewIsReadOnly = false;
    this.clearEndDriveTimer();
    this.notifyListeners();
  }

  public restoreSession(
    record: StoredDriveSessionRecord,
    options: RestoreDriveSessionOptions = {},
  ) {
    const restoredContext = this.buildRestoredContext(record);
    this.context = restoredContext;
    this.routePlanSheetIndex = -1;
    this.routeSheetDismissed = false;
    this.removedRoute = null;
    // Resuming a stored drive is the driver's own doing, like starting one, so
    // it survives AKBA going quiet. Only opening its route to look at it is
    // not a drive the driver started, and must still fall back to IDLE.
    this.driverStarted = !!options.reconnectVoice;
    this.pendingVoiceReconnect = !!options.reconnectVoice;
    // Resuming with AKBA continues the drive; opening the route only looks at it.
    this.previewIsReadOnly = !options.reconnectVoice;
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
      this.setState(
        this.context?.isPreviewMode
          ? DriveSessionState.NAVIGATION_ONLY
          : DriveSessionState.CAR_SESSION_ACTIVE,
      );
    }
  }

  /**
   * Called when ActivityStateMachine detects a state change.
   * Logic for delayed end-drive confirmation.
   */
  public handleActivityChange(newState: ActivityState) {
    if (this.context?.isPreviewMode) {
      if (newState === ActivityState.CAR) {
        this.context = {
          ...this.context,
          isPreviewMode: false,
        };
        this.previewIsReadOnly = false;
        this.persistCurrentSession();
        this.notifyListeners();
      }
      return;
    }

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
      DriveSessionState.NAVIGATION_ONLY,
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
      isPreviewMode: true,
      route: restoredRoute,
      // A drive stored before stop names were cleaned shows them clean too,
      // and one stored before photos stopped being written (below) still opens
      // without them: a signed photo path outlives its signature by months in
      // this table, and drawing an expired one would shift the header's copy
      // and then collapse it again when the 403 came back.
      routePlanData: rawContext.routePlanData
        ? withoutPhotosInPlan(withoutProviderNamesInPlan(rawContext.routePlanData))
        : undefined,
      isNavigationActive:
        rawContext.isNavigationActive ??
        !!(rawContext.routePlanData || rawContext.route),
      // The level describes the car now, not the day this drive was recorded.
      userStartBattery: this.getBatteryPreferences().start,
      userArrivalBattery: this.getBatteryPreferences().arrival,
    };
  }

  private getSessionSnapshot(options: PersistSessionOptions = {}) {
    if (!this.context) return null;
    // A drive whose route was removed is still recorded with that route.
    const removed =
      this.removedRoute?.sessionId === this.context.sessionId ? this.removedRoute : null;
    const context: DriveSessionContext =
      !this.context.route && !this.context.routePlanData && removed
        ? { ...this.context, route: removed.route, routePlanData: removed.routePlanData }
        : this.context;
    if (!context.route && !context.routePlanData) {
      return null;
    }

    const locations = context.routePlanData?.locations ?? [];
    // A dropped pin's waypoint is "lat,lng": never a name to store or show.
    const named = (text?: string | null) =>
      text?.trim() && !isCoordinatePair(text) ? text.trim() : null;
    const originName =
      named(locations.find((location) => location.type === "origin")?.name) ||
      named(context.routePlanData?.waypoints?.origin) ||
      "Başlangıç";
    const destinationName =
      named(locations.find((location) => location.type === "destination")?.name) ||
      named(context.routePlanData?.waypoints?.destination) ||
      "Hedef";
    const durationSeconds =
      context.route?.summary?.duration ??
      (context.routePlanData?.summary?.total_travel_duration != null
        ? context.routePlanData.summary.total_travel_duration * 60
        : null);
    // Google Directions reports metres; Electrip reports kilometres.
    const routeDistanceM = context.route?.summary?.distance;
    const distanceKm =
      routeDistanceM != null
        ? Math.round(routeDistanceM / 100) / 10
        : context.routePlanData?.summary?.total_travel_length ?? null;
    const stationCount =
      context.routePlanData?.summary?.total_station_count ??
      context.route?.stops?.length ??
      0;

    // What is written to the drive history, never what this drive is shown
    // from: the photographs are the live plan's and stay on it. Their paths
    // are signed for a day or two, so a stored one is a 403 waiting to happen
    // — the agent strips them from its own session context for the same
    // reason (withoutPhotos in apps/agent/src/tools/route-planner).
    const storedPlan = context.routePlanData
      ? withoutPhotosInPlan(context.routePlanData)
      : undefined;
    const storedContext: DriveSessionContext =
      storedPlan === context.routePlanData
        ? context
        : { ...context, routePlanData: storedPlan };

    return {
      sessionId: context.sessionId,
      title:
        originName && destinationName
          ? `${originName} → ${destinationName}`
          : destinationName,
      originName,
      destinationName,
      state: options.stateOverride ?? this.currentState,
      startedAt: context.startTime,
      updatedAt: Date.now(),
      endedAt: options.endedAt ?? null,
      durationSeconds,
      distanceKm,
      stationCount,
      routeContext: storedContext,
    };
  }

  private persistCurrentSession(options: PersistSessionOptions = {}) {
    if (this.previewIsReadOnly && this.context?.isPreviewMode) return;
    const snapshot = this.getSessionSnapshot(options);
    if (!snapshot) return;
    void (async () => {
      const userId = await LocalUserStorage.getCurrentUserId();
      if (!userId) return;

      await DriveSessionHistoryStorage.upsertSession({
        ...snapshot,
        userId,
      });
    })();
  }

  private notifyListeners() {
    this.listeners.forEach((l) => l(this.currentState));
  }

  private clearEndDriveTimer() {
    if (this.endDriveTimer) {
      clearTimeout(this.endDriveTimer);
      this.endDriveTimer = null;
    }
  }
}

export const DriveSessionStore = new DriveSessionStoreImpl();
