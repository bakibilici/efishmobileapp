import { useMemo, useState } from "react";

/** The rank each key got when it first appeared, kept between renders. */
export type AppendOrderRanks = { next: number; byKey: Map<string, number> };

export const newAppendOrderRanks = (): AppendOrderRanks => ({ next: 0, byKey: new Map() });

/**
 * `items` in the order each key first appeared: an item that stays keeps its
 * place, a new one goes after all of them, and one that leaves is dropped.
 * So from one call to the next, the survivors come first in their old order
 * and only new items follow. Updates `ranks`; calling it twice with the same
 * items gives the same order.
 */
export function appendOnlyOrder<T extends { key: string }>(
  items: readonly T[],
  ranks: AppendOrderRanks,
): T[] {
  const byKey = new Map<string, number>();
  for (const item of items) {
    byKey.set(item.key, ranks.byKey.get(item.key) ?? ranks.next++);
  }
  ranks.byKey = byKey;
  return [...items].sort((a, b) => byKey.get(a.key)! - byKey.get(b.key)!);
}

/**
 * appendOnlyOrder for the map's markers.
 *
 * react-native-maps 1.18 runs through the New Architecture's legacy-interop
 * view, which adds a child straight away only when it lands at the end of
 * the map's children. A child inserted mid-list waits for the map's next
 * prop update, so it is not drawn (a filter chip left pins missing until the
 * map moved), and the interop's index-based removals then take out the
 * wrong markers. Appending only keeps the native list in step with React's.
 */
export function useAppendOnlyOrder<T extends { key: string }>(items: readonly T[]): T[] {
  // Bookkeeping rewritten while rendering, not state: repeating a render
  // gives every key the same rank, and a key dropped by a render React threw
  // away only goes to the end, which is still an append.
  const [ranks] = useState(newAppendOrderRanks);
  return useMemo(() => appendOnlyOrder(items, ranks), [items, ranks]);
}
