import { AudioSession } from "@livekit/react-native";
import * as Sentry from "@sentry/react-native";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import type { RemoteParticipant } from "livekit-client";
import { ConnectionState, Room, RoomEvent } from "livekit-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { useUser } from "../context/UserContext";
import { ActivityState } from "../services/ActivityStateMachine";
import { AtlasTokenError, fetchAtlasToken } from "../services/AtlasTokenService";
import type { RoutePlanData } from "../services/DriveSessionStore";
import {
  DriveSessionState,
  DriveSessionStore,
} from "../services/DriveSessionStore";
import { fetchDirections } from "../services/GoogleMapsService";
import { personalizeRoutePlan } from "../services/routePersonalization";
import { normalizeRoutePlanFromGateway } from "../services/routePlanGateway";
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
  const { user } = useUser();
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
  const planningSoundRef = useRef<Audio.Sound | null>(null);
  const planningFeedbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const roomRef = useRef<Room | null>(null);
  const agentParticipantRef = useRef<RemoteParticipant | null>(null);
  const gpsWatchRef = useRef<Location.LocationSubscription | null>(null);
  const planWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Failsafe: if planEvRoute never returns a tool_end, unstick the UI. */
  const PLAN_WATCHDOG_MS = 45000;
  const MAX_RECONNECT_ATTEMPTS = 3;
  const [status, setStatus] = useState<VoiceStatus>("disconnected");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
  const [lastToolEvent, setLastToolEvent] = useState<AgentToolCall | null>(
    null,
  );
  const currentLocationRef = useRef("0,0");
  const userInterestsRef = useRef<string[]>([]);
  userInterestsRef.current = user?.interests ?? [];

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
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        // This call mutates the process-wide AVAudioSession that LiveKit
        // configured, and nothing restores it afterwards. Leaving it false is
        // what lets iOS tear the call's audio down the moment the screen locks
        // — right after a route is planned, which is exactly when the driver
        // puts the phone away. UIBackgroundModes already declares "audio".
        staysActiveInBackground: true,
        interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
        interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
        shouldDuckAndroid: false,
        playThroughEarpieceAndroid: false,
      });
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
    stopGpsWatch();
    clearPlanWatchdog();
    const room = roomRef.current;
    roomRef.current = null;
    agentParticipantRef.current = null;
    if (room) {
      try {
        await room.disconnect();
      } catch (error) {
        console.error("[useDrivingAgent] Failed to disconnect room:", error);
      }
    }
    try {
      await AudioSession.stopAudioSession();
    } catch {
      // Audio session may already be stopped; ignore.
    }
  }, [stopGpsWatch, clearPlanWatchdog]);

  const publishClientMessage = useCallback((message: Record<string, unknown>) => {
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
    publishClientMessage({
      type: "battery_update",
      percent: batteryPrefs.start ?? 75,
      charging: charging.isActive,
    });
  }, [publishClientMessage, charging.isActive]);

  const stopVoiceSessionPreservingDrive = useCallback(async () => {
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
    try {
      await stopPlanningHoldSound();
      sessionStartedRef.current = false;
      manuallyEndedRef.current = true;
      // The drive is over; the next explicit start should be a fresh session.
      forceFreshSessionRef.current = true;
      await disconnectRoom();
      DriveSessionStore.endSession();
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

      // 3. Store the route plan for the RoutePlanSheet UI. The agent's gateway
      // call carries no interests, so add local highlights when absent.
      const normalized = normalizeRoutePlanFromGateway(data as RoutePlanData);
      const personalized = personalizeRoutePlan(
        normalized,
        userInterestsRef.current,
      );
      if (personalized.locations && personalized.summary) {
        DriveSessionStore.setRoutePlanData(personalized);
      }

      DriveSessionStore.setAiState(DriveSessionState.CAR_SESSION_ACTIVE);
    },
    [],
  );

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
      if (locStatus === "granted") {
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), GPS_FIX_TIMEOUT_MS),
          ),
        ]);
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
      const identity = `driver-${user.id}`;
      const { token, url } = await fetchAtlasToken({
        identity,
        language: "tr",
        newSession: forceFreshSessionRef.current,
      });

      // 3. Configure and start the audio session (speaker output for driving)
      await AudioSession.configureAudio({
        ios: { defaultOutput: "speaker" },
      });
      await AudioSession.startAudioSession();

      // 4. Connect to the room; the LiveKit server auto-dispatches Atlas into it
      const room = new Room();
      roomRef.current = room;
      agentParticipantRef.current = null;

      const captureAgent = (participant: RemoteParticipant) => {
        if (participant.identity.startsWith("agent-")) {
          const isFirstCapture = agentParticipantRef.current === null;
          agentParticipantRef.current = participant;
          // Data published before the agent joined the room is dropped, so send
          // the battery snapshot once the agent is actually present to receive it.
          if (isFirstCapture) {
            publishBatterySnapshot();
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
          }
        })
        .on(RoomEvent.ParticipantAttributesChanged, (_changed, participant) => {
          if (participant !== agentParticipantRef.current) return;
          const agentState = participant.attributes["lk.agent.state"];
          if (agentState) {
            setIsSpeaking(agentState === "speaking");
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
          void AudioSession.stopAudioSession().catch(() => {});

          // Once a route exists, Atlas voice should stay passive until the user
          // explicitly taps the orb again. This avoids unexpected reconnects.
          if (hasRoute) {
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

      // 5. Push GPS as participant attributes FIRST — before the (slower) mic
      // publish — so it lands inside the agent's 1.5 s waitForGpsAttributes window.
      if (coords) {
        await room.localParticipant.setAttributes({
          latitude: String(coords.latitude),
          longitude: String(coords.longitude),
        });
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
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error("Microphone permission denied");
        }
      }

      await room.localParticipant.setMicrophoneEnabled(true);
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
          publishClientMessage({
            type: "gps_update",
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            accuracy: loc.coords.accuracy ?? undefined,
            speed_mps: loc.coords.speed ?? undefined,
            heading: loc.coords.heading ?? undefined,
          });
        },
      );

      sessionStartedRef.current = true;
      manuallyEndedRef.current = false;
      forceFreshSessionRef.current = false;
      console.log("[useDrivingAgent] Session started successfully");
    } catch (error) {
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
    }
  }, [
    user,
    disconnectRoom,
    publishClientMessage,
    publishBatterySnapshot,
    stopGpsWatch,
    stopPlanningHoldSound,
    clearPlanWatchdog,
  ]);

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
    if (
      (status === "disconnected" || status === "error") &&
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
    return () => {
      void stopPlanningHoldSound();
      void disconnectRoom();
    };
  }, [disconnectRoom, stopPlanningHoldSound]);

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
    toolCalls,
    lastToolEvent,
    startSession: startAgentSession,
    stopConversation: stopVoiceSessionPreservingDrive,
    stopSession: stopAgentSession,
    setMuted,
  };
}
