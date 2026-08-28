/**
 * Client for the Electrip charge-station API (ZES network).
 *
 * Complements the efish station feed on mainpage: efish stations arrive live over
 * the meter-values WebSocket, these are fetched over HTTP and cached. Both are
 * normalised to the same `Station` shape so the map renders them identically.
 *
 * Two things differ from the integration note we were given, both verified
 * against the live endpoint:
 *   - `connectors` IS present on the list response, with per-connector status,
 *     so availability does not need the per-station detail call.
 *   - `distance=3000` is kilometres, not metres: one call returns the whole
 *     network (~2500 stations). We therefore fetch once and filter by viewport
 *     rather than refetching as the map moves.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { ConnectorStatus, Station, StationType } from "@/constants/stations";

const BASE = "https://electrip-backend.electripglobal.com/v1.0";
const SERVICE = "ZES";
const DISTANCE = 3000;
const LIMIT = 3000;

/** Connectors at or above this draw are HPC. Matches the API's own hpcCount on ~91% of stations. */
const HPC_MIN_KW = 150;

const CACHE_KEY_PREFIX = "electrip_stations_v1_";
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min, per the integration note
const REQUEST_TIMEOUT_MS = 30_000;

interface ElectripConnector {
  id?: string;
  type?: string;
  status?: string;
  connectorNoAlias?: string;
  connectorNo?: number;
  connectorPowerType?: string;
  maxElectricPower?: number;
}

interface ElectripStation {
  id: number;
  csID?: string;
  name?: string;
  address?: string;
  cityName?: string;
  provinceName?: string;
  latitude?: number;
  longitude?: number;
  cpType?: string[];
  maxPower?: number;
  acCount?: number;
  dcCount?: number;
  hpcCount?: number;
  connectors?: ElectripConnector[];
}

interface Envelope<T> {
  success?: boolean;
  message?: string | null;
  data?: T;
}

interface CacheEntry {
  at: number;
  stations: Station[];
}

const memoryCache = new Map<string, CacheEntry>();

/**
 * Geolocation returns a slightly different fix every call; without rounding, every
 * fix looks like a new query. ~100 m buckets.
 */
