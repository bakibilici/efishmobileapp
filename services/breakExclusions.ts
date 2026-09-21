import { normalizeBreakKinds, type BreakKind } from "./routePersonalization";

/**
 * The kinds of break the signed-in driver told AKBA never to suggest.
 * No React Native imports, so scripts/voice/check-voice-helpers.ts can
 * exercise the pure parts under plain node.
 *
 * Stored per person (LocalUserStorage preference excludedBreaksPrefKey(id)),
 * so a second driver on the same phone does not inherit the first one's list;
 * LocalUserStorage.deleteUser removes it with the rest of the person's data.
 */

/** The device-wide key the list used before it was per person. Never migrated: whose it was cannot be told. */
export const LEGACY_EXCLUDED_BREAKS_PREF = "excluded_break_categories";

export const excludedBreaksPrefKey = (userId: number | string) =>
  `${LEGACY_EXCLUDED_BREAKS_PREF}:${userId}`;

/** A stored preference value back to kinds; anything unreadable counts as none. */
export const parseStoredBreakKinds = (raw: string | null | undefined): BreakKind[] => {
  if (!raw) return [];
  try {
    return normalizeBreakKinds(JSON.parse(raw));
  } catch {
    return [];
  }
};

let current: readonly BreakKind[] = [];
const listeners = new Set<() => void>();

/**
 * The current driver's list in memory, for views that filter what they show
 * (the route sheet's alternatives). useDrivingAgent owns loading and saving.
 */
export const BreakExclusions = {
  get(): readonly BreakKind[] {
    return current;
  },
  set(kinds: readonly BreakKind[]) {
    if (kinds.length === current.length && kinds.every((kind, i) => kind === current[i])) {
      return;
    }
    current = [...kinds];
    listeners.forEach((listener) => listener());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
