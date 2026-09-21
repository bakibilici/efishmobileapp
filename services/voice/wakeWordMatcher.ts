/**
 * Pure matching for the on-device "AKBA" wake word. No React Native imports,
 * so scripts/voice/check-voice-helpers.ts can exercise it under plain node.
 *
 * The recognizer does not know the word, so it writes whatever it heard. A
 * Turkish one: "AKBA", "Akba", "akpa", "ağba", "akbaa", "hakba", or two words
 * "ak ba". An English one (a phone without on-device Turkish, see
 * wakeWordLocales): "Akbah", "Acba", "Aqba", "ack ba", "ak bah". Matching is
 * whole-token only, which keeps "akbaba", "Akbank", "Akbay", "Akbar" and
 * "Ackbar" from waking the assistant.
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

/**
 * One token: optional leading "h", "a", the k sound (k, g, c, q or ck), b or
 * p, one or more a's, optional trailing "h". Nothing else may follow, so an
 * "r" ("akbar"), "n" ("akbank") or a second syllable ("akbaba") never matches.
 */
const WAKE_TOKEN = /^h?a(?:ck|[kgcq])[bp]a+h?$/;
/** Split form "ak ba" / "ack bah": first half, then second half. */
const WAKE_HEAD = /^h?a(?:ck|[kgcq])$/;
const WAKE_TAIL = /^[bp]a+h?$/;

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
    if (WAKE_TOKEN.test(tokens[i])) return true;
    if (
      i + 1 < tokens.length &&
      WAKE_HEAD.test(tokens[i]) &&
      WAKE_TAIL.test(tokens[i + 1])
    ) {
      return true;
    }
  }
  return false;
}
