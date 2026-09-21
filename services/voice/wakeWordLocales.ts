/**
 * Which language the on-device "AKBA" recognizer listens in. Pure, no React
 * Native imports, so scripts/voice/check-voice-helpers.ts runs it under node.
 *
 * Turkish is tried first. A phone set to another language often has no
 * on-device Turkish model, so English comes next: biased with the contextual
 * string "AKBA", an English recognizer writes the name in Latin letters
 * wakeWordMatcher knows. No other language is tried: a Russian, Arabic,
 * Japanese, Greek… recognizer writes the name in its own script, which the
 * matcher can never match. Whatever is picked must still run on the device;
 * the listener checks that per locale.
 */

const PRIMARY_WAKE_WORD_LOCALE = "tr-TR";
const FALLBACK_WAKE_WORD_LOCALE = "en-US";
/** The languages whose recognizers write "AKBA" in letters the matcher reads, Turkish first. */
const WAKE_WORD_LANGUAGES = ["tr", "en"] as const;

/**
 * "en_us" → "en-US", "zh-Hans-CN" → "zh-CN", "es-419" stays; null for a tag
 * without a region ("en"), which no recognizer locale matches. Extensions
 * ("-u-…", "-x-…") are ignored.
 */
export function normalizeLocaleTag(tag: string): string | null {
  const parts = tag.trim().split(/[-_]/);
  const language = parts[0]?.toLowerCase();
  if (!language || !/^[a-z]{2,3}$/.test(language)) return null;
  for (const part of parts.slice(1)) {
    if (part.length === 1) break;
    if (/^([a-z]{2}|\d{3})$/i.test(part)) return `${language}-${part.toUpperCase()}`;
  }
  return null;
}

const languageOf = (tag: string) => tag.trim().split(/[-_]/)[0]?.toLowerCase() ?? "";

/**
 * tr-TR, then the phone's own Turkish and English tags (expo-localization
 * languageTag; Turkish before English, otherwise in the phone's order), then
 * en-US; each once. Every other language is left out (see above). A
 * region-less tag is skipped: "tr" and "en" are covered by the two ends of
 * the list anyway.
 */
export function wakeWordLocaleCandidates(preferredTags: readonly string[]): string[] {
  const candidates: string[] = [];
  const add = (tag: string) => {
    const locale = normalizeLocaleTag(tag);
    if (locale && !candidates.includes(locale)) candidates.push(locale);
  };
  add(PRIMARY_WAKE_WORD_LOCALE);
  for (const language of WAKE_WORD_LANGUAGES) {
    preferredTags.filter((tag) => languageOf(tag) === language).forEach(add);
  }
  add(FALLBACK_WAKE_WORD_LOCALE);
  return candidates;
}

/**
 * Android: the installed on-device model to start with for a candidate — the
 * same locale, else another region of the same language — or null when that
 * language has no model on the phone.
 */
export function matchInstalledLocale(
  candidate: string,
  installedLocales: readonly string[],
): string | null {
  const exact = installedLocales.find((installed) => normalizeLocaleTag(installed) === candidate);
  if (exact) return candidate;
  const sameLanguage = installedLocales.find(
    (installed) => languageOf(installed) === languageOf(candidate),
  );
  if (!sameLanguage) return null;
  return normalizeLocaleTag(sameLanguage) ?? candidate;
}

/**
 * How iOS can say a language has no usable on-device model: besides
 * "language-not-supported" (how the patched library refuses a server
 * fallback), a missing model can surface as "service-not-allowed"
 * (kLSRErrorDomain 102, "Assets are not installed") or "network"
 * (kAFAssistantErrorDomain 1101).
 */
const MISSING_MODEL_ERRORS: ReadonlySet<string> = new Set(["service-not-allowed", "network"]);

/**
 * Whether a recognizer run's error means its language cannot run here, so the
 * listener rules it out and tries the next candidate. "language-not-supported"
 * always does. "service-not-allowed" and "network" only on the language's
 * first run, when that ended quickly without any result; later they are what
 * they say. Anything else, a permission denial ("not-allowed") included, never
 * does.
 */
export function isLocaleRefusal(
  error: string,
  run: { first: boolean; quick: boolean; hadResult: boolean },
): boolean {
  if (error === "language-not-supported") return true;
  return MISSING_MODEL_ERRORS.has(error) && run.first && run.quick && !run.hadResult;
}

/** "no on-device recognizer for tr-TR, en-US; speech recognizer unavailable for de-DE". */
export function describeUnusableLocales(
  noOnDevice: readonly string[],
  unavailable: readonly string[],
): string {
  const parts: string[] = [];
  if (noOnDevice.length > 0) parts.push(`no on-device recognizer for ${noOnDevice.join(", ")}`);
  if (unavailable.length > 0) {
    parts.push(`speech recognizer unavailable for ${unavailable.join(", ")}`);
  }
  return parts.join("; ") || "no wake-word locale to try";
}
