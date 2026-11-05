/**
 * Pure matching for the on-device "Electrip" / "AKBA" wake word. No React Native imports,
 * so scripts/voice/check-voice-helpers.ts can exercise it under plain node.
 *
 * Supports both "Electrip" and the original "AKBA" wake word:
 * - Electrip variants: Electrip, Elektrip, elektrip, electripe, elektripe, elek trip, electrip'e
 * - AKBA variants: AKBA, Akba, akpa, ağba, akbaa, hakba, ak ba, Akbah, Acba
 * Matching is whole-token only, keeping words like "elektrik", "elektrikli",
 * "akbaba", "Akbank" from waking the assistant.
 */

/** tr-TR lower-casing, then Turkish letters and stray combining marks folded to ASCII. */
export function foldTurkish(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    // A runtime without Turkish casing rules turns "İ" into "i" + U+0307.
    .replace(/[̀-ͯ]/g, "");
}

/** AKBA token: optional leading "h", "a", the k sound, b/p, one or more a's. */
const AKBA_TOKEN = /^h?a(?:ck|[kgcq])[bp]a+h?$/;
const AKBA_HEAD = /^h?a(?:ck|[kgcq])$/;
const AKBA_TAIL = /^[bp]a+h?$/;

/** Electrip token: e/i, le, k/c/kt/ct, r, i/ı, p/b, with optional Turkish suffixes. */
const ELECTRIP_TOKEN = /^(?:e|i)le(?:k|c|kt|ct)i?r[iı]?[pb](?:e|a|ye|ya|i|ı|yi|in|nin)?$/;
/** Split forms "elek trip" / "elec trip" */
const ELECTRIP_HEAD = /^(?:e|i)le(?:k|c|kt|ct)$/;
const ELECTRIP_TAIL = /^t?r[iı]?[pb](?:e|a|ye|ya|i|ı|yi|in|nin)?$/;

export function tokenize(text: string): string[] {
  return foldTurkish(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when the transcript contains the wake word as a word of its own. */
export function matchesWakeWord(transcript: string): boolean {
  if (!transcript) return false;
  const tokens = tokenize(transcript);
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (AKBA_TOKEN.test(t) || ELECTRIP_TOKEN.test(t)) return true;
    if (i + 1 < tokens.length) {
      if (AKBA_HEAD.test(t) && AKBA_TAIL.test(tokens[i + 1])) return true;
      if (ELECTRIP_HEAD.test(t) && ELECTRIP_TAIL.test(tokens[i + 1])) return true;
    }
  }
  return false;
}
