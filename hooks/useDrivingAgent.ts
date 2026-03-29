import type { DisconnectionDetails } from "@elevenlabs/client";
import { useConversation } from "@elevenlabs/react-native";
import * as Location from "expo-location";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useUser } from "../context/UserContext";
import { ActivityState } from "../services/ActivityStateMachine";
import {
  DriveSessionState,
  DriveSessionStore,
} from "../services/DriveSessionStore";
import { fetchDirections } from "../services/GoogleMapsService";
import { socketService } from "../services/SocketService";
import { useActivityState } from "./useActivityState";
import { useChargingSimulation } from "./useChargingSimulation";

const AGENT_ID =
  process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID ||
  "agent_6901kmsmj9v9edc95aqhhab4t19h";

const GOOGLE_MAPS_API_KEY =
  Platform.OS === "ios"
    ? process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_API_KEY
    : process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_API_KEY;

console.log("[useDrivingAgent] 🔑 AGENT_ID =", AGENT_ID);
console.log(
  "[useDrivingAgent] 🔑 RAW ENV =",
  process.env.EXPO_PUBLIC_ELEVENLABS_AGENT_ID,
);

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
  const conversation = useConversation();
  const { user } = useUser();
  const charging = useChargingSimulation();
  const sessionStartedRef = useRef(false);
  const manuallyEndedRef = useRef(false);
  /** When true, agent ended the voice session (e.g. end_call); do not auto-start or reconnect. */
  const blockAutoVoiceRestartRef = useRef(false);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 3;
  const [toolCalls, setToolCalls] = useState<AgentToolCall[]>([]);
  const [lastToolEvent, setLastToolEvent] = useState<AgentToolCall | null>(
    null,
  );
  const currentLocationRef = useRef("0,0");

  const setPassiveDriveState = useCallback(() => {
    const hasRoute = !!DriveSessionStore.getRoutePlanData();
    DriveSessionStore.setAiState(
      hasRoute ? DriveSessionState.NAVIGATION_ONLY : DriveSessionState.IDLE,
    );
  }, []);

  const stopVoiceSessionPreservingDrive = useCallback(async () => {
    try {
      // Agent explicitly ended the voice leg of the drive. Prevent any
      // auto-reconnect and move the UI back to passive navigation.
      blockAutoVoiceRestartRef.current = true;
      sessionStartedRef.current = false;
      await conversation.endSession();
    } catch (error) {
      console.error(
        "[useDrivingAgent] Failed to stop voice session after agent end_call:",
        error,
      );
    } finally {
      setPassiveDriveState();
    }
  }, [conversation, setPassiveDriveState]);

  const stopAgentSession = useCallback(async () => {
    try {
      await conversation.endSession();
      sessionStartedRef.current = false;
      manuallyEndedRef.current = true;
      socketService.disconnect();
      DriveSessionStore.endSession();
    } catch (error) {
      console.error("[useDrivingAgent] Failed to stop agent session:", error);
    }
  }, [conversation]);

  const startAgentSession = useCallback(async () => {
    blockAutoVoiceRestartRef.current = false;

    if (sessionStartedRef.current || !user) return;

    try {
      DriveSessionStore.setAiState(DriveSessionState.AI_CONNECTING);

      // 1. Get current location for Atlas
      let locationString = "0,0";
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({});
        locationString = `${loc.coords.latitude},${loc.coords.longitude}`;
        currentLocationRef.current = locationString;
      }

      // 2. Prepare dynamic variables for Atlas
      const batteryPrefs = DriveSessionStore.getBatteryPreferences();
      const currentDriveContext = DriveSessionStore.getContext();
      const existingRoutePlan = currentDriveContext?.routePlanData;
      const userInterests = user?.interests ?? [];
      const userDisplayName = [user?.first_name, user?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      const destinationLocation =
        existingRoutePlan?.locations.find(
          (location) => location.type === "destination",
        ) || null;
      const activeDestinationName =
        destinationLocation?.name ||
        existingRoutePlan?.waypoints.destination ||
        "";
      const activeDestinationCoords = destinationLocation
        ? `${destinationLocation.coordinates.lat},${destinationLocation.coordinates.lon}`
        : currentDriveContext?.route?.destination
          ? `${currentDriveContext.route.destination.latitude},${currentDriveContext.route.destination.longitude}`
          : "";
      const activeRouteContext = existingRoutePlan
        ? JSON.stringify({
            destination: activeDestinationName,
            summary: existingRoutePlan.summary,
            waypoints: existingRoutePlan.waypoints,
            stationCount: existingRoutePlan.summary.total_station_count,
          })
        : "";
      const dynamicVariables = {
        origin_coords: locationString,
        min_battery_percent: 10,
        max_battery_percent: 100,
        start_battery_percent:
          batteryPrefs.start || Math.round(charging.batteryLevel || 100),
        started_battery:
          batteryPrefs.start || Math.round(charging.batteryLevel || 100),
        destination_battery_target: batteryPrefs.arrival || 80,
        target_battery: batteryPrefs.arrival || 80,
        planning_timestamp: Math.floor(Date.now() / 1000).toString(),
        destination_name_text: activeDestinationName,
        destination_coords: activeDestinationCoords,
        destination_label_text: activeDestinationName,
        active_route_present: existingRoutePlan ? "true" : "false",
        active_route_context: activeRouteContext,
        active_route_destination: activeDestinationName,
        active_route_summary: existingRoutePlan
          ? `${existingRoutePlan.summary.total_travel_length} km, ${existingRoutePlan.summary.total_travel_duration} dk`
          : "",
        driver_name: userDisplayName,
        driver_interests: userInterests.join(", "),
        driver_traits_context: userInterests.length
          ? `${userDisplayName || "Kullanici"} su ilgi alanlarina sahip: ${userInterests.join(", ")}.`
          : "",
      };

      // 3. Start ElevenLabs session with tool callbacks
      console.log(
        `[useDrivingAgent] Starting session with Agent ID: ${AGENT_ID}`,
      );
      console.log(`[useDrivingAgent] Effective Agent ID: ${AGENT_ID}`);

      // Reset tool call history for new session
      setToolCalls([]);
      setLastToolEvent(null);

      conversation.startSession({
        agentId: AGENT_ID,
        dynamicVariables,
        clientTools: {
          create_route_plan: async (params: any) => {
            const startTime = Date.now();
            console.log(
              "[useDrivingAgent] 🛠️ Client Tool Call: create_route_plan",
              params,
            );
            DriveSessionStore.setAiState(DriveSessionState.PLANNING_ROUTE);

            // Helper to ensure we always have "lat,lon" string
            const formatCoords = (val: any) => {
              if (!val) return null;
              if (typeof val === "string" && val.includes(",")) return val;
              if (typeof val === "object" && val.latitude && val.longitude) {
                return `${val.latitude},${val.longitude}`;
              }
              if (typeof val === "object" && val.lat && val.lng) {
                return `${val.lat},${val.lng}`;
              }
              return null;
            };

            // Targeted cleaner: strips HERE Maps optimization fields while keeping
            // everything the assistant needs (actions, locations, summary, waypoints)
            const cleanBackendResponse = (backendData: any): any => {
              if (!backendData) return backendData;
              const cleaned = { ...backendData };

              if (cleaned.routes) {
                cleaned.routes = cleaned.routes.map((route: any) => {
                  // Strip routeHandle (HERE optimization, not useful for assistant)
                  const { routeHandle, ...routeRest } = route;

                  if (routeRest.sections) {
                    routeRest.sections = routeRest.sections.map(
                      (section: any, idx: number) => {
                        // Strip HERE-specific fields from each section
                        const {
                          polyline,
                          spans,
                          refReplacements,
                          ...sectionRest
                        } = section;

                        // Keep actions only for the first section (navigation preview for demo)
                        // For subsequent sections, remove actions to save tokens
                        if (idx > 0 && sectionRest.actions) {
                          sectionRest.actions = sectionRest.actions.slice(0, 3);
                        }

                        return sectionRest;
                      },
                    );
                  }

                  return routeRest;
                });
              }

              // locations, summary, waypoints are kept as-is (critical for assistant)
              return cleaned;
            };

            const originCoords =
              formatCoords(params.origin) ||
              formatCoords(params.origin_coords) ||
              currentLocationRef.current;
            const destinationCoords =
              formatCoords(params.destination) ||
              formatCoords(params.destination_coords) ||
              "";

            // 1. Prepare Query Params for Electrip Backend
            const baseUrl =
              "https://electrip-backend.electripglobal.com/v1.0/geo";
            const paramsObj: Record<string, string> = {
              vehicle: "599", // Demo ID
              origin: originCoords || "0,0",
              destination: destinationCoords || "",
              min: "10",
              max: "90",
              started: String(
                params.started ||
                  params.started_battery ||
                  params.start_battery_percent ||
                  "60",
              ),
              charge: "AC;DC",
              mode: "normal",
              destination_charge: String(
                params.destination_charge ||
                  params.target_battery ||
                  params.destination_battery_target ||
                  "20",
              ),
              origin_label: "Konumunuz",
              origin_name: "Konumunuz",
              destination_label: String(
                params.destination_label || params.destination_label_text || "",
              ),
              destination_name: String(
                params.destination_name || params.destination_name_text || "",
              ),
              passengers: "0",
              lang: "tr-TR",
              datetime: String(
                params.datetime || Math.floor(Date.now() / 1000).toString(),
              ),
            };

            console.log(
              "[useDrivingAgent] 📝 Query Params:",
              JSON.stringify(paramsObj, null, 2),
            );
            const queryParams = new URLSearchParams(paramsObj);

            // Set a timeout for the fetch to avoid ElevenLabs timing out on us
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            try {
              const url = `${baseUrl}?${queryParams.toString()}`;
              console.log("[useDrivingAgent] 🌐 Fetching Electrip Route:", url);

              const response = await fetch(url, { signal: controller.signal });
              clearTimeout(timeoutId);

              const data = await response.json();
              const fetchDuration = Date.now() - startTime;
              console.log(
                `[useDrivingAgent] ✅ Electrip Backend responded in ${fetchDuration}ms`,
              );

              if (
                data.success &&
                data.data?.routes?.[0]?.sections?.length > 0
              ) {
                const firstRoute = data.data.routes[0];
                const sections = firstRoute.sections;

                // Extract points for Google Directions high-fidelity plotting
                const firstSection = sections[0];
                const lastSection = sections[sections.length - 1];

                if (
                  !firstSection?.departure?.place?.location ||
                  !lastSection?.arrival?.place?.location
                ) {
                  console.error(
                    "[useDrivingAgent] ❌ Route missing location data",
                  );
                  return JSON.stringify({
                    success: false,
                    error: "Rota verisi eksik.",
                  });
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
                    stops.push({
                      latitude: stopLoc.lat,
                      longitude: stopLoc.lng,
                    });
                  }
                }

                // 1. Initial Synchronous Session Start (no polyline yet)
                // This ensures DriveSessionStore.context exists for setRoutePlanData and map fitting.
                const initialRoutePayload = {
                  origin: routeOrigin,
                  destination: routeDestination,
                  stops,
                  // Use a straight line as placeholder or leave empty for now
                  polyline: [routeOrigin, ...stops, routeDestination],
                  summary: { duration: 0, distance: 0 },
                };

                if (!DriveSessionStore.getContext()) {
                  DriveSessionStore.startSession(initialRoutePayload);
                } else {
                  DriveSessionStore.setRouteFromFrontend(initialRoutePayload);
                }

                // 2. Background High-Fidelity Polyline Fetch (Google Directions)
                fetchDirections(
                  routeOrigin,
                  routeDestination,
                  stops,
                  GOOGLE_MAPS_API_KEY || "",
                )
                  .then((result) => {
                    if (result && result.points.length > 0) {
                      const routePayload = {
                        origin: routeOrigin,
                        destination: routeDestination,
                        stops,
                        polyline: result.points,
                        summary: {
                          duration: result.duration,
                          distance: result.distance,
                        },
                      };

                      // Update the existing session with high-fidelity road-snapped polyline
                      DriveSessionStore.setRouteFromFrontend(routePayload);
                      console.log(
                        "[useDrivingAgent] ✅ Route successfully snapped to road via Google Directions.",
                      );
                    } else {
                      console.warn(
                        "[useDrivingAgent] ⚠️ fetchDirections returned no points.",
                      );
                    }
                  })
                  .catch((err) => {
                    console.error(
                      "[useDrivingAgent] ❌ fetchDirections background error:",
                      err,
                    );
                  });

                // Clean the backend response for the assistant:
                // - Strips HERE-specific optimization fields (routeHandle, polyline, spans, refReplacements)
                // - Keeps actions (first section full, others trimmed), locations, summary, waypoints
                const cleanedData = cleanBackendResponse(data.data);

                // Store the full route plan data in the session store for the RoutePlanSheet UI
                // This will now succeed because context was created synchronously above.
                if (cleanedData.locations && cleanedData.summary) {
                  DriveSessionStore.setRoutePlanData(cleanedData);
                }

                const agentResponse = JSON.stringify({
                  success: true,
                  ...cleanedData,
                });
                console.log(
                  "[useDrivingAgent] 📤 Agent response length:",
                  agentResponse.length,
                  "chars",
                );

                // Reset state to active once plan is successfully processed
                DriveSessionStore.setAiState(
                  DriveSessionState.CAR_SESSION_ACTIVE,
                );
                return agentResponse;
              } else {
                console.error(
                  "[useDrivingAgent] ❌ Electrip Backend failed or returned no routes:",
                  data,
                );
                return JSON.stringify({
                  success: false,
                  error: "Rota hesaplanamadı. Hedefi kontrol edin.",
                });
              }
            } catch (error: any) {
              clearTimeout(timeoutId);
              if (error.name === "AbortError") {
                console.error(
                  "[useDrivingAgent] ❌ create_route_plan timed out",
                );
                return JSON.stringify({
                  success: false,
                  error: "Rota servisi yanıt vermedi (Timeout).",
                });
              }
              console.error(
                "[useDrivingAgent] ❌ create_route_plan error:",
                error,
              );
              return JSON.stringify({
                success: false,
                error: "Sistem hatası: Rota servislerine ulaşılamıyor.",
              });
            } finally {
              // Ensure we don't get stuck in planning state if something goes wrong
              const currentState = DriveSessionStore.getState();
              if (currentState === DriveSessionState.PLANNING_ROUTE) {
                DriveSessionStore.setAiState(DriveSessionState.AI_LISTENING);
              }
            }
          },
        },

        onConnect: (props: any) => {
          console.log("[useDrivingAgent] ✅ Connected!", JSON.stringify(props));
          reconnectAttemptsRef.current = 0; // Reset reconnect counter on successful connect
        },
        onDisconnect: (details: DisconnectionDetails) => {
          console.log(
            "[useDrivingAgent] ❌ Disconnected",
            "reason:",
            details?.reason,
          );
          const hasRoute = !!DriveSessionStore.getRoutePlanData();

          // Mark session as ended
          sessionStartedRef.current = false;

          // Once a route exists, Atlas voice should stay passive until the user
          // explicitly taps the orb again. This avoids unexpected reconnects.
          if (
            details?.reason === "agent" ||
            details?.reason === "user" ||
            hasRoute
          ) {
            blockAutoVoiceRestartRef.current = true;
          }

          // As requested, always set to NAVIGATION_ONLY (if route exists) or IDLE on disconnect
          DriveSessionStore.setAiState(
            hasRoute
              ? DriveSessionState.NAVIGATION_ONLY
              : DriveSessionState.IDLE,
          );
          console.log("[useDrivingAgent] AI is now PASSIVE.");
        },
        onError: (error: any) => {
          console.error("[useDrivingAgent] ⚠️ Error:", error);
          DriveSessionStore.setAiState(DriveSessionState.AI_ERROR);
        },

        // --- Tool Call Callbacks ---
        // Fires when the agent initiates a tool call (e.g. create_route_plan)
        onAgentToolRequest: (request) => {
          console.log("[Atlas Tool Request]", JSON.stringify(request, null, 2));

          const newCall: AgentToolCall = {
            toolName: request.tool_name,
            toolCallId: request.tool_call_id,
            toolType: request.tool_type,
            status: "pending",
            requestedAt: Date.now(),
          };
          setToolCalls((prev) => [...prev, newCall]);
          setLastToolEvent(newCall);
        },

        // Fires when the tool returns a result to the agent
        onAgentToolResponse: (response) => {
          console.log(
            "[Atlas Tool Response]",
            JSON.stringify(response, null, 2),
          );
          setToolCalls((prev) =>
            prev.map((tc) =>
              tc.toolCallId === response.tool_call_id
                ? {
                    ...tc,
                    status: response.is_error ? "error" : "success",
                    respondedAt: Date.now(),
                  }
                : tc,
            ),
          );
          setLastToolEvent((prev) => {
            if (prev?.toolCallId === response.tool_call_id) {
              return {
                ...prev,
                status: response.is_error ? "error" : "success",
                respondedAt: Date.now(),
              } as AgentToolCall;
            }
            return prev;
          });

          if (
            response.tool_name === "end_call" &&
            !response.is_error &&
            sessionStartedRef.current
          ) {
            void stopVoiceSessionPreservingDrive();
          }
        },

        onMessage: (message) => {
          const event = message as Record<string, any>;
          const eventType = event?.type;

          if (eventType === "agent_tool_request" && event.agent_tool_request) {
            console.log(
              "[Atlas Tool Full Request Body]",
              JSON.stringify(event.agent_tool_request, null, 2),
            );
          }
        },
      });

      sessionStartedRef.current = true;
      manuallyEndedRef.current = false;
      console.log("[useDrivingAgent] Session started successfully");

      // 4. Connect WebSocket for route events
      socketService.connect(user?.id?.toString() || "guest-user");
    } catch (error) {
      console.error("[useDrivingAgent] Failed to start agent session:", error);
      DriveSessionStore.setAiState(DriveSessionState.AI_ERROR);
    }
  }, [
    conversation,
    user,
    charging.batteryLevel,
    stopVoiceSessionPreservingDrive,
  ]);

  const [audioLevel, setAudioLevel] = useState(0);

  // Sync SDK status to DriveSessionStore
  useEffect(() => {
    // Current AI state from the store
    const currentAiState = DriveSessionStore.getState();
    const hasRoute = !!DriveSessionStore.getRoutePlanData();

    if (conversation.status === "connected") {
      // Don't override special states (Planning or Confirmed End)
      // with generic listening/speaking states.
      if (
        currentAiState === DriveSessionState.PLANNING_ROUTE ||
        currentAiState === DriveSessionState.ENDING_DRIVE_CONFIRMATION
      ) {
        return;
      }

      // Sync the conversation state (speaking vs listening)
      const targetState = conversation.isSpeaking
        ? DriveSessionState.AI_SPEAKING
        : DriveSessionState.AI_LISTENING;

      if (currentAiState !== targetState) {
        DriveSessionStore.setAiState(targetState);
      }
    } else if (conversation.status === "connecting") {
      if (
        !blockAutoVoiceRestartRef.current &&
        currentAiState !== DriveSessionState.PLANNING_ROUTE &&
        currentAiState !== DriveSessionState.ENDING_DRIVE_CONFIRMATION &&
        currentAiState !== DriveSessionState.AI_CONNECTING
      ) {
        DriveSessionStore.setAiState(DriveSessionState.AI_CONNECTING);
      }
    } else if (conversation.status === "error") {
      if (hasRoute) {
        setPassiveDriveState();
      } else if (currentAiState !== DriveSessionState.AI_ERROR) {
        DriveSessionStore.setAiState(DriveSessionState.AI_ERROR);
      }
    } else if (conversation.status === "disconnected") {
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
  }, [
    conversation.status,
    conversation.isSpeaking,
    setPassiveDriveState,
  ]);

  // Auto-reconnect when WebRTC drops unexpectedly while still in CAR mode
  useEffect(() => {
    const hasRoute = !!DriveSessionStore.getRoutePlanData();

    if (hasRoute) {
      reconnectAttemptsRef.current = 0;
      return () => {
        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      };
    }

    if (
      conversation.status === "disconnected" &&
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
          `[useDrivingAgent] ❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping session completely.`,
        );
        stopAgentSession();
      }
    }
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [conversation.status, activity, startAgentSession, stopAgentSession]);

  // Poll audio level for visualizer
  useEffect(() => {
    if (conversation.status === "connected") {
      const interval = setInterval(() => {
        setAudioLevel(conversation.getOutputVolume());
      }, 500); // Changed from 50ms to 500ms to prevent JS thread blockage
      return () => clearInterval(interval);
    } else {
      setAudioLevel(0);
    }
  }, [conversation.status, conversation]);

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
    status: conversation.status,
    isSpeaking: conversation.isSpeaking,
    audioLevel,
    toolCalls,
    lastToolEvent,
    startSession: startAgentSession,
    stopSession: stopAgentSession,
  };
}
