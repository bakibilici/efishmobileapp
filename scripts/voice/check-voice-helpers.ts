/**
 * Asserts the pure helpers behind the wake word, the car-mode header, the
 * route-planning hold music and the break exclusions.
 * The repo has no test runner installed, so this runs under tsx:
 *
 *   npx tsx scripts/voice/check-voice-helpers.ts
 */
import assert from "node:assert/strict";
import { PREDEFINED_USER_INTERESTS } from "../../constants/userInterests";
import {
  BreakExclusions,
  excludedBreaksPrefKey,
  parseStoredBreakKinds,
} from "../../services/breakExclusions";
import type {
  RoutePlanData,
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../../services/DriveSessionStore";
import {
  alternativeKind,
  BREAK_KINDS,
  highlightKind,
  keptAlternatives,
  normalizeBreakKinds,
  personalizeRoutePlan,
  templateKind,
  updateInterestChips,
} from "../../services/routePersonalization";
import {
  describeUnusableLocales,
  isLocaleRefusal,
  matchInstalledLocale,
  normalizeLocaleTag,
  wakeWordLocaleCandidates,
} from "../../services/voice/wakeWordLocales";
import { foldTurkish, matchesWakeWord } from "../../services/voice/wakeWordMatcher";
import {
  HEADER_COPY,
  resolveHeaderLine,
  ROUTE_PLAN_FAILED_LINE_MS,
  routePlanFailedLineRemainingMs,
  TOOL_STATUS_COPY,
  type HeaderInput,
} from "../../services/voice/carModeHeader";
import {
  HOLD_NO_SPEECH_MS,
  HOLD_QUIET_MS,
  holdGateDecision,
  INITIAL_HOLD_GATE,
  reduceHoldGate,
  type HoldGateEvent,
  type HoldGateState,
} from "../../services/voice/planningHoldGate";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

// ── Wake word ─────────────────────────────────────────────────────────────
check("folds Turkish letters after tr-TR lower-casing", () => {
  assert.equal(foldTurkish("AĞBA"), "agba");
  assert.equal(foldTurkish("İBADET"), "ibadet");
  assert.equal(foldTurkish("IŞIK"), "isik");
  // "i" + combining dot, as a runtime without Turkish rules would produce.
  assert.equal(foldTurkish("i̇badet"), "ibadet");
});

check("matches the spellings the recognizer produces", () => {
  for (const heard of [
    "Electrip",
    "electrip",
    "Elektrip",
    "elektrip",
    "elektirip",
    "ilektrip",
    "hey Electrip nereye gidiyoruz",
    "Electrip'e sor",
    "Electrip, şarj istasyonu bul",
    "elek trip",
    "AKBA",
    "Akba",
    "akba",
    "akpa",
    "Ağba",
    "akbaa",
    "Hakba",
    "ak ba",
    "Ak Ba",
    "hey Akba nereye gidiyoruz",
    "Akba'ya sor",
    "Akba, şarj istasyonu bul",
    " akba ",
  ]) {
    assert.equal(matchesWakeWord(heard), true, heard);
  }
});

check("ignores words that only contain the sound", () => {
  for (const heard of [
    "",
    "elektrik",
    "elektrikli",
    "elektronik",
    "trip",
    "elek",
    "akbaba",
    "Akbank",
    "Akbay",
    "akbar",
    "ak parti",
    "ak baba",
    "kaba",
    "abla",
    "bak bakalım",
    "araba",
  ]) {
    assert.equal(matchesWakeWord(heard), false, heard);
  }
});

check("matches what an English recognizer writes for AKBA", () => {
  for (const heard of [
    "akbah",
    "Akbah",
    "acba",
    "ACBA",
    "aqba",
    "Aqba?",
    "ak ba",
    "ack ba",
    "Ack Ba",
    "ak bah",
    "hey Akbah find a charger",
    "Acba, where is the next station",
    "okay aqba",
  ]) {
    assert.equal(matchesWakeWord(heard), true, heard);
  }
});

check("English words near the sound stay asleep", () => {
  for (const heard of [
    "akbar",
    "Allahu Akbar",
    "Ackbar",
    "ack bar",
    "ak bar",
    "Akbank",
    "akbaba",
    "abba",
    "ABBA is playing",
    "acapella",
    "a cappella",
    "Aqaba",
    "back bar",
    "turn the AC back on",
    "a cab a",
  ]) {
    assert.equal(matchesWakeWord(heard), false, heard);
  }
});

// ── Wake-word locale ──────────────────────────────────────────────────────
check("locale tags are normalised to language-REGION", () => {
  assert.equal(normalizeLocaleTag("en-US"), "en-US");
  assert.equal(normalizeLocaleTag("en_us"), "en-US");
  assert.equal(normalizeLocaleTag("TR-tr"), "tr-TR");
  assert.equal(normalizeLocaleTag("zh-Hans-CN"), "zh-CN");
  assert.equal(normalizeLocaleTag("es-419"), "es-419");
  assert.equal(normalizeLocaleTag("en-US-u-ca-gregory"), "en-US");
  assert.equal(normalizeLocaleTag("en-u-ca-gregory"), null);
  assert.equal(normalizeLocaleTag("en"), null);
  assert.equal(normalizeLocaleTag(""), null);
});

check("candidates: tr-TR, then the phone's tr/en tags, then en-US, each once", () => {
  assert.deepEqual(wakeWordLocaleCandidates([]), ["tr-TR", "en-US"]);
  assert.deepEqual(wakeWordLocaleCandidates(["tr-TR"]), ["tr-TR", "en-US"]);
  assert.deepEqual(wakeWordLocaleCandidates(["en-US", "tr-TR"]), ["tr-TR", "en-US"]);
  // An English phone set to the Turkey region.
  assert.deepEqual(wakeWordLocaleCandidates(["en-TR"]), ["tr-TR", "en-TR", "en-US"]);
  assert.deepEqual(
    wakeWordLocaleCandidates(["en-GB", "de_AT", "en", "zh-Hans-CN", "en-gb"]),
    ["tr-TR", "en-GB", "en-US"],
  );
  // Another script's recognizer writes AKBA in that script: never tried.
  assert.deepEqual(wakeWordLocaleCandidates(["ru-RU"]), ["tr-TR", "en-US"]);
  assert.deepEqual(wakeWordLocaleCandidates(["ja-JP", "en-GB"]), ["tr-TR", "en-GB", "en-US"]);
  assert.deepEqual(
    wakeWordLocaleCandidates(["ar-SA", "el-GR", "he-IL", "uk-UA", "th-TH", "ko-KR", "zh-CN"]),
    ["tr-TR", "en-US"],
  );
  // Turkish tags come before English ones.
  assert.deepEqual(
    wakeWordLocaleCandidates(["en-GB", "tr-CY"]),
    ["tr-TR", "tr-CY", "en-GB", "en-US"],
  );
});

check("Android picks an installed on-device model for a candidate", () => {
  assert.equal(matchInstalledLocale("tr-TR", ["en-US", "tr-TR"]), "tr-TR");
  assert.equal(matchInstalledLocale("tr-TR", ["tr_TR"]), "tr-TR");
  assert.equal(matchInstalledLocale("tr-TR", ["tr"]), "tr-TR");
  // Another region of the same language is the model the phone has.
  assert.equal(matchInstalledLocale("en-GB", ["en-US"]), "en-US");
  assert.equal(matchInstalledLocale("tr-TR", ["en-US", "de-DE"]), null);
  assert.equal(matchInstalledLocale("en-US", []), null);
});

check("a language is ruled out only when its recognizer refused it", () => {
  const firstQuickSilent = { first: true, quick: true, hadResult: false };
  assert.equal(isLocaleRefusal("language-not-supported", firstQuickSilent), true);
  assert.equal(
    isLocaleRefusal("language-not-supported", { first: false, quick: false, hadResult: true }),
    true,
  );
  // A missing iOS model: "Assets are not installed" (102) or 1101.
  assert.equal(isLocaleRefusal("service-not-allowed", firstQuickSilent), true);
  assert.equal(isLocaleRefusal("network", firstQuickSilent), true);
  // Not the first run, not quick, or the recognizer produced a result: a real error.
  for (const error of ["service-not-allowed", "network"]) {
    assert.equal(isLocaleRefusal(error, { ...firstQuickSilent, first: false }), false, error);
    assert.equal(isLocaleRefusal(error, { ...firstQuickSilent, quick: false }), false, error);
    assert.equal(isLocaleRefusal(error, { ...firstQuickSilent, hadResult: true }), false, error);
  }
  // A permission denial is never a language problem.
  assert.equal(isLocaleRefusal("not-allowed", firstQuickSilent), false);
  assert.equal(isLocaleRefusal("no-speech", firstQuickSilent), false);
  assert.equal(isLocaleRefusal("audio-capture", firstQuickSilent), false);
});

check("the reason names every locale that could not be used", () => {
  assert.equal(
    describeUnusableLocales(["tr-TR", "en-US"], []),
    "no on-device recognizer for tr-TR, en-US",
  );
  assert.equal(
    describeUnusableLocales(["tr-TR"], ["en-US"]),
    "no on-device recognizer for tr-TR; speech recognizer unavailable for en-US",
  );
});

// ── Car-mode header ───────────────────────────────────────────────────────
const header = (overrides: Partial<HeaderInput> = {}) =>
  resolveHeaderLine({
    status: "connected",
    agentState: "listening",
    pendingToolText: null,
    planning: false,
    aiError: false,
    aiConnecting: false,
    hasRoute: false,
    hasEverConnected: true,
    conversationEnded: false,
    wakeWordArmed: false,
    thinking: false,
    routePlanFailed: false,
    ...overrides,
  });

check("the fallback copy is one calm line per state", () => {
  assert.equal(HEADER_COPY.ask, "Nereye gidiyoruz?");
  assert.equal(HEADER_COPY.wake, "“Electrip” diyerek uyandır");
  assert.equal(HEADER_COPY.tap, "Konuşmak için Electrip'e dokun");
  assert.equal(HEADER_COPY.routePlanFailed, "Rota hesaplanamadı");
  for (const line of [HEADER_COPY.ask, HEADER_COPY.wake, HEADER_COPY.tap]) {
    assert.ok(!line.includes("\n"), line);
    assert.notEqual(line, line.toLocaleUpperCase("tr-TR"), line);
  }
});

check("live with no route and no work asks where to", () => {
  for (const agentState of ["listening", "speaking", "idle"]) {
    assert.deepEqual(header({ agentState }), { kind: "prompt", prompt: "ask" }, agentState);
  }
  // A "thinking" too short to be shown yet does not empty the row either.
  assert.deepEqual(header({ agentState: "thinking" }), { kind: "prompt", prompt: "ask" });
});

check("passive with no route says how to start talking", () => {
  const passive = { status: "disconnected" as const, agentState: null, hasEverConnected: false };
  assert.deepEqual(header(passive), { kind: "prompt", prompt: "tap" });
  assert.deepEqual(header({ ...passive, wakeWordArmed: true }), { kind: "prompt", prompt: "wake" });
  // Listening for its name is not a broken connection, even after one.
  assert.deepEqual(
    header({ ...passive, hasEverConnected: true, wakeWordArmed: true }),
    { kind: "prompt", prompt: "wake" },
  );
});

check("a conversation AKBA ended is not a lost connection", () => {
  // After its goodbye the voice is gone (disconnected, the wake word not yet
  // re-armed): the row says how to start again instead of "Bağlantı koptu".
  const ended = {
    status: "disconnected" as const,
    agentState: null,
    hasEverConnected: true,
    conversationEnded: true,
  };
  assert.deepEqual(header(ended), { kind: "prompt", prompt: "tap" });
  assert.deepEqual(header({ ...ended, wakeWordArmed: true }), {
    kind: "prompt",
    prompt: "wake",
  });
  // With a trip on screen the trip is the line, as anywhere else.
  assert.deepEqual(header({ ...ended, hasRoute: true }), { kind: "trip" });
  // Without it, that same end would have read as a broken connection.
  assert.deepEqual(header({ ...ended, conversationEnded: false }), { kind: "offline" });
  // A real failure still wins: the drive's error state is not hidden by it.
  assert.deepEqual(header({ ...ended, aiError: true }), { kind: "offline" });
  // And it says nothing about a connection that is up again.
  assert.deepEqual(
    header({ ...ended, conversationEnded: true, status: "connected", agentState: "listening" }),
    { kind: "prompt", prompt: "ask" },
  );
  assert.deepEqual(
    header({ ...ended, conversationEnded: true, status: "connecting" }),
    { kind: "busy", text: "Bağlanıyor…" },
  );
  // Why useDrivingAgent sets the status itself when the goodbye arrives
  // instead of waiting for the room to report the disconnect: the teardown
  // drops the agent state first, and a transport still called "connected"
  // with no agent behind it is this — "Bağlanıyor…", a flash of the state
  // the goodbye just ended.
  assert.deepEqual(
    header({ ...ended, status: "connected", agentState: null }),
    { kind: "busy", text: "Bağlanıyor…" },
  );
});

check("with a route the trip is the fallback, live or passive", () => {
  assert.deepEqual(header({ hasRoute: true }), { kind: "trip" });
  assert.deepEqual(header({ hasRoute: true, status: "disconnected", agentState: null }), {
    kind: "trip",
  });
  assert.deepEqual(
    header({ hasRoute: true, status: "disconnected", agentState: null, wakeWordArmed: true }),
    { kind: "trip" },
  );
});

check("work in progress and errors replace the fallback", () => {
  assert.deepEqual(header({ pendingToolText: TOOL_STATUS_COPY.create_route_plan }), {
    kind: "busy",
    text: "Rota planlanıyor…",
  });
  assert.deepEqual(header({ pendingToolText: TOOL_STATUS_COPY.geocodeDestination }), {
    kind: "busy",
    text: "Adresi arıyor…",
  });
  assert.deepEqual(header({ pendingToolText: TOOL_STATUS_COPY.findChargingStations }), {
    kind: "busy",
    text: "İstasyon arıyor…",
  });
  assert.deepEqual(header({ planning: true, hasRoute: true }), {
    kind: "busy",
    text: "Rota planlanıyor…",
  });
  assert.deepEqual(header({ thinking: true }), { kind: "busy", text: "Düşünüyor…" });
  assert.deepEqual(header({ status: "connecting", agentState: null }), {
    kind: "busy",
    text: "Bağlanıyor…",
  });
  assert.deepEqual(header({ agentState: "initializing" }), { kind: "busy", text: "Bağlanıyor…" });
  assert.deepEqual(header({ status: "error", agentState: null }), { kind: "offline" });
  assert.deepEqual(header({ status: "disconnected", agentState: null }), { kind: "offline" });
  assert.deepEqual(header({ aiError: true, hasRoute: true }), { kind: "offline" });
  // A pending call left by a dropped session is not work in progress.
  assert.deepEqual(
    header({
      status: "disconnected",
      agentState: null,
      hasEverConnected: false,
      pendingToolText: TOOL_STATUS_COPY.create_route_plan,
    }),
    { kind: "prompt", prompt: "tap" },
  );
});

check("a failed plan shows briefly, under real work and connection trouble", () => {
  assert.deepEqual(header({ routePlanFailed: true }), { kind: "failed" });
  assert.deepEqual(header({ routePlanFailed: true, hasRoute: true }), { kind: "failed" });
  assert.deepEqual(header({ routePlanFailed: true, agentState: "speaking" }), { kind: "failed" });
  // It says more than "Düşünüyor…" does.
  assert.deepEqual(header({ routePlanFailed: true, thinking: true }), { kind: "failed" });
  // A new plan, or a lost connection, is newer news.
  assert.deepEqual(header({ routePlanFailed: true, planning: true }).kind, "busy");
  assert.deepEqual(header({ routePlanFailed: true, status: "error", agentState: null }), {
    kind: "offline",
  });
});

check("the failed-plan line lasts about five seconds", () => {
  assert.equal(ROUTE_PLAN_FAILED_LINE_MS, 5000);
  assert.equal(routePlanFailedLineRemainingMs(null, 1000), 0);
  assert.equal(routePlanFailedLineRemainingMs(1000, 1000), 5000);
  assert.equal(routePlanFailedLineRemainingMs(1000, 4000), 2000);
  assert.equal(routePlanFailedLineRemainingMs(1000, 6000), 0);
  assert.equal(routePlanFailedLineRemainingMs(1000, 60000), 0);
});

// ── Route-planning hold music ─────────────────────────────────────────────
const gateAfter = (events: HoldGateEvent[], from: HoldGateState = INITIAL_HOLD_GATE) =>
  events.reduce(reduceHoldGate, from);
const agentState = (state: string | null, at: number): HoldGateEvent => ({
  type: "agent_state",
  state,
  at,
});
const speaking = (at: number) => agentState("speaking", at);
/** How say() ends: AKBA's turn is over. */
const listening = (at: number) => agentState("listening", at);
/** How the model's own words before a tool call end: more speech is coming. */
const thinking = (at: number) => agentState("thinking", at);
const planStart = (at: number): HoldGateEvent => ({ type: "plan_start", at });
const planEnd: HoldGateEvent = { type: "plan_end" };

check("no plan, no music", () => {
  assert.deepEqual(holdGateDecision(INITIAL_HOLD_GATE, 0), { mode: "off", recheckInMs: null });
  const talked = gateAfter([speaking(0), listening(1000)]);
  assert.equal(holdGateDecision(talked, 5000).mode, "off");
});

check("the no-speech wait is long enough for a slow first chunk", () => {
  assert.ok(HOLD_NO_SPEECH_MS >= 4000);
});

check("waits for the interim sentence, then starts after a short quiet", () => {
  // tool_start, then AKBA says "Rotanı hazırlıyorum, birkaç saniye lütfen."
  let gate = gateAfter([planStart(1000)]);
  assert.deepEqual(holdGateDecision(gate, 1000), {
    mode: "ready",
    recheckInMs: HOLD_NO_SPEECH_MS,
  });
  gate = gateAfter([speaking(1300)], gate);
  assert.deepEqual(holdGateDecision(gate, 1300), { mode: "ready", recheckInMs: null });
  // Past the no-speech wait, still talking: still silent.
  const endsAt = 1000 + HOLD_NO_SPEECH_MS + 1000;
  assert.equal(holdGateDecision(gate, endsAt - 1).mode, "ready");
  gate = gateAfter([listening(endsAt)], gate);
  assert.deepEqual(holdGateDecision(gate, endsAt), { mode: "ready", recheckInMs: HOLD_QUIET_MS });
  assert.deepEqual(holdGateDecision(gate, endsAt + HOLD_QUIET_MS), {
    mode: "playing",
    recheckInMs: null,
  });
});

check("already speaking at tool_start counts as the interim sentence", () => {
  let gate = gateAfter([speaking(900), planStart(1000)]);
  assert.equal(holdGateDecision(gate, 1000).mode, "ready");
  gate = gateAfter([listening(2000)], gate);
  assert.equal(holdGateDecision(gate, 2000 + HOLD_QUIET_MS - 1).mode, "ready");
  assert.equal(holdGateDecision(gate, 2000 + HOLD_QUIET_MS).mode, "playing");
});

check("the model's words before the interim sentence do not let the music in", () => {
  // "Tamam, bakıyorum." is still playing when tool_start arrives, ends in
  // "thinking", and the interim sentence follows after a realistic gap.
  for (const gap of [600, 1000, 1500]) {
    let gate = gateAfter([speaking(0), planStart(300), thinking(1200)]);
    // Where a plain quiet debounce would have opened, it keeps waiting.
    assert.deepEqual(holdGateDecision(gate, 1200 + HOLD_QUIET_MS), {
      mode: "ready",
      recheckInMs: HOLD_NO_SPEECH_MS - HOLD_QUIET_MS,
    });
    assert.equal(holdGateDecision(gate, 1200 + gap - 1).mode, "ready");
    gate = gateAfter([speaking(1200 + gap)], gate);
    assert.equal(holdGateDecision(gate, 1200 + gap + 100).mode, "ready");
    gate = gateAfter([listening(4200 + gap)], gate);
    assert.equal(holdGateDecision(gate, 4200 + gap + HOLD_QUIET_MS - 1).mode, "ready");
    assert.equal(holdGateDecision(gate, 4200 + gap + HOLD_QUIET_MS).mode, "playing");
  }
  // The same when the model's words start only after tool_start.
  for (const gap of [600, 1500]) {
    let gate = gateAfter([planStart(0), speaking(200), thinking(900)]);
    assert.equal(holdGateDecision(gate, 900 + gap - 1).mode, "ready");
    gate = gateAfter([speaking(900 + gap), listening(3500 + gap)], gate);
    assert.equal(holdGateDecision(gate, 3500 + gap + HOLD_QUIET_MS).mode, "playing");
  }
});

check("speech that ends in thinking with nothing after waits the no-speech time", () => {
  const gate = gateAfter([planStart(0), speaking(100), thinking(1000)]);
  assert.equal(holdGateDecision(gate, 1000 + HOLD_NO_SPEECH_MS - 1).mode, "ready");
  assert.equal(holdGateDecision(gate, 1000 + HOLD_NO_SPEECH_MS).mode, "playing");
});

check("thinking that ends in listening without more speech lets the music in", () => {
  let gate = gateAfter([planStart(0), speaking(100), thinking(1000)]);
  assert.equal(holdGateDecision(gate, 1800).mode, "ready");
  gate = gateAfter([listening(1800)], gate);
  // The quiet began at 1000, so the debounce is long over.
  assert.deepEqual(holdGateDecision(gate, 1800), { mode: "playing", recheckInMs: null });
});

check("a pause between two sentences does not let the music in", () => {
  let gate = gateAfter([planStart(0), speaking(100), listening(1000)]);
  assert.equal(holdGateDecision(gate, 1100).mode, "ready");
  gate = gateAfter([speaking(1150)], gate);
  assert.equal(holdGateDecision(gate, 1400).mode, "ready");
  gate = gateAfter([listening(3000)], gate);
  assert.equal(holdGateDecision(gate, 3000 + HOLD_QUIET_MS).mode, "playing");
});

check("starts on its own when AKBA says nothing", () => {
  // Speech that ended before the plan started is not the interim sentence.
  const gate = gateAfter([speaking(0), listening(500), planStart(1000)]);
  assert.deepEqual(holdGateDecision(gate, 1000 + HOLD_QUIET_MS), {
    mode: "ready",
    recheckInMs: HOLD_NO_SPEECH_MS - HOLD_QUIET_MS,
  });
  assert.equal(holdGateDecision(gate, 1000 + HOLD_NO_SPEECH_MS - 1).mode, "ready");
  assert.deepEqual(holdGateDecision(gate, 1000 + HOLD_NO_SPEECH_MS), {
    mode: "playing",
    recheckInMs: null,
  });
});

check("AKBA speaking mid-plan silences the music until it is quiet again", () => {
  let gate = gateAfter([planStart(0)]);
  const opened = HOLD_NO_SPEECH_MS;
  assert.equal(holdGateDecision(gate, opened).mode, "playing");
  gate = gateAfter([speaking(opened + 1000)], gate);
  assert.equal(holdGateDecision(gate, opened + 1000).mode, "ready");
  gate = gateAfter([listening(opened + 3000)], gate);
  assert.equal(holdGateDecision(gate, opened + 3100).mode, "ready");
  assert.equal(holdGateDecision(gate, opened + 3000 + HOLD_QUIET_MS).mode, "playing");
});

check("the driver talking mid-plan leaves the music on until AKBA answers", () => {
  let gate = gateAfter([planStart(0), speaking(100), listening(2000)]);
  assert.equal(holdGateDecision(gate, 3000).mode, "playing");
  // The driver says something: AKBA thinks about it, still silent.
  gate = gateAfter([thinking(3000)], gate);
  assert.equal(holdGateDecision(gate, 3500).mode, "playing");
  gate = gateAfter([speaking(3800)], gate);
  assert.equal(holdGateDecision(gate, 3800).mode, "ready");
});

check("the plan's end stops the music for good, even while AKBA is quiet", () => {
  let gate = gateAfter([planStart(0), speaking(100), listening(1000)]);
  assert.equal(holdGateDecision(gate, 2000).mode, "playing");
  gate = gateAfter([planEnd], gate);
  assert.deepEqual(holdGateDecision(gate, 2000), { mode: "off", recheckInMs: null });
  // AKBA reading out the result, then going quiet, brings nothing back.
  gate = gateAfter([speaking(2100), listening(5000)], gate);
  assert.equal(holdGateDecision(gate, 9000).mode, "off");
  // An agent that left (state null) is quiet, not a new plan.
  assert.equal(holdGateDecision(gateAfter([agentState(null, 9100)], gate), 9500).mode, "off");
});

check("a new plan starts a fresh wait", () => {
  let gate = gateAfter([planStart(0), speaking(100), listening(1000), planEnd]);
  gate = gateAfter([planStart(10000)], gate);
  // The earlier sentence does not count for this plan.
  assert.equal(holdGateDecision(gate, 10000 + HOLD_QUIET_MS).mode, "ready");
  assert.equal(holdGateDecision(gate, 10000 + HOLD_NO_SPEECH_MS).mode, "playing");
  // A replacement plan while one is pending waits again too.
  gate = gateAfter([planStart(20000), speaking(20050)], gate);
  assert.equal(holdGateDecision(gate, 20100).mode, "ready");
});

check("repeated states change nothing", () => {
  const gate = gateAfter([planStart(0), speaking(100)]);
  assert.equal(reduceHoldGate(gate, speaking(200)), gate);
  const silent = gateAfter([listening(300)], gate);
  assert.equal(reduceHoldGate(silent, listening(400)), silent);
  assert.equal(silent.quietSince, 300);
  // Moving between quiet states keeps when the quiet began.
  assert.equal(gateAfter([thinking(500), listening(900)], silent).quietSince, 300);
});

// ── Break exclusions ──────────────────────────────────────────────────────
check("normalizes the agent's excluded kinds", () => {
  assert.deepEqual(normalizeBreakKinds([" Food ", "coffee", "food", "nope", 3, null]), [
    "food",
    "coffee",
  ]);
  assert.deepEqual(normalizeBreakKinds("food"), []);
  assert.deepEqual(normalizeBreakKinds(undefined), []);
});

check("every local template has a kind from the agent's list", () => {
  const expected: Record<string, string> = {
    coffee: "coffee",
    meal: "food",
    dessert: "dessert",
    shopping: "shopping",
    view: "viewpoint",
    restroom: "restroom",
    worship: "worship",
    quiet: "park",
    walk: "park",
    family_kids: "park",
    family: "food",
    comfort: "coffee",
  };
  for (const [key, kind] of Object.entries(expected)) {
    assert.equal(templateKind(key), kind, key);
    assert.ok((BREAK_KINDS as readonly string[]).includes(kind));
  }
});

check("maps gateway highlights to kinds by key, then by POI category", () => {
  assert.equal(highlightKind({ interestKey: "food" }), "food");
  assert.equal(highlightKind({ interestKey: "family" }), "food");
  assert.equal(highlightKind({ interestKey: "scenic" }), "viewpoint");
  assert.equal(highlightKind({ interestKey: "walk" }), "park");
  assert.equal(highlightKind({ interestKey: "family_kids" }), "park");
  assert.equal(highlightKind({ interestKey: "", poiCategory: "mosque" }), "worship");
  assert.equal(highlightKind({ interestKey: "x", poiCategory: "restaurant" }), "food");
  assert.equal(highlightKind({ interestKey: "x", poiCategory: "y" }), null);
});

const station = (name: string): RoutePlanLocation => ({
  type: "station",
  name,
  coordinates: { lat: "0", lon: "0" },
  travel_duration: 0,
  travel_length: 0,
  battery_status: { from: 50, to: 80 },
});
const endpoint = (type: "origin" | "destination", name: string): RoutePlanLocation => ({
  ...station(name),
  type,
});
const plan = (extra: Partial<RoutePlanData> = {}): RoutePlanData =>
  ({
    locations: [endpoint("origin", "A"), station("S1"), station("S2"), endpoint("destination", "B")],
    ...extra,
  }) as RoutePlanData;
const kindsOf = (data: RoutePlanData) =>
  (data.interest_highlights ?? []).map((h) => templateKind(h.interestKey) ?? h.interestKey);

check("local fill skips excluded interests", () => {
  const result = personalizeRoutePlan(plan(), ["Yemek", "Kahve"], ["food"]);
  // Two stations: the coffee chip, then the comfort fallback (also a coffee kind).
  assert.deepEqual(kindsOf(result), ["coffee", "coffee"]);
  assert.ok(result.locations.every((l) => l.interest_highlight?.interestKey !== "meal"));
});

check("the fallback template is excluded too", () => {
  const result = personalizeRoutePlan(plan(), ["Yemek"], ["food", "coffee"]);
  assert.deepEqual(result.interest_highlights, []);
  assert.ok(result.locations.every((l) => !l.interest_highlight));
});

check("without exclusions the old behaviour holds", () => {
  const result = personalizeRoutePlan(plan(), ["Yemek"]);
  assert.deepEqual(
    (result.interest_highlights ?? []).map((h) => h.interestKey),
    ["meal", "comfort"],
  );
});

check("gateway highlights of an excluded kind are dropped", () => {
  const gateway = plan({
    interest_highlights: [
      { id: "1", interestKey: "food", interestLabel: "Yemek", icon: "restaurant-outline", shortLabel: "Yemek", title: "Yemek molası", message: "", stationName: "S1" },
      { id: "2", interestKey: "coffee", interestLabel: "Kahve", icon: "cafe-outline", shortLabel: "Kahve", title: "Kahve molası", message: "", stationName: "S2" },
    ],
    route_optimization_summary: "S1: Yemek molası | S2: Kahve molası",
  });
  const result = personalizeRoutePlan(gateway, ["Yemek", "Kahve"], ["food"]);
  assert.deepEqual((result.interest_highlights ?? []).map((h) => h.interestKey), ["coffee"]);
  assert.equal(result.route_optimization_summary, "S2: Kahve molası");
});

check("when every gateway highlight is excluded, the local fill honours the list", () => {
  const gateway = plan({
    interest_highlights: [
      { id: "1", interestKey: "food", interestLabel: "Yemek", icon: "restaurant-outline", shortLabel: "Yemek", title: "Yemek molası", message: "", stationName: "S1" },
    ],
  });
  const result = personalizeRoutePlan(gateway, ["Yemek", "İbadet alanı"], ["food"]);
  const keys = (result.interest_highlights ?? []).map((h) => h.interestKey);
  assert.ok(!keys.includes("food") && !keys.includes("meal"), keys.join(","));
  assert.ok(keys.includes("worship"), keys.join(","));
});

check("embedded station highlights of an excluded kind are dropped", () => {
  const embedded = plan();
  embedded.locations[1] = {
    ...embedded.locations[1],
    interest_highlight: { id: "1", interestKey: "worship", interestLabel: "", icon: "moon", shortLabel: "", title: "İbadet molası", message: "", stationName: "S1" },
  };
  const result = personalizeRoutePlan(embedded, [], ["worship"]);
  assert.ok(result.locations.every((l) => l.interest_highlight?.interestKey !== "worship"));
});

check("'Çocuk dostu mola' is the park template, 'Ailece rota' the family one", () => {
  const oneStation = (): RoutePlanData =>
    ({
      locations: [endpoint("origin", "A"), station("S1"), endpoint("destination", "B")],
    }) as RoutePlanData;
  const keyFor = (chip: string) =>
    personalizeRoutePlan(oneStation(), [chip]).interest_highlights?.[0]?.interestKey;
  assert.equal(keyFor("Çocuk dostu mola"), "family_kids");
  assert.equal(keyFor("Ailece rota"), "family");
  // Ruling out parks leaves no kids' suggestion; ruling out food leaves it.
  const noPark = personalizeRoutePlan(oneStation(), ["Çocuk dostu mola"], ["park", "coffee"]);
  assert.deepEqual(noPark.interest_highlights, []);
  const noFood = personalizeRoutePlan(oneStation(), ["Çocuk dostu mola"], ["food"]);
  assert.equal(noFood.interest_highlights?.[0]?.interestKey, "family_kids");
});

// ── Alternatives ──────────────────────────────────────────────────────────
const alt = (name: string, category: string): RoutePlanHighlightAlternative => ({
  name,
  category,
  title: name,
});
const withAlternatives = (
  id: string,
  interestKey: string,
  stationName: string,
  alternatives: RoutePlanHighlightAlternative[],
): RoutePlanInterestHighlight => ({
  id,
  interestKey,
  interestLabel: "",
  icon: "",
  shortLabel: "",
  title: `${interestKey} molası`,
  message: "",
  stationName,
  alternatives,
});

check("alternatives are kinded by the ranker's category, Places types too", () => {
  assert.equal(alternativeKind({ category: "food" }), "food");
  assert.equal(alternativeKind({ category: "park" }), "park");
  assert.equal(alternativeKind({ category: "restaurant" }), "food");
  assert.equal(alternativeKind({ category: "mosque" }), "worship");
  assert.equal(alternativeKind({ category: undefined }), null);
  assert.equal(alternativeKind({ category: "unknown" }), null);
});

check("keptAlternatives drops excluded kinds and keeps the array when nothing goes", () => {
  const list = [alt("Köfteci", "food"), alt("Park", "park"), alt("Bilinmez", "x")];
  assert.deepEqual(
    keptAlternatives(list, ["food"])?.map((a) => a.name),
    ["Park", "Bilinmez"],
  );
  assert.equal(keptAlternatives(list, ["sport"]), list);
  assert.equal(keptAlternatives(list, []), list);
  assert.equal(keptAlternatives(undefined, ["food"]), undefined);
});

check("a kept highlight loses its excluded alternatives, listed and embedded", () => {
  const listed = withAlternatives("1", "coffee", "S1", [
    alt("Köfteci", "food"),
    alt("Lokanta", "restaurant"),
    alt("Park", "park"),
  ]);
  const embedded = plan({
    interest_highlights: [listed],
    route_optimization_summary: "gateway summary",
  });
  embedded.locations[1] = { ...embedded.locations[1], interest_highlight: listed };
  const result = personalizeRoutePlan(embedded, ["Kahve"], ["food"]);
  assert.deepEqual(
    result.interest_highlights?.[0]?.alternatives?.map((a) => a.name),
    ["Park"],
  );
  assert.deepEqual(
    result.locations[1].interest_highlight?.alternatives?.map((a) => a.name),
    ["Park"],
  );
  // Only alternatives changed: the gateway's own summary stays.
  assert.equal(result.route_optimization_summary, "gateway summary");
  // The input plan is not mutated.
  assert.equal(listed.alternatives?.length, 3);
});

check("with nothing to drop the plan comes back as the same object", () => {
  const gateway = plan({
    interest_highlights: [withAlternatives("1", "coffee", "S1", [alt("Park", "park")])],
  });
  assert.equal(personalizeRoutePlan(gateway, [], ["food"]), gateway);
  assert.equal(personalizeRoutePlan(gateway, [], []), gateway);
});

check("re-filtering a shown plan drops the newly excluded kind", () => {
  // What the hook does after preference_update: personalize the stored plan again.
  const shown = personalizeRoutePlan(plan(), ["Yemek", "Kahve"]);
  assert.deepEqual(kindsOf(shown), ["food", "coffee"]);
  const refiltered = personalizeRoutePlan(shown, ["Yemek", "Kahve"], ["food"]);
  assert.notEqual(refiltered, shown);
  assert.deepEqual(kindsOf(refiltered), ["coffee"]);
  assert.ok(refiltered.locations.every((l) => l.interest_highlight?.interestKey !== "meal"));
});

// ── Interest chips (preference_update) ────────────────────────────────────
check("removed chips go, matched by folded label", () => {
  assert.deepEqual(
    updateInterestChips(
      ["Kahve", "Yemek", "İbadet alanı"],
      ["yemek", "İBADET ALANI"],
      [],
      PREDEFINED_USER_INTERESTS,
    ),
    ["Kahve"],
  );
});

check("restored chips come back in the app's spelling, once, only if known", () => {
  assert.deepEqual(
    updateInterestChips(
      ["Kahve"],
      [],
      ["yemek", "kahve", "Yemek", "Uzay yolculuğu", "çocuk dostu mola"],
      PREDEFINED_USER_INTERESTS,
    ),
    ["Kahve", "Yemek", "Çocuk dostu mola"],
  );
});

check("two quick updates applied in order keep both changes", () => {
  // The second update starts from the stored result of the first.
  const before = ["Kahve", "Yemek", "Tatlı"];
  const afterFirst = updateInterestChips(before, ["Yemek"], [], PREDEFINED_USER_INTERESTS);
  const afterSecond = updateInterestChips(afterFirst, ["Tatlı"], [], PREDEFINED_USER_INTERESTS);
  assert.deepEqual(afterSecond, ["Kahve"]);
  // Starting both from the old list (the bug) would have brought "Yemek" back.
  const stale = updateInterestChips(before, ["Tatlı"], [], PREDEFINED_USER_INTERESTS);
  assert.ok(stale.includes("Yemek"));
});

check("an update that changes nothing returns an equal list", () => {
  const current = ["Kahve", "Yemek"];
  assert.deepEqual(
    updateInterestChips(current, ["Spor"], ["Kahve"], PREDEFINED_USER_INTERESTS),
    current,
  );
});

// ── Stored exclusions ─────────────────────────────────────────────────────
check("exclusions are stored per person", () => {
  assert.equal(excludedBreaksPrefKey(7), "excluded_break_categories:7");
  assert.notEqual(excludedBreaksPrefKey(7), excludedBreaksPrefKey(8));
  assert.deepEqual(parseStoredBreakKinds('["food"," Coffee ","nope"]'), ["food", "coffee"]);
  assert.deepEqual(parseStoredBreakKinds("not json"), []);
  assert.deepEqual(parseStoredBreakKinds(null), []);
});

check("the in-memory list notifies only on a real change", () => {
  let calls = 0;
  const unsubscribe = BreakExclusions.subscribe(() => {
    calls += 1;
  });
  BreakExclusions.set(["food"]);
  const first = BreakExclusions.get();
  BreakExclusions.set(["food"]);
  assert.equal(BreakExclusions.get(), first);
  BreakExclusions.set([]);
  unsubscribe();
  BreakExclusions.set(["park"]);
  assert.equal(calls, 2);
  BreakExclusions.set([]);
});

console.log(`\n${passed} checks passed`);
