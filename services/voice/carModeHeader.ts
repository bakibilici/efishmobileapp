/**
 * What the car-mode header's text row says, and in which order the states win.
 * Pure, so every state's copy can be checked without a device
 * (scripts/voice/check-voice-helpers.ts); CarModeView renders the result.
 *
 * Work in progress and errors come first. When there is neither, the row is
 * never empty: the trip when there is one, otherwise one calm line that says
 * what the driver can do now.
 */

export const HEADER_COPY = {
  connecting: "Bağlanıyor…",
  thinking: "Düşünüyor…",
  planning: "Rota planlanıyor…",
  geocoding: "Adresi arıyor…",
  offline: "Bağlantı koptu",
  offlineDetail: "Tekrar bağlanmak için orb'a dokunun.",
  routePlanFailed: "Rota hesaplanamadı",
  /** AKBA is live and nothing is planned yet. */
  ask: "Nereye gidiyoruz?",
  /** Passive, the phone listens for its name. */
  wake: "“AKBA” de, dinleyeyim",
  /** Passive, no wake word: tapping the orb connects. */
  tap: "Konuşmak için AKBA'ya dokun",
} as const;

/**
 * The line while AKBA runs a tool, keyed by the tool names useDrivingAgent
 * reports (only tools the agent sends tool events for). A tool without a line
 * here (an instant one such as setBatteryPercent) leaves the header to the
 * agent's own "thinking" state.
 */
export const TOOL_STATUS_COPY: Record<string, string> = {
  create_route_plan: HEADER_COPY.planning,
  geocodeDestination: HEADER_COPY.geocoding,
};

/** How long "Rota hesaplanamadı" stays before the row goes back to its fallback. */
export const ROUTE_PLAN_FAILED_LINE_MS = 5000;

export type HeaderPrompt = "ask" | "wake" | "tap";

export type HeaderLine =
  /** Work in progress: pulsing dot and the line. */
  | { kind: "busy"; text: string }
  /** The voice connection is gone. */
  | { kind: "offline" }
  /** The latest route plan failed; shown for ROUTE_PLAN_FAILED_LINE_MS. */
  | { kind: "failed" }
  /** Nothing going on and no trip: one line saying what the driver can do. */
  | { kind: "prompt"; prompt: HeaderPrompt }
  /** Nothing going on: the trip summary is the line. */
  | { kind: "trip" };

export interface HeaderInput {
  status: "disconnected" | "connecting" | "connected" | "error";
  /** lk.agent.state, null while no agent is in the room. */
  agentState: string | null;
  /** The line of the newest pending tool with one (TOOL_STATUS_COPY), else null. */
  pendingToolText: string | null;
  /** The drive is in PLANNING_ROUTE. */
  planning: boolean;
  /** The drive is in AI_ERROR. */
  aiError: boolean;
  /** The drive is in AI_CONNECTING. */
  aiConnecting: boolean;
  hasRoute: boolean;
  /** The voice connected at least once during this drive. */
  hasEverConnected: boolean;
  wakeWordArmed: boolean;
  /** AKBA has been thinking long enough to say so. */
  thinking: boolean;
  /** A route plan failed within the last ROUTE_PLAN_FAILED_LINE_MS. */
  routePlanFailed: boolean;
}

export function resolveHeaderLine(input: HeaderInput): HeaderLine {
  const { status, hasRoute } = input;
  const transportActive = status === "connected" || status === "connecting";
  // A call left pending by a dropped session is not work in progress.
  if (status === "connected" && input.pendingToolText) {
    return { kind: "busy", text: input.pendingToolText };
  }
  if (input.planning) return { kind: "busy", text: HEADER_COPY.planning };
  // Passive and listening for "AKBA": an ordinary state, not a broken
  // connection. With a trip on screen the trip is enough.
  if (input.wakeWordArmed && !transportActive) {
    return hasRoute ? { kind: "trip" } : { kind: "prompt", prompt: "wake" };
  }
  if (
    input.aiError ||
    (!hasRoute && (status === "error" || (status === "disconnected" && input.hasEverConnected)))
  ) {
    return { kind: "offline" };
  }
  // Until the agent has joined and set itself up, AKBA cannot hear anyone.
  // A room left without an agent turns into "offline" after 15 s
  // (useDrivingAgent), so this cannot pulse forever.
  if (
    status === "connecting" ||
    input.aiConnecting ||
    (status === "connected" && (input.agentState === null || input.agentState === "initializing"))
  ) {
    return { kind: "busy", text: HEADER_COPY.connecting };
  }
  if (input.routePlanFailed) return { kind: "failed" };
  if (input.thinking) return { kind: "busy", text: HEADER_COPY.thinking };
  if (hasRoute) return { kind: "trip" };
  if (status === "connected") return { kind: "prompt", prompt: "ask" };
  return { kind: "prompt", prompt: input.wakeWordArmed ? "wake" : "tap" };
}

/** How much longer the "Rota hesaplanamadı" line stays (0: gone). */
export function routePlanFailedLineRemainingMs(failedAt: number | null, now: number): number {
  if (failedAt === null) return 0;
  return Math.max(0, failedAt + ROUTE_PLAN_FAILED_LINE_MS - now);
}
