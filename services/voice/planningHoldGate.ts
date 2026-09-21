/**
 * When the route-planning hold music may play. Pure, so the rule can be
 * checked without a device (scripts/voice/check-voice-helpers.ts).
 *
 * The music fills the wait while a route is planned, and never talks over
 * AKBA: it plays only while a plan is pending and AKBA is not speaking. After
 * the plan starts it waits for AKBA's interim sentence ("Rotanı hazırlıyorum…")
 * to end, or starts anyway when AKBA says nothing for a while. When AKBA
 * speaks again mid-plan the music stops and comes back once AKBA is quiet.
 *
 * Only speech that ends in "listening" is finished: that is how the agent's
 * say() of the interim sentence ends. Speech that ends in "thinking" (the
 * model's own words before it called the tool) is a gap before more speech,
 * so the music keeps waiting for that, up to HOLD_NO_SPEECH_MS.
 */

/** Quiet this long after AKBA finished speaking before the music comes. */
export const HOLD_QUIET_MS = 250;
/**
 * With no finished sentence, the music starts this long after the plan did
 * (or after AKBA stopped speaking into "thinking"). The interim sentence
 * follows tool_start at once, but its first audio can take a few seconds.
 */
export const HOLD_NO_SPEECH_MS = 4000;

/** "off": nothing loaded. "ready": loaded and silent. "playing": audible. */
export type HoldSoundMode = "off" | "ready" | "playing";

/**
 * AKBA's lk.agent.state as useDrivingAgent reports it ("listening",
 * "thinking", "speaking", ...), null while no agent is in the room. A string,
 * so this file stays free of the hook's imports.
 */
export type HoldGateAgentState = string | null;

export interface HoldGateState {
  /** A route plan is running: tool_start seen, no tool_end, watchdog or disconnect since. */
  planPending: boolean;
  /** When the pending plan started (ms). */
  planStartedAt: number;
  /** AKBA's state right now. */
  agentState: HoldGateAgentState;
  /** AKBA spoke at some point since the pending plan started. */
  spokeSincePlanStart: boolean;
  /** When AKBA last stopped speaking (ms); null while it speaks or before it ever did. */
  quietSince: number | null;
  /**
   * AKBA reached "listening" since it last stopped speaking: its turn is
   * over, not a gap between two parts of it. Stays true until it speaks again.
   */
  quietSettled: boolean;
}

export type HoldGateEvent =
  | { type: "plan_start"; at: number }
  | { type: "plan_end" }
  | { type: "agent_state"; state: HoldGateAgentState; at: number };

export const INITIAL_HOLD_GATE: HoldGateState = {
  planPending: false,
  planStartedAt: 0,
  agentState: null,
  spokeSincePlanStart: false,
  quietSince: null,
  quietSettled: false,
};

export function reduceHoldGate(state: HoldGateState, event: HoldGateEvent): HoldGateState {
  switch (event.type) {
    case "plan_start":
      // AKBA already speaking when the tool starts is the interim sentence
      // (or the words before it, which end in "thinking").
      return {
        ...state,
        planPending: true,
        planStartedAt: event.at,
        spokeSincePlanStart: state.agentState === "speaking",
      };
    case "plan_end":
      return { ...state, planPending: false, spokeSincePlanStart: false };
    case "agent_state": {
      if (event.state === state.agentState) return state;
      const wasSpeaking = state.agentState === "speaking";
      if (event.state === "speaking") {
        return {
          ...state,
          agentState: event.state,
          quietSince: null,
          quietSettled: false,
          spokeSincePlanStart: state.planPending || state.spokeSincePlanStart,
        };
      }
      return {
        ...state,
        agentState: event.state,
        quietSince: wasSpeaking ? event.at : state.quietSince,
        // Once settled, a later "thinking" (the driver talking mid-plan) does
        // not take the music away; AKBA speaking does.
        quietSettled:
          (wasSpeaking ? false : state.quietSettled) || event.state === "listening",
      };
    }
  }
}

/**
 * What the hold sound should be doing at `now`, and when to ask again because
 * the answer changes by itself (the quiet debounce or the no-speech wait ends).
 */
export function holdGateDecision(
  state: HoldGateState,
  now: number,
): { mode: HoldSoundMode; recheckInMs: number | null } {
  if (!state.planPending) return { mode: "off", recheckInMs: null };
  // Loaded, so it can come in the moment AKBA stops.
  if (state.agentState === "speaking") return { mode: "ready", recheckInMs: null };
  let opensAt: number;
  if (!state.spokeSincePlanStart || state.quietSince === null) {
    opensAt = state.planStartedAt + HOLD_NO_SPEECH_MS;
  } else if (state.quietSettled) {
    opensAt = state.quietSince + HOLD_QUIET_MS;
  } else {
    // Stopped speaking into "thinking": more speech is on its way.
    opensAt = state.quietSince + HOLD_NO_SPEECH_MS;
  }
  const wait = opensAt - now;
  return wait > 0
    ? { mode: "ready", recheckInMs: wait }
    : { mode: "playing", recheckInMs: null };
}