function cacheKey(lat: number, lng: number): string {
  return `${CACHE_KEY_PREFIX}${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

/** cpType is an unordered array — check membership by priority, not position. */
function tierOf(cpType?: string[]): StationType {
  if (cpType?.includes("HPC")) return "HPC";
  if (cpType?.includes("DC")) return "DC";
  return "AC";
}

function connectorTier(c: ElectripConnector): StationType {
  if ((c.connectorPowerType || "").startsWith("AC")) return "AC";
  return (c.maxElectricPower || 0) >= HPC_MIN_KW ? "HPC" : "DC";
}

/**
 * Totals come from the API's own counts (authoritative); availability is derived
 * from connector status. Available is clamped to total so a bucketing
 * disagreement can never render "3 of 2 free".
 */
function socketStatsOf(s: ElectripStation): Station["socket_stats"] {
  const free: Record<string, number> = { AC: 0, DC: 0, HPC: 0 };
  const derived: Record<string, number> = { AC: 0, DC: 0, HPC: 0 };
  for (const c of s.connectors || []) {
    const tier = connectorTier(c);
    derived[tier] += 1;
    if (c.status === "Available") free[tier] += 1;
  }

  const reported: Record<string, number> = {
    AC: s.acCount || 0,
    DC: s.dcCount || 0,
    HPC: s.hpcCount || 0,
  };

  // ~9% of stations report all three counts as zero while still listing
  // connectors. Trusting the counts there would badge a working site as "0 free".
  const hasReportedCounts =
    reported.AC + reported.DC + reported.HPC > 0;
  const totals = hasReportedCounts ? reported : derived;

  const stats: NonNullable<Station["socket_stats"]> = {};
  for (const tier of ["AC", "DC", "HPC"]) {
    const total = totals[tier];
    if (total > 0) {
      stats[tier] = { available: Math.min(free[tier], total), total };
    }
  }
  return stats;
}

function connectorStatusOf(raw?: string): ConnectorStatus {
  switch (raw) {
    case "Available":
      return "available";
    case "Charging":
    case "Finishing":
    case "SuspendedEV":
      return "charging";
    case "Faulted":
      return "offline";
    default:
      return "busy";
  }
}

function statusOf(stats: Station["socket_stats"]): ConnectorStatus {
  const available = Object.values(stats || {}).reduce(
    (acc, s) => acc + (s.available || 0),
    0,
  );
  return available > 0 ? "available" : "busy";
}

function toStation(s: ElectripStation): Station | null {
  const latitude = Number(s.latitude);
  const longitude = Number(s.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const socket_stats = socketStatsOf(s);

  return {
    // Namespaced so an Electrip id can never collide with an efish one as a React key.
    id: `electrip-${s.id}`,
    uuid: s.csID || `electrip-${s.id}`,
    source: "electrip",
    name: s.name || "Şarj İstasyonu",
    latitude,
    longitude,
    type: tierOf(s.cpType),
    powerKw: s.maxPower || 0,
    status: statusOf(socket_stats),
    isEfish: false,
    address: [s.address, s.provinceName, s.cityName].filter(Boolean).join(", "),
    socket_stats,
    // The list response already carries per-connector status, so the detail sheet
    // needs no second request.
    connectors: (s.connectors || []).map((c, index) => ({
      id: c.id || `electrip-${s.id}-${index}`,
      powerKw: c.maxElectricPower || 0,
      status: connectorStatusOf(c.status),
      name: c.connectorNoAlias || String(c.connectorNo ?? index + 1),
      type: c.type,
    })),
  };
}

async function readPersistedCache(key: string): Promise<CacheEntry | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!parsed?.at || !Array.isArray(parsed.stations)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Fetches the ZES network around a coordinate. Returns cached stations when a
 * fetch within the last 30 minutes covered the same ~100 m bucket.
 */
export async function fetchElectripStations(
  latitude: number,
  longitude: number,
): Promise<Station[]> {
  const key = cacheKey(latitude, longitude);
  const now = Date.now();

  const cached = memoryCache.get(key) ?? (await readPersistedCache(key));
  if (cached && now - cached.at < CACHE_TTL_MS) {
    memoryCache.set(key, cached);
    return cached.stations;
  }

  const url =
    `${BASE}/charge-station?latitude=${latitude}&longitude=${longitude}` +
    `&distance=${DISTANCE}&limit=${LIMIT}&service=${SERVICE}`;

  // Hermes has no AbortSignal.timeout, so the timeout is driven by a controller —
  // the same shape AtlasTokenService uses.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let payload: Envelope<ElectripStation[]>;
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "X-Localization": "tr" },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Electrip station request failed: HTTP ${response.status}`,
      );
    }

    // The body is several megabytes; the timeout has to cover reading it too, so
    // it is cleared only once parsing is done.
    payload = (await response.json()) as Envelope<ElectripStation[]>;
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    if (aborted) {
      throw new Error(
        `Electrip did not answer within ${REQUEST_TIMEOUT_MS} ms.`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!payload?.success) {
    throw new Error(payload?.message || "Electrip station request failed");
  }

  const stations = (payload.data || [])
    .map(toStation)
    .filter((s): s is Station => s !== null);

  const entry: CacheEntry = { at: now, stations };
  memoryCache.set(key, entry);
  // Persist the normalised list (~280 KB) rather than the 4.7 MB raw response.
  AsyncStorage.setItem(key, JSON.stringify(entry)).catch((error) =>
    console.warn("[ElectripStations] Cache write failed:", error),
  );

  console.log(`[ElectripStations] Loaded ${stations.length} stations`);
  return stations;
}
