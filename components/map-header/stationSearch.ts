/**
 * The map's search field finding stations by name: the loaded stations of
 * both feeds, folded the way Oturumlar's search folds text, so "ist", "İST"
 * and "Ist" all find "İSTANBUL".
 *
 * Pure (no React Native), so scripts/check-map-header.ts runs it under tsx.
 */
import type { Station } from "../../constants/stations";
import { metersBetween } from "../../services/routeStopStations";
import { formatKm } from "../route-sheet/routeFormat";
import { foldForSearch } from "../sessions/sessionModel";

export type Coords = { latitude: number; longitude: number };

export type StationIndexEntry = { key: string; station: Station };

/** sessionModel's private searchKey: foldForSearch with ı read as i ("ist", "İST", "Ist" all find "İSTANBUL"). */
export const stationSearchKey = (text: string) => foldForSearch(text).replace(/ı/g, "i");

/** Each station once (by id) with its folded name. */
export function buildStationIndex(stations: readonly Station[]): StationIndexEntry[] {
  const seen = new Set<string>();
  const index: StationIndexEntry[] = [];
  for (const station of stations) {
    if (seen.has(station.id)) continue;
    seen.add(station.id);
    index.push({ key: stationSearchKey(station.name), station });
  }
  return index;
}

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** 0: a word of the name starts with the query (the name's own start counts); 1: the name contains it; -1: neither. */
function rankOf(key: string, query: string): number {
  let at = key.indexOf(query);
  if (at < 0) return -1;
  while (at >= 0) {
    if (at === 0 || !WORD_CHAR.test(key[at - 1])) return 0;
    at = key.indexOf(query, at + 1);
  }
  return 1;
}

/**
 * Stations whose name holds the query (its key at least 2 characters long).
 * Rank 0: a word of the name starts with the query (the name's own start
 * counts); rank 1: the name contains it. Within a rank, nearest first when
 * `near` is known, else in the index's order. At most `limit`.
 */
export function matchStations(
  index: readonly StationIndexEntry[],
  query: string,
  near: Coords | null,
  limit = 3,
): Station[] {
  const q = stationSearchKey(query);
  if (q.length < 2) return [];
  const hits: { station: Station; rank: number; meters: number; order: number }[] = [];
  index.forEach(({ key, station }, order) => {
    const rank = rankOf(key, q);
    if (rank < 0) return;
    hits.push({ station, rank, meters: near ? metersBetween(near, station) : 0, order });
  });
  hits.sort((a, b) => a.rank - b.rank || a.meters - b.meters || a.order - b.order);
  return hits.slice(0, limit).map((hit) => hit.station);
}

/**
 * The same stations, nearest first, always as a new array. The map's own
 * station list is deliberately left unsorted — re-ordering the map's
 * children is what destabilises its native child list — so the sheets that
 * list stations sort a copy of it. Without a location the order is kept.
 */
export function sortByDistance<T extends Coords>(
  stations: readonly T[],
  near: Coords | null,
): T[] {
  const listed = [...stations];
  if (!near || listed.length < 2) return listed;
  return listed.sort((a, b) => metersBetween(near, a) - metersBetween(near, b));
}

/**
 * "120", "7,4": a power as the rest of the app writes numbers. Null when the
 * feed sent none — `max_power` is optional, and a row that reads "NaN kW" is
 * worse than a row with no power on it. The same contract as formatKm, so
 * every call site drops the segment instead of guarding the number itself.
 */
export const formatKw = (kw?: number | null): string | null =>
  typeof kw === "number" && Number.isFinite(kw) && kw > 0
    ? String(Math.round(kw * 10) / 10).replace(".", ",")
    : null;

/** "HPC · 120 kW · 2,4 km". kW omitted when powerKw <= 0; distance omitted without `near`. */
export function stationSubtitle(station: Station, near: Coords | null): string {
  const parts: string[] = [station.type];
  const kw = formatKw(station.powerKw);
  if (kw) {
    parts.push(`${kw} kW`);
  }
  if (near) {
    const km = formatKm(metersBetween(near, station) / 1000);
    if (km) parts.push(km);
  }
  return parts.join(" · ");
}
