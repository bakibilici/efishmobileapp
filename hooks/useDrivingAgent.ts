import { AudioSession } from "@livekit/react-native";
import * as Sentry from "@sentry/react-native";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import type { RemoteAudioTrack, RemoteParticipant } from "livekit-client";
import { ConnectionState, Room, RoomEvent, Track } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, PermissionsAndroid, Platform } from "react-native";
import { PREDEFINED_USER_INTERESTS } from "../constants/userInterests";
import { useUser } from "../context/UserContext";
import { LocalUserStorage } from "../services/localUserStorage";
import { ActivityState } from "../services/ActivityStateMachine";
import { AtlasTokenError, fetchAtlasToken } from "../services/AtlasTokenService";
import { VoiceLevelBus } from "../services/VoiceLevelBus";
import {
  BreakExclusions,
  excludedBreaksPrefKey,
  LEGACY_EXCLUDED_BREAKS_PREF,
  parseStoredBreakKinds,
} from "../services/breakExclusions";
import type { RoutePlanData } from "../services/DriveSessionStore";
import {
  DriveSessionState,
  DriveSessionStore,
} from "../services/DriveSessionStore";
import { fetchDirections } from "../services/GoogleMapsService";
import {
  normalizeBreakKinds,
  personalizeRoutePlan,
  updateInterestChips,
  type BreakKind,
} from "../services/routePersonalization";
import { normalizeRoutePlanFromGateway } from "../services/routePlanGateway";
import { SpeedStore } from "../services/sensors/SpeedStore";
import { applyAkbaAudioMode } from "../services/voice/audioMode";
import {
  playListenEnd,
  playListenStart,
  preloadEarcons,
} from "../services/voice/Earcons";
import {
  requestWakeWordPermissionIfNeverAsked,
  WakeWordListener,
  type WakeWordStatus,
} from "../services/voice/WakeWordListener";
import { useActivityState } from "./useActivityState";
import { useChargingSimulation } from "./useChargingSimulation";

const GOOGLE_MAPS_API_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY
    : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;

const ROUTE_PLANNING_HOLD_SOUND = require("../assets/audio/lantern-light-bistro.mp3");

/** LiveKit data-channel topics shared with the Atlas agent (atlas repo). */
const CLIENT_TOPIC = "atlas.client";
const TOOL_TOPIC = "atlas.tool";

/** How long to wait for a GPS fix before connecting without one. */
const GPS_FIX_TIMEOUT_MS = 3000;

/**
 * Local preference keys (LocalUserStorage.getPreference / setPreference);
 * Profile writes both. The break exclusions live under excludedBreaksPrefKey.
 */
const SHARE_LOCATION_PREF = "share_location";
/** "off" switches the wake word off; anything else (or nothing) leaves it on. */
const WAKE_WORD_PREF = "wake_word";

/** Thrown inside startAgentSession when a stop arrived while it was still starting. */
class StartCancelledError extends Error {
  constructor() {
    super("Voice session start cancelled");
    this.name = "StartCancelledError";
  }
}

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry: unknown): entry is string => typeof entry === "string")
    : [];

/**
 * The wake word only listens while a drive is on screen and AKBA is not
 * talking: the drive's passive states. Previews of old drives do not count.
 */
const WAKE_WORD_DRIVE_STATES = new Set<DriveSessionState>([
  DriveSessionState.CAR_SESSION_ACTIVE,
  DriveSessionState.CAR_SESSION_COLLAPSED,
  DriveSessionState.NAVIGATION_ONLY,
]);
/** Lets the end cue finish and a flapping state settle before the mic opens again. */
const WAKE_WORD_ARM_DELAY_MS = 700;

/**
 * The gateway only ever surfaces two suggestions and consumes the interest
 * list in order, so the practical needs are sent ahead of the nice-to-haves.
 */
const PRIORITY_INTERESTS = [
  "İhtiyaç molası",
  "İbadet alanı",
  "Tuvalet molası", // pre-rename profiles
];

/** The `interests` participant attribute: priority chips first, at most 8, comma-joined. */
function buildInterestsAttribute(interests: readonly string[]): string {
  return [...interests]
    .sort(
      (a, b) =>
        Number(PRIORITY_INTERESTS.includes(b)) -
        Number(PRIORITY_INTERESTS.includes(a)),
    )
    .slice(0, 8)
    .join(",");
}

/** Atlas tool names → the tool keys CarModeView's TOOL_STATUS_COPY expects. */
const ATLAS_TOOL_NAME_MAP: Record<string, string> = {
  planEvRoute: "create_route_plan",
  getCurrentLocation: "get_user_location",
  endConversation: "end_call",
};

type VoiceStatus = "disconnected" | "connecting" | "connected" | "error";

/** Represents a single tool call lifecycle (request → response). */
export interface AgentToolCall {
  toolName: string;
  toolCallId: string;
  toolType: string;
  status: "pending" | "success" | "error";
  requestedAt: number;
  respondedAt?: number;
  rawResponse?: Record<string, any>;
}

export function useDrivingAgent() {
  const activity = useActivityState();
  const activityRef = useRef(activity);
  activityRef.current = activity;
  const { user, setUser } = useUser();
  const userRef = useRef(user);
  userRef.current = user;
  const setUserRef = useRef(setUser);
  setUserRef.current = setUser;
  const charging = useChargingSimulation();
  const sessionStartedRef = useRef(false);
  const connectingRef = useRef(false);
  const manuallyEndedRef = useRef(false);
  /** When true, agent ended the voice session (e.g. farewell); do not auto-start or reconnect. */
  const blockAutoVoiceRestartRef = useRef(false);
  /** When true, the next session is started with new_session=true (fresh, no resume). */
  const forceFreshSessionRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Bumped by every stop (and by unmount). A start that finds it changed
   * after one of its awaits was overtaken by that stop and undoes itself.
   */
  const startGenerationRef = useRef(0);
  /** AudioSession.startAudioSession succeeded and has not been stopped since. */
  const audioSessionActiveRef = useRef(false);
  /** preference_update events are applied one at a time, in arrival order. */
  const preferenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const planningSoundRef = useRef<Audio.Sound | null>(null);
  const planningFeedbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const roomRef = useRef<Room | null>(null);
  const agentParticipantRef = useRef<RemoteParticipant | null>(null);
  /** The battery snapshot is re-sent once per connection, on the agent's first "listening". */
  const batteryResentRef = useRef(false);
  const gpsWatchRef = useRef<Location.LocationSubscription | null>(null);
  const planWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Failsafe: if planEvRoute never returns a tool_end, unstick the UI. */
  const PLAN_WATCHDOG_MS = 45000;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  // AKBA's audio track, for the orb's frame-accurate level meter.
  const [agentAudioTrack, setAgentAudioTrack] = useState<RemoteAudioTrack | null>(null);
  const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
  const [lastToolEvent, setLastToolEvent] = useState<AgentToolCall | null>(
    null,
  );
  const currentLocationRef = useRef("0,0");
  const userInterestsRef = useRef<string[]>([]);
  userInterestsRef.current = user?.interests ?? [];
  /** Break kinds the driver told AKBA never to suggest (preference_update). */
  const excludedBreakKindsRef = useRef<BreakKind[]>([]);
  const statusRef = useRef<VoiceStatus>(status);
  statusRef.current = status;

  // ── Listen cues ─────────────────────────────────────────────────────────
  /** The rising cue already played for the current voice session. */
  const startCuePlayedRef = useRef(false);
  /** A voice session finished starting and has not gone passive yet. */
  const voiceLiveRef = useRef(false);
  /** Set by the unmount cleanup: tearing the app down is not "AKBA stopped listening". */
  const unmountingRef = useRef(false);

  /**
   * The rising cue means "AKBA hears you now": only for a session that is
   * live (mic published), never for a connect that may still fail.
   */
  const playStartCueOnce = useCallback(() => {
    if (!voiceLiveRef.current || startCuePlayedRef.current) return;
    startCuePlayedRef.current = true;
    void playListenStart();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  /**
   * Every end of a voice session funnels through disconnectRoom, which calls
   * this after the audio session is released (releasing it later would cut
   * the cue off). The falling cue plays only for a session that was live: not
   * for a failed connect, not for a retry, not for app teardown.
   */
  const markVoicePassive = useCallback(() => {
    startCuePlayedRef.current = false;
    if (!voiceLiveRef.current) return;
    voiceLiveRef.current = false;
    if (unmountingRef.current) return;
    void playListenEnd();
  }, []);

  // ── Wake word ───────────────────────────────────────────────────────────
  /** null until the wake_word preference has been read: nothing arms before that. */
  const wakeWordEnabledRef = useRef<boolean | null>(null);
  const appStateRef = useRef(AppState.currentState);
  /** disconnectRoom calls in flight; the mic is not handed back until they finish. */
  const teardownCountRef = useRef(0);
  const wakeArmRequestedRef = useRef(false);
  const wakeArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleWakeRef = useRef<() => void>(() => {});
  const [wakeWordStatus, setWakeWordStatus] = useState<WakeWordStatus>(
    WakeWordListener.getStatus(),
  );
  useEffect(() => WakeWordListener.subscribe(setWakeWordStatus), []);

  const shouldArmWakeWord = useCallback(
    () =>
      wakeWordEnabledRef.current === true &&
      !!userRef.current &&
      !unmountingRef.current &&
      appStateRef.current === "active" &&
      !connectingRef.current &&
      !roomRef.current &&
      teardownCountRef.current === 0 &&
      statusRef.current !== "connected" &&
      statusRef.current !== "connecting" &&
      WAKE_WORD_DRIVE_STATES.has(DriveSessionStore.getState()) &&
      !DriveSessionStore.getContext()?.isPreviewMode,
    [],
  );

  /** Resolves once the recognizer has let go of the microphone. */
  const disarmWakeWord = useCallback(async () => {
    if (wakeArmTimerRef.current) {
      clearTimeout(wakeArmTimerRef.current);
      wakeArmTimerRef.current = null;
    }
    wakeArmRequestedRef.current = false;
    await WakeWordListener.disarm();
  }, []);

  /**
   * Edge-triggered: arms once when the conditions start to hold and disarms
   * when they stop. A listener that gave up stays off until the conditions
   * drop and return (the next arm), instead of retrying on every state tick.
   */
  const evaluateWakeWord = useCallback(() => {
    if (shouldArmWakeWord()) {
      if (wakeArmRequestedRef.current || wakeArmTimerRef.current) return;
      wakeArmTimerRef.current = setTimeout(() => {
        wakeArmTimerRef.current = null;
        if (wakeArmRequestedRef.current || !shouldArmWakeWord()) return;
        wakeArmRequestedRef.current = true;
        void WakeWordListener.arm(() => handleWakeRef.current());
      }, WAKE_WORD_ARM_DELAY_MS);
    } else if (wakeArmRequestedRef.current || wakeArmTimerRef.current) {
      void disarmWakeWord();
    }
  }, [disarmWakeWord, shouldArmWakeWord]);

  const setPassiveDriveState = useCallback(() => {
    const hasRoute = !!DriveSessionStore.getRoutePlanData();
    DriveSessionStore.setAiState(
      hasRoute ? DriveSessionState.NAVIGATION_ONLY : DriveSessionState.IDLE,
    );
  }, []);

  const clearPlanWatchdog = useCallback(() => {
    if (planWatchdogRef.current) {
      clearTimeout(planWatchdogRef.current);
      planWatchdogRef.current = null;
    }
  }, []);

  const stopPlanningHoldSound = useCallback(async () => {
    try {
      if (planningFeedbackTimerRef.current) {
        clearInterval(planningFeedbackTimerRef.current);
        planningFeedbackTimerRef.current = null;
      }
      const sound = planningSoundRef.current;
      planningSoundRef.current = null;
      if (!sound) return;
      await sound.stopAsync();
      await sound.unloadAsync();
    } catch (error) {
      console.error("[useDrivingAgent] Failed to stop planning hold sound:", error);
    }
  }, []);

  const startPlanningHoldSound = useCallback(async () => {
    try {
      await stopPlanningHoldSound();
      await Haptics.selectionAsync();
      planningFeedbackTimerRef.current = setInterval(() => {
        void Haptics.selectionAsync();
      }, 2600);
      await applyAkbaAudioMode();
      const { sound } = await Audio.Sound.createAsync(
        ROUTE_PLANNING_HOLD_SOUND,
        {
          shouldPlay: true,
          isLooping: true,
          volume: 0.52,
          progressUpdateIntervalMillis: 1000,
        },
      );
      planningSoundRef.current = sound;
    } catch (error) {
      console.error(
        "[useDrivingAgent] Failed to start planning hold sound:",
        error,
      );
    }
  }, [stopPlanningHoldSound]);

  const stopGpsWatch = useCallback(() => {
    gpsWatchRef.current?.remove();
    gpsWatchRef.current = null;
  }, []);

  const disconnectRoom = useCallback(async () => {
    teardownCountRef.current += 1;
    try {
      stopGpsWatch();
      clearPlanWatchdog();
      const room = roomRef.current;
      roomRef.current = null;
      agentParticipantRef.current = null;
      setAgentAudioTrack(null);
      VoiceLevelBus.reset();
      // LiveKit and the recognizer share one audio session: the wake word
      // must never be running across the stop below.
      await disarmWakeWord();
      if (room) {
        try {
          await room.disconnect();
        } catch (error) {
          console.error("[useDrivingAgent] Failed to disconnect room:", error);
        }
      }
      // Balanced with the start: stopping a session this hook never started
      // would deactivate audio something else still uses.
      if (audioSessionActiveRef.current) {
        audioSessionActiveRef.current = false;
        try {
          await AudioSession.stopAudioSession();
        } catch {
          // Audio session may already be stopped; ignore.
        }
      }
      markVoicePassive();
    } finally {
      teardownCountRef.current -= 1;
      // Only now may the wake word take the microphone back.
      evaluateWakeWord();
    }
  }, [stopGpsWatch, clearPlanWatchdog, disarmWakeWord, markVoicePassive, evaluateWakeWord]);

  // KVKK m.11/e: when the driver turns location sharing off, no position
  // leaves the phone (AKBA then plans from the İstanbul fallback).
  const shareLocationRef = useRef(true);
  useEffect(() => {
    void LocalUserStorage.getPreference(SHARE_LOCATION_PREF).then((v: string | null) => {
      shareLocationRef.current = v !== "off";
    });
  }, [user?.id]);

  // The driver's standing break exclusions (per person) and the wake-word
  // switch (per device), re-read when the signed-in person changes.
  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    if (userId == null) {
      excludedBreakKindsRef.current = [];
      BreakExclusions.set([]);
    } else {
      void LocalUserStorage.getPreference(excludedBreaksPrefKey(userId)).then(
        (raw: string | null) => {
          if (cancelled) return;
          const kinds = parseStoredBreakKinds(raw);
          excludedBreakKindsRef.current = kinds;
          BreakExclusions.set(kinds);
        },
      );
    }
    // The device-wide key the list used before it was per person. Whose it
    // was cannot be told, so it is dropped rather than handed to this driver.
    void LocalUserStorage.deletePreference(LEGACY_EXCLUDED_BREAKS_PREF).catch(() => {});
    void LocalUserStorage.getPreference(WAKE_WORD_PREF).then((v: string | null) => {
      if (cancelled) return;
      wakeWordEnabledRef.current = v !== "off";
      evaluateWakeWord();
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, evaluateWakeWord]);

  // Profile's switches take effect at once, also in the middle of a drive.
  useEffect(
    () =>
      LocalUserStorage.onPreferenceChange((key, value) => {
        if (key === SHARE_LOCATION_PREF) {
          shareLocationRef.current = value !== "off";
        } else if (key === WAKE_WORD_PREF) {
          wakeWordEnabledRef.current = value !== "off";
          evaluateWakeWord();
        }
      }),
    [evaluateWakeWord],
  );

  const publishClientMessage = useCallback((message: Record<string, unknown>) => {
    if (message.type === "gps_update" && !shareLocationRef.current) return;
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    room.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify(message)), {
        reliable: true,
        topic: CLIENT_TOPIC,
      })
      .catch((error) => {
        console.error("[useDrivingAgent] publishData failed:", error);
      });
  }, []);

  const publishBatterySnapshot = useCallback(() => {
    const batteryPrefs = DriveSessionStore.getBatteryPreferences();
    // Until the driver has entered a level there is nothing true to report;
    // AKBA then asks for it instead of planning on a made-up default.
    if (batteryPrefs.updatedAt === null) return;
    publishClientMessage({
      type: "battery_update",
      percent: batteryPrefs.start,
      updated_at: batteryPrefs.updatedAt,
      charging: charging.isActive,
    });
    // A data message sent while the agent is still starting up is lost;
    // participant attributes are state, so the agent reads them whenever it is ready.
    void roomRef.current?.localParticipant
      .setAttributes({
        battery_percent: String(batteryPrefs.start),
        battery_updated_at: String(batteryPrefs.updatedAt),
      })
      .catch(() => {});
  }, [publishClientMessage, charging.isActive]);

  const stopVoiceSessionPreservingDrive = useCallback(async () => {
    // A start still in flight is overtaken by this stop. It only notices at
    // its next await; the controls should not wait for that.
    startGenerationRef.current += 1;
    if (connectingRef.current) setStatus("disconnected");
    try {
      // Agent explicitly ended the voice leg of the drive. Prevent any
      // auto-reconnect and move the UI back to passive navigation.
      blockAutoVoiceRestartRef.current = true;
      sessionStartedRef.current = false;
      await stopPlanningHoldSound();
      await disconnectRoom();
    } catch (error) {
      console.error(
        "[useDrivingAgent] Failed to stop voice session after agent end:",
        error,
      );
    } finally {
      setPassiveDriveState();
    }
  }, [disconnectRoom, setPassiveDriveState, stopPlanningHoldSound]);

  const stopAgentSession = useCallback(async () => {
    // A start still in flight is overtaken by this stop. The flags below are
    // set before the first await, so the status change of that start's quiet
    // teardown cannot look like a dropped connection to the reconnect ladder.
    startGenerationRef.current += 1;
    if (connectingRef.current) setStatus("disconnected");
    sessionStartedRef.current = false;
    manuallyEndedRef.current = true;
    // The drive is over; the next explicit start should be a fresh session.
    forceFreshSessionRef.current = true;
    try {
      await stopPlanningHoldSound();
      await disconnectRoom();
      DriveSessionStore.endSession();
      // Whatever held this drive's voice passive ends with it: the next drive
      // starts by itself again, with a full reconnect ladder.
      blockAutoVoiceRestartRef.current = false;
      reconnectAttemptsRef.current = 0;
    } catch (error) {
      console.error("[useDrivingAgent] Failed to stop agent session:", error);
    }
  }, [disconnectRoom, stopPlanningHoldSound]);

  /**
   * Ingests the server-side planEvRoute result (topic atlas.tool, tool_end).
   * The agent already fetched the Electrip gateway and stripped heavy geometry
   * (polyline/spans), so the map polyline is re-fetched via Google Directions.
   */
  const ingestRoutePlanResult = useCallback(
    (result: Record<string, any>) => {
      const data = result?.data;
      const sections = data?.routes?.[0]?.sections;
      if (!result?.success || !Array.isArray(sections) || sections.length === 0) {
        console.error(
          "[useDrivingAgent] planEvRoute failed or returned no routes:",
          result?.error,
        );
        return;
      }

      const firstSection = sections[0];
      const lastSection = sections[sections.length - 1];
      if (
        !firstSection?.departure?.place?.location ||
        !lastSection?.arrival?.place?.location
      ) {
        console.error("[useDrivingAgent] Route missing location data");
        return;
      }

      const routeOrigin = {
        latitude: firstSection.departure.place.location.lat,
        longitude: firstSection.departure.place.location.lng,
      };
      const routeDestination = {
        latitude: lastSection.arrival.place.location.lat,
        longitude: lastSection.arrival.place.location.lng,
      };
      const stops: { latitude: number; longitude: number }[] = [];
      for (let i = 0; i < sections.length - 1; i++) {
        const stopLoc = sections[i].arrival?.place?.location;
        if (stopLoc) {
          stops.push({ latitude: stopLoc.lat, longitude: stopLoc.lng });
        }
      }

      // 1. Initial synchronous session start (no road-snapped polyline yet).
      // Ensures DriveSessionStore.context exists for setRoutePlanData and map fitting.
      const initialRoutePayload = {
        origin: routeOrigin,
        destination: routeDestination,
        stops,
        polyline: [routeOrigin, ...stops, routeDestination],
        summary: { duration: 0, distance: 0 },
      };
      if (!DriveSessionStore.getContext()) {
        DriveSessionStore.startSession(initialRoutePayload);
      } else {
        DriveSessionStore.setRouteFromFrontend(initialRoutePayload);
      }

      // 2. Background high-fidelity polyline fetch (Google Directions).
      fetchDirections(
        routeOrigin,
        routeDestination,
        stops,
        GOOGLE_MAPS_API_KEY || "",
      )
        .then((snapped) => {
          if (snapped && snapped.points.length > 0) {
            DriveSessionStore.setRouteFromFrontend({
              origin: routeOrigin,
              destination: routeDestination,
              stops,
              polyline: snapped.points,
              summary: {
                duration: snapped.duration,
                distance: snapped.distance,
              },
            });
            console.log(
              "[useDrivingAgent] ✅ Route snapped to road via Google Directions.",
            );
          } else {
            console.warn("[useDrivingAgent] ⚠️ fetchDirections returned no points.");
          }
        })
        .catch((err) => {
          console.error("[useDrivingAgent] ❌ fetchDirections background error:", err);
        });

      // 3. Store the route plan for the RoutePlanSheet UI. The gateway now
      // receives the driver's interests (published as a participant attribute
      // above) and returns its own highlights; personalizeRoutePlan only fills
      // in locally when that server pass produced nothing.
      const normalized = normalizeRoutePlanFromGateway(data as RoutePlanData);
      // The agent's list is the newest truth; the stored one covers an agent
      // that does not send it.
      const excludedKinds = Array.isArray(result?.excluded_break_categories)
        ? result.excluded_break_categories
        : Array.isArray(data?.excluded_break_categories)
          ? data.excluded_break_categories
          : excludedBreakKindsRef.current;
      const personalized = personalizeRoutePlan(
        normalized,
        userInterestsRef.current,
        excludedKinds,
      );
      if (personalized.locations && personalized.summary) {
        DriveSessionStore.setRoutePlanData(personalized);
      }

      DriveSessionStore.setAiState(DriveSessionState.CAR_SESSION_ACTIVE);
    },
    [],
  );

  /**
   * The profile chips AKBA stopped using (removed_interests) or that the
   * driver allowed again (restored_interests), made binding on this phone.
   */
  const applyInterestChanges = useCallback(async (event: Record<string, any>) => {
    const removed = stringList(event.removed_interests);
    const restored = stringList(event.restored_interests);
    const signedIn = userRef.current;
    if ((!removed.length && !restored.length) || !signedIn) return;
    // The stored row, not the rendered one: the update just before this one
    // may not have reached UserContext yet, and filtering the rendered list
    // would bring back a chip it removed.
    const current = await LocalUserStorage.getUserById(signedIn.id);
    if (!current) return;
    const next = updateInterestChips(
      current.interests,
      removed,
      restored,
      PREDEFINED_USER_INTERESTS,
    );
    if (
      next.length === current.interests.length &&
      next.every((interest, i) => interest === current.interests[i])
    ) {
      return;
    }
    userInterestsRef.current = next;

    // Same format as at join. With the last chip gone this is "", which
    // LiveKit does not store: it deletes the attribute. It is still sent, and
    // the agent reads the interests key disappearing as an empty list.
    const room = roomRef.current;
    if (room && room.state === ConnectionState.Connected) {
      void room.localParticipant
        .setAttributes({ interests: buildInterestsAttribute(next) })
        .catch((error) => {
          console.error("[useDrivingAgent] Failed to republish interests:", error);
        });
    }

    try {
      const updated = await LocalUserStorage.updateUser(current.id, {
        firstName: current.first_name,
        lastName: current.last_name,
        interests: next,
      });
      // Through UserContext, so Profile shows the chips as they are now.
      if (updated) setUserRef.current(updated);
    } catch (error) {
      console.error("[useDrivingAgent] Failed to update interests:", error);
    }
  }, []);

  /**
   * The driver told AKBA never to suggest a kind of break (or to suggest it
   * again). The agent sends the full list after the change plus the profile
   * chips it stopped using or gave back; all of it is made binding on this
   * phone. Called through preferenceQueueRef, one event at a time.
   */
  const applyPreferenceUpdate = useCallback(async (event: Record<string, any>) => {
    let kinds: BreakKind[] | null = null;
    if (Array.isArray(event.excluded_break_categories)) {
      kinds = normalizeBreakKinds(event.excluded_break_categories);
      excludedBreakKindsRef.current = kinds;
      BreakExclusions.set(kinds);
      const userId = userRef.current?.id;
      if (userId != null) {
        try {
          await LocalUserStorage.setPreference(
            excludedBreaksPrefKey(userId),
            JSON.stringify(kinds),
          );
        } catch (error) {
          console.error("[useDrivingAgent] Failed to store break exclusions:", error);
        }
      }
    }

    await applyInterestChanges(event);

    // The route on screen drops the excluded kind now (sheet card and map
    // marker), even if the driver declines the re-plan AKBA offers. A preview
    // of a stored drive is left as it was stored.
    const shown = DriveSessionStore.getRoutePlanData();
    if (kinds && shown && !DriveSessionStore.getContext()?.isPreviewMode) {
      const refiltered = personalizeRoutePlan(shown, userInterestsRef.current, kinds);
      if (refiltered !== shown) DriveSessionStore.setRoutePlanData(refiltered);
    }
  }, [applyInterestChanges]);

  const handleToolEvent = useCallback(
    (event: Record<string, any>) => {
      const eventType = event?.type;

      if (eventType === "tool_start") {
        const mappedName = ATLAS_TOOL_NAME_MAP[event.name] ?? event.name;
        console.log("[Atlas Tool Request]", event.name, JSON.stringify(event.input));
        const newCall: AgentToolCall = {
          toolName: mappedName,
          toolCallId: `${event.name}-${Date.now()}`,
          toolType: "server",
          status: "pending",
          requestedAt: Date.now(),
        };
        setToolCalls((prev) => [...prev, newCall]);
        setLastToolEvent(newCall);

        // A level the driver confirmed or corrected aloud is the newest truth:
        // keep the pill and the stored value in step with it.
        const spokenBattery =
          event.name === "planEvRoute" ? event.input?.battery
          : event.name === "setBatteryPercent" ? event.input?.charge
          : undefined;
        if (typeof spokenBattery === "number" && spokenBattery >= 0 && spokenBattery <= 100) {
          void DriveSessionStore.setBatteryPreferences(
            Math.round(spokenBattery),
            DriveSessionStore.getBatteryPreferences().arrival,
            true,
          );
        }

        if (event.name === "planEvRoute") {
          DriveSessionStore.setAiState(DriveSessionState.PLANNING_ROUTE);
          void startPlanningHoldSound();
          // Failsafe: if the agent never sends tool_end (e.g. it crashes mid-plan),
          // don't leave the hold sound looping and the UI stuck in PLANNING_ROUTE.
          clearPlanWatchdog();
          planWatchdogRef.current = setTimeout(() => {
            console.warn("[useDrivingAgent] planEvRoute watchdog fired — unsticking UI");
            void stopPlanningHoldSound();
            if (DriveSessionStore.getState() === DriveSessionState.PLANNING_ROUTE) {
              DriveSessionStore.setAiState(DriveSessionState.AI_LISTENING);
            }
          }, PLAN_WATCHDOG_MS);
        }
        return;
      }

      if (eventType === "tool_end") {
        const mappedName = ATLAS_TOOL_NAME_MAP[event.name] ?? event.name;
        // A plan the driver already replaced with a newer one. The newer plan may
        // still be running, so only resolve the oldest pending entry quietly: no
        // error, no route change, no touching the planning state or its sound.
        if (event.result?.superseded === true) {
          setToolCalls((prev) => {
            const idx = prev.findIndex(
              (tc) => tc.toolName === mappedName && tc.status === "pending",
            );
            if (idx === -1) return prev;
            return prev.map((tc, i) =>
              i === idx ? { ...tc, status: "success" as const, respondedAt: Date.now() } : tc,
            );
          });
          return;
        }
        const isError = event.result?.success === false;
        console.log("[Atlas Tool Response]", event.name, "error:", isError);

        let resolvedId: string | null = null;
        setToolCalls((prev) => {
          const pendingIdx = [...prev]
            .reverse()
            .findIndex((tc) => tc.toolName === mappedName && tc.status === "pending");
          if (pendingIdx === -1) return prev;
          const idx = prev.length - 1 - pendingIdx;
          resolvedId = prev[idx].toolCallId;
          return prev.map((tc, i) =>
            i === idx
              ? {
                  ...tc,
                  status: isError ? "error" : ("success" as const),
                  respondedAt: Date.now(),
                }
              : tc,
          );
        });
        setLastToolEvent((prev) => {
          if (prev && (prev.toolCallId === resolvedId || prev.toolName === mappedName)) {
            return {
              ...prev,
              status: isError ? "error" : "success",
              respondedAt: Date.now(),
            } as AgentToolCall;
          }
          return prev;
        });

        if (event.name === "planEvRoute") {
          clearPlanWatchdog();
          try {
            ingestRoutePlanResult(event.result ?? {});
          } finally {
            void stopPlanningHoldSound();
            // Ensure we don't get stuck in planning state if something goes wrong
            if (DriveSessionStore.getState() === DriveSessionState.PLANNING_ROUTE) {
              DriveSessionStore.setAiState(DriveSessionState.AI_LISTENING);
            }
          }
        }
        return;
      }

      if (eventType === "session_ended") {
        console.log("[useDrivingAgent] Agent ended the session:", event.reason);
        if (sessionStartedRef.current) {
          void stopVoiceSessionPreservingDrive();
        }
        return;
      }

      if (eventType === "preference_update") {
        console.log(
          "[useDrivingAgent] Break preferences changed:",
          event.excluded_break_categories,
          event.removed_interests,
          event.restored_interests,
        );
        // One at a time: two quick updates must not both start from the
        // chips as they were before either of them.
        preferenceQueueRef.current = preferenceQueueRef.current
          .then(() => applyPreferenceUpdate(event))
          .catch((error) => {
            console.error("[useDrivingAgent] Failed to apply preference update:", error);
          });
        return;
      }

      if (eventType === "client_error") {
        // The agent only emits this for no_active_session and
        // agent_session_unavailable — both mean the session is dead. Logging
        // and carrying on left the UI showing "Atlas sizi dinliyor" over a
        // connection that would never answer again.
        console.error("[useDrivingAgent] Agent client_error:", event.code, event.message);
        Sentry.captureMessage(`atlas client_error: ${event.code}`, {
          level: "error",
          tags: { feature: "atlas-voice" },
          extra: { code: event.code, message: event.message },
        });
        DriveSessionStore.setAiState(DriveSessionState.AI_ERROR);
        return;
      }

      // usage / assistant_output_done are telemetry-only for now.
    },
    [
      applyPreferenceUpdate,
      clearPlanWatchdog,
      ingestRoutePlanResult,
      startPlanningHoldSound,
      stopPlanningHoldSound,
      stopVoiceSessionPreservingDrive,
    ],
  );
  const handleToolEventRef = useRef(handleToolEvent);
  handleToolEventRef.current = handleToolEvent;

  const startAgentSession = useCallback(async () => {
    blockAutoVoiceRestartRef.current = false;

    if (sessionStartedRef.current || connectingRef.current || !user) return;
    connectingRef.current = true;
    // Started now, awaited before the audio session: the recognizer lets go
    // of the microphone while the GPS fix and the token are fetched.
    const wakeWordReleased = disarmWakeWord();
    // Checked after every await below: a stop pressed meanwhile wins.
    const generation = startGenerationRef.current;
    const ensureStillWanted = () => {
      if (generation !== startGenerationRef.current) throw new StartCancelledError();
    };

    try {
      DriveSessionStore.setAiState(DriveSessionState.AI_CONNECTING);
      setStatus("connecting");
      setToolCalls([]);
      setLastToolEvent(null);

      // 1. Get current location for Atlas.
      // Bounded on purpose: a cold fix in a garage or a tunnel can take a very
      // long time, and this runs before the token fetch and the room connect,
      // so an unbounded wait leaves the UI stuck in AI_CONNECTING with
      // connectingRef blocking any retry. The agent already tolerates missing
      // GPS (it waits 1.5s for it, then greets anyway), so proceeding without
      // coordinates costs far less than not connecting at all.
      let coords: { latitude: number; longitude: number } | null = null;
      const { status: locStatus } =
        await Location.requestForegroundPermissionsAsync();
      ensureStillWanted();
      if (locStatus === "granted") {
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), GPS_FIX_TIMEOUT_MS),
          ),
        ]);
        ensureStillWanted();
        if (loc) {
          coords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          currentLocationRef.current = `${coords.latitude},${coords.longitude}`;
        } else {
          console.warn(
            "[useDrivingAgent] No GPS fix within the timeout; connecting without one.",
          );
        }
      }

      // 2. Fetch a LiveKit token from the Atlas token server
      // The SQLite row id restarts at 1 on every install, so two demo phones
      // used to share one agent identity (and one memory). The phone hash is
      // stable per person across devices and passes the token server's rule.
      const identity = `driver-${(user.phone_hash || String(user.id)).slice(0, 32)}`;
      const { token, url } = await fetchAtlasToken({
        identity,
        language: "tr",
        newSession: forceFreshSessionRef.current,
      });
      ensureStillWanted();

      // 3. Configure and start the audio session (speaker output for driving).
      // The wake-word recognizer must be fully stopped first.
      await wakeWordReleased;
      ensureStillWanted();
      await AudioSession.configureAudio({
        ios: { defaultOutput: "speaker" },
      });
      ensureStillWanted();
      await AudioSession.startAudioSession();
      audioSessionActiveRef.current = true;
      ensureStillWanted();

      // 4. Connect to the room; the LiveKit server auto-dispatches Atlas into it
      const room = new Room();
      roomRef.current = room;
      agentParticipantRef.current = null;
      batteryResentRef.current = false;

      const captureAgent = (participant: RemoteParticipant) => {
        if (participant.identity.startsWith("agent-")) {
          const isFirstCapture = agentParticipantRef.current === null;
          agentParticipantRef.current = participant;
          // Data published before the agent joined the room is dropped, so send
          // the battery snapshot once the agent is actually present to receive it.
          if (isFirstCapture) {
            publishBatterySnapshot();
          }
          // An agent that was already listening fires no attribute change.
          if (participant.attributes["lk.agent.state"] === "listening") {
            playStartCueOnce();
          }
        }
      };

      room
        .on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
          if (state === ConnectionState.Connected) {
            setStatus("connected");
            reconnectAttemptsRef.current = 0;
          } else if (state === ConnectionState.Disconnected) {
            setStatus("disconnected");
          } else {
            // Connecting / Reconnecting / SignalReconnecting
            setStatus("connecting");
          }
        })
        .on(RoomEvent.ParticipantConnected, captureAgent)
        .on(RoomEvent.ParticipantDisconnected, (participant) => {
          if (participant === agentParticipantRef.current) {
            // The agent left (crash/redeploy) but our transport is still up.
            // Drop the frozen speaking state so the UI doesn't look stuck.
            console.warn("[useDrivingAgent] Agent participant left the room");
            agentParticipantRef.current = null;
            setIsSpeaking(false);
            setAudioLevel(0);
            setAgentAudioTrack(null);
            VoiceLevelBus.reset();
          }
        })
        .on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
          if (track.kind !== Track.Kind.Audio) return;
          if (!participant.identity.startsWith("agent-")) return;
          setAgentAudioTrack(track as RemoteAudioTrack);
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          setAgentAudioTrack((current) => (current === track ? null : current));
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          // Whoever is missing from the list is silent.
          let mic = 0;
          let agent = 0;
          for (const speaker of speakers) {
            if (speaker === room.localParticipant) mic = speaker.audioLevel;
            else if (speaker === agentParticipantRef.current) agent = speaker.audioLevel;
          }
          VoiceLevelBus.publish({ mic, agent });
        })
        .on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
          if (participant !== agentParticipantRef.current) return;
          const agentState = participant.attributes["lk.agent.state"];
          if (agentState) {
            setIsSpeaking(agentState === "speaking");
          }
          // The room is up before the agent is: its first "listening" is the
          // moment the driver can actually be heard. Before the session is
          // live (mic published) this does nothing; the start's success
          // block cues an agent that was already listening by then.
          if (agentState === "listening") {
            playStartCueOnce();
          }
          // The join-time snapshot can reach the agent before it listens for
          // data; by its first "listening" it does. Re-sending is idempotent.
          if (agentState === "listening" && !batteryResentRef.current) {
            batteryResentRef.current = true;
            publishBatterySnapshot();
          }
        })
        .on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => {
          if (topic !== TOOL_TOPIC) return;
          try {
            const event = JSON.parse(new TextDecoder().decode(payload));
            handleToolEventRef.current(event);
          } catch (error) {
            console.error("[useDrivingAgent] Failed to parse tool event:", error);
          }
        })
        .on(RoomEvent.Disconnected, () => {
          console.log("[useDrivingAgent] ❌ Disconnected from LiveKit room");
          const hasRoute = !!DriveSessionStore.getRoutePlanData();
          void stopPlanningHoldSound();
          clearPlanWatchdog();
          stopGpsWatch();
          sessionStartedRef.current = false;
          setIsSpeaking(false);
          setAgentAudioTrack(null);
          VoiceLevelBus.reset();
          // Still ours means the server or the network closed it; a local stop
          // has already let go of it. Either way disconnectRoom releases the
          // audio session and plays the end cue, and only then can the wake
          // word listen again.
          if (roomRef.current === room) {
            void disconnectRoom();
          }

          // Once a route exists, Atlas voice should stay passive until the user
          // explicitly taps the orb again. This avoids unexpected reconnects.
          // Not for "Sürüşü Bitir": that drive is over, and stopAgentSession
          // leaves the next one free to start by itself.
          if (hasRoute && !manuallyEndedRef.current) {
            blockAutoVoiceRestartRef.current = true;
          }

          DriveSessionStore.setAiState(
            hasRoute
              ? DriveSessionState.NAVIGATION_ONLY
              : DriveSessionState.IDLE,
          );
          console.log("[useDrivingAgent] AI is now PASSIVE.");
        });

      await room.connect(url, token);
      ensureStillWanted();

      // 5. Push GPS + profile as participant attributes FIRST — before the
      // (slower) mic publish — so they land inside the agent's 1.5 s
      // waitForGpsAttributes window, and in particular before the driver can
      // speak a destination. Interests go out as attributes rather than a data
      // message because attributes are participant state: an agent that
      // restarts mid-session re-reads them, while a data message is gone.
      const attributes: Record<string, string> = {};
      if (coords && shareLocationRef.current) {
        attributes.latitude = String(coords.latitude);
        attributes.longitude = String(coords.longitude);
      }
      // Deliberately outside the coords check — a driver starting in an
      // underground garage has no fix yet, but still has stop preferences.
      // buildInterestsAttribute puts the practical needs first.
      const interestsAttribute = buildInterestsAttribute(user?.interests ?? []);
      if (interestsAttribute) attributes.interests = interestsAttribute;
      // The battery level rides along as participant state, so it is already
      // there when the agent comes up (see publishBatterySnapshot).
      const batteryAtJoin = DriveSessionStore.getBatteryPreferences();
      if (batteryAtJoin.updatedAt !== null) {
        attributes.battery_percent = String(batteryAtJoin.start);
        attributes.battery_updated_at = String(batteryAtJoin.updatedAt);
      }
      // Whether the driver is already on the road decides AKBA's opening line.
      // Motion is not position, so it goes out even with location sharing off.
      attributes.activity = activityRef.current;
      const speedKmh = SpeedStore.getSpeed(); // km/h, the source useSpeed reads
      if (Number.isFinite(speedKmh)) {
        attributes.speed_kmh = String(Math.max(0, Math.round(speedKmh)));
      }
      if (Object.keys(attributes).length) {
        await room.localParticipant.setAttributes(attributes);
        ensureStillWanted();
      }

      // 6. Capture the agent participant if it is already present, then publish mic.
      // captureAgent sends the initial battery snapshot once the agent is present
      // (whether already here or via the ParticipantConnected event below).
      room.remoteParticipants.forEach(captureAgent);

      // Android never prompts for RECORD_AUDIO on its own here: enabling the
      // microphone track without the runtime grant just produces a silent
      // session, which looks identical to a working one until nobody answers.
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        );
        ensureStillWanted();
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error("Microphone permission denied");
        }
      }

      await room.localParticipant.setMicrophoneEnabled(true);
      ensureStillWanted();
      setIsMuted(false);

      // 7. Stream GPS + basic telemetry while the session is live
      gpsWatchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 3000,
          distanceInterval: 15,
        },
        (loc) => {
          currentLocationRef.current = `${loc.coords.latitude},${loc.coords.longitude}`;
          const speed = loc.coords.speed;
          publishClientMessage({
            type: "gps_update",
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? undefined,
            // iOS reports -1 when it does not know; say nothing instead.
            speed_mps: speed != null && speed >= 0 ? speed : undefined,
            heading: loc.coords.heading ?? undefined,
          });
        },
      );
      // Assigned first, so the teardown of a cancelled start removes it.
      ensureStillWanted();

      if (roomRef.current !== room) {
        // Closed by the server while it was still being set up.
        throw new Error("Room disconnected during session start");
      }
      sessionStartedRef.current = true;
      voiceLiveRef.current = true;
      manuallyEndedRef.current = false;
      forceFreshSessionRef.current = false;
      console.log("[useDrivingAgent] Session started successfully");
      // An agent that reached "listening" before the mic was up fired its
      // attribute change too early to cue; the session is live only now.
      // (Cast: the room events set the ref, which flow analysis cannot see.)
      const agentNow = agentParticipantRef.current as RemoteParticipant | null;
      if (agentNow?.attributes["lk.agent.state"] === "listening") {
        playStartCueOnce();
      }
      if (wakeWordEnabledRef.current !== false) {
        // The one moment the app asks: in car mode, with the microphone just
        // granted. Never from the wake-word listener itself.
        void requestWakeWordPermissionIfNeverAsked();
      }
    } catch (error) {
      if (
        error instanceof StartCancelledError ||
        generation !== startGenerationRef.current
      ) {
        // A stop arrived while this start was still in flight. The stop has
        // already set the drive state; only what this start acquired after it
        // (room, audio session, GPS watch) is let go. Not an error: no error
        // state, no Sentry. The status only leaves "connecting", which no
        // room event reports when the stop came before the room existed.
        console.log("[useDrivingAgent] Session start cancelled by a stop");
        await disconnectRoom();
        setStatus("disconnected");
        return;
      }
      console.error("[useDrivingAgent] Failed to start agent session:", error);
      Sentry.captureException(error, {
        tags: { feature: "atlas-voice", phase: "start-session" },
      });

      // A misconfigured build or a rejected secret cannot be fixed by trying
      // again, and the reconnect ladder now fires on "error" — so stop it from
      // burning three attempts and a token-server round trip on a certainty.
      if (error instanceof AtlasTokenError && !error.retryable) {
        blockAutoVoiceRestartRef.current = true;
      }

      await stopPlanningHoldSound();
      await disconnectRoom();
      setStatus("error");
      DriveSessionStore.setAiState(DriveSessionState.AI_ERROR);
    } finally {
      connectingRef.current = false;
      evaluateWakeWord();
    }
  }, [
    user,
    disconnectRoom,
    disarmWakeWord,
    evaluateWakeWord,
    playStartCueOnce,
    publishClientMessage,
    publishBatterySnapshot,
    stopGpsWatch,
    stopPlanningHoldSound,
    clearPlanWatchdog,
  ]);
  const startAgentSessionRef = useRef(startAgentSession);
  startAgentSessionRef.current = startAgentSession;

  // "AKBA" heard on the phone: the same connect path as tapping the orb. The
  // rising cue follows once the session is live, never for a failed start.
  handleWakeRef.current = () => {
    // A disarm that raced the match (screen lock, drive end) took it back.
    if (!wakeArmRequestedRef.current) return;
    // The listener has already stopped itself.
    wakeArmRequestedRef.current = false;
    void startAgentSessionRef.current();
    // If the start bailed out (it was already connecting), listen again.
    evaluateWakeWord();
  };

  const setMuted = useCallback(async (muted: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!muted);
      setIsMuted(muted);
    } catch (error) {
      console.error("[useDrivingAgent] Failed to toggle microphone:", error);
    }
  }, []);

  // Re-check the wake word whenever the transport, the drive or the app's
  // foreground state changes.
  useEffect(() => {
    evaluateWakeWord();
  }, [status, evaluateWakeWord]);

  useEffect(
    () => DriveSessionStore.onStateChange(() => evaluateWakeWord()),
    [evaluateWakeWord],
  );

  // A drive that ends without stopAgentSession (a closed preview that had
  // gone live, a dismissed prompt) must not keep the next one from starting.
  // Only the moment the drive goes away counts: a notify while there is no
  // drive (e.g. AI_ERROR after a non-retryable token error) keeps the block.
  useEffect(() => {
    let hadDrive = DriveSessionStore.getContext() !== null;
    return DriveSessionStore.onStateChange(() => {
      const hasDrive = DriveSessionStore.getContext() !== null;
      if (hadDrive && !hasDrive) {
        blockAutoVoiceRestartRef.current = false;
        reconnectAttemptsRef.current = 0;
      }
      hadDrive = hasDrive;
    });
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      appStateRef.current = next;
      evaluateWakeWord();
    });
    return () => subscription.remove();
  }, [evaluateWakeWord]);

  // Sync transport status to DriveSessionStore
  useEffect(() => {
    const currentAiState = DriveSessionStore.getState();
    const hasRoute = !!DriveSessionStore.getRoutePlanData();

    if (status === "connected") {
      // Don't override special states (Planning or Confirmed End)
      // with generic listening/speaking states.
      if (
        currentAiState === DriveSessionState.PLANNING_ROUTE ||
        currentAiState === DriveSessionState.ENDING_DRIVE_CONFIRMATION
      ) {
        return;
      }

      const targetState = isSpeaking
        ? DriveSessionState.AI_SPEAKING
        : DriveSessionState.AI_LISTENING;

      if (currentAiState !== targetState) {
        DriveSessionStore.setAiState(targetState);
      }
    } else if (status === "connecting") {
      if (
        !blockAutoVoiceRestartRef.current &&
        currentAiState !== DriveSessionState.PLANNING_ROUTE &&
        currentAiState !== DriveSessionState.ENDING_DRIVE_CONFIRMATION &&
        currentAiState !== DriveSessionState.AI_CONNECTING
      ) {
        DriveSessionStore.setAiState(DriveSessionState.AI_CONNECTING);
      }
    } else if (status === "error") {
      if (hasRoute) {
        setPassiveDriveState();
      } else if (currentAiState !== DriveSessionState.AI_ERROR) {
        DriveSessionStore.setAiState(DriveSessionState.AI_ERROR);
      }
    } else if (status === "disconnected") {
      // If voice transport is gone, ensure the drive UI does not remain stuck
      // in a listening/speaking state.
      if (
        currentAiState === DriveSessionState.AI_SPEAKING ||
        currentAiState === DriveSessionState.AI_LISTENING ||
        currentAiState === DriveSessionState.AI_CONNECTING ||
        currentAiState === DriveSessionState.PLANNING_ROUTE
      ) {
        setPassiveDriveState();
      }
    }
  }, [status, isSpeaking, setPassiveDriveState]);

  // Auto-reconnect when the transport drops unexpectedly while still in CAR mode
  useEffect(() => {
    const hasRoute = !!DriveSessionStore.getRoutePlanData();

    if (hasRoute) {
      reconnectAttemptsRef.current = 0;
      return () => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      };
    }

    // "error" belongs here as much as "disconnected": every failure inside
    // startAgentSession — token server down, DNS, TLS, room.connect rejecting —
    // lands in its catch and sets "error", never "disconnected". Without this
    // the retry ladder only covered the one case that rarely happens.
    // Not while a start is still running: a failed room.connect reports
    // "disconnected" from the room and then "error" from the start's catch,
    // and only the second may count, or one failure burns two attempts.
    if (
      (status === "disconnected" || status === "error") &&
      !connectingRef.current &&
      !manuallyEndedRef.current &&
      !sessionStartedRef.current &&
      !blockAutoVoiceRestartRef.current &&
      activity === ActivityState.CAR
    ) {
      if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(
          2000 * Math.pow(2, reconnectAttemptsRef.current),
          10000,
        );
        reconnectAttemptsRef.current += 1;
        console.log(
          `[useDrivingAgent] 🔄 Auto-reconnect attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`,
        );

        reconnectTimerRef.current = setTimeout(() => {
          startAgentSession();
        }, delay);
      } else {
        console.log(
          `[useDrivingAgent] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Going passive.`,
        );
        // Not stopAgentSession(): that sets forceFreshSessionRef, which throws
        // away the server-side session the driver could still have resumed.
        // The network failed, the driver did not end anything.
        void stopVoiceSessionPreservingDrive();
      }
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [status, activity, startAgentSession, stopVoiceSessionPreservingDrive]);

  useEffect(() => {
    unmountingRef.current = false;
    void preloadEarcons();
    return () => {
      unmountingRef.current = true;
      // A start still in flight must not finish into an unmounted hook.
      startGenerationRef.current += 1;
      void disarmWakeWord();
      void stopPlanningHoldSound();
      void disconnectRoom();
    };
  }, [disarmWakeWord, disconnectRoom, stopPlanningHoldSound]);

  // Poll the agent's audio level for the visualizer
  useEffect(() => {
    if (status === "connected") {
      const interval = setInterval(() => {
        setAudioLevel(agentParticipantRef.current?.audioLevel ?? 0);
      }, 500); // 500ms to prevent JS thread blockage
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [status]);

  // Handle Activity State Transitions
  useEffect(() => {
    // Let the global store handle delayed confirmation prompts on state exit
    DriveSessionStore.handleActivityChange(activity);

    if (activity !== ActivityState.CAR) {
      // "Sürüşü Bitir" only blocks the auto-start for the drive it ended;
      // the next drive should trigger by itself again.
      manuallyEndedRef.current = false;
    }

    if (activity === ActivityState.CAR && user) {
      if (
        !sessionStartedRef.current &&
        !manuallyEndedRef.current &&
        !blockAutoVoiceRestartRef.current
      ) {
        startAgentSession();
      }
    }
  }, [activity, startAgentSession, user]);

  // Re-send the battery level whenever the driver changes it in car mode.
  useEffect(() => DriveSessionStore.onBatteryPreferencesChange(() => publishBatterySnapshot()), [publishBatterySnapshot]);

  useEffect(() => {
    if (
      !user ||
      sessionStartedRef.current ||
      !DriveSessionStore.hasPendingVoiceReconnect()
    ) {
      return;
    }

    DriveSessionStore.clearPendingVoiceReconnect();
    void startAgentSession();
  }, [startAgentSession, user]);

  useEffect(() => {
    const unsubscribe = DriveSessionStore.onStateChange(() => {
      if (
        !user ||
        sessionStartedRef.current ||
        !DriveSessionStore.hasPendingVoiceReconnect()
      ) {
        return;
      }

      DriveSessionStore.clearPendingVoiceReconnect();
      void startAgentSession();
    });

    return unsubscribe;
  }, [startAgentSession, user]);

  return {
    status,
    isSpeaking,
    isMuted,
    audioLevel,
    agentAudioTrack,
    toolCalls,
    lastToolEvent,
    startSession: startAgentSession,
    stopConversation: stopVoiceSessionPreservingDrive,
    stopSession: stopAgentSession,
    setMuted,
    /** The on-device wake word is listening for "AKBA" right now. */
    wakeWordArmed: wakeWordStatus.armed,
    /** Why the wake word is off, when something is missing (permission, device support). */
    wakeWordUnavailableReason: wakeWordStatus.reason,
  };
}
