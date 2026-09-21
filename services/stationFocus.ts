/**
 * AKBA's station search on the map. The agent's findChargingStations sends
 * `stations_focus` on topic atlas.tool (atlas repo, StationsFocusEvent):
 *
 *   { type: 'stations_focus',
 *     center: { latitude, longitude, label },
 *     stations: [{ id, latitude, longitude, name, type: 'AC'|'DC'|'HPC' }],
 *     radius_km }
 *
 * useDrivingAgent parses it and publishes it here; the map screen moves the
 * camera and highlights those stations (their ids are the map's own,
 * "electrip-202600"). A payload that does not have this shape is ignored.
 *
 * Pure (no React Native imports), so scripts/check-station-markers.ts runs
 * the parser under tsx.
 */
import type { Station, StationType } from "../constants/stations";
import { withoutProviderNames } from "./providerNames";

/** How long the found stations stay highlighted, unless the driver pans first. */
export const STATION_FOCUS_HIGHLIGHT_MS = 20_000;
/** The agent sends at most ten; more than this is not a list meant for the map. */
const MAX_FOCUS_STATIONS = 20;

export interface StationFocusStation {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  type: StationType;
}

export interface StationFocus {
  center: { latitude: number; longitude: number; label: string };
  stations: StationFocusStation[];
  /** The search radius, when the agent gave a usable one. */
  radiusKm: number | null;
}

/** A published focus: a new `seq` for every event, even a repeated search. */
export interface StationFocusEvent extends StationFocus {
  seq: number;
  receivedAt: number;
}

const STATION_TYPES: ReadonlySet<string> = new Set<StationType>(["AC", "DC", "HPC"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const coordinateOf = (value: Record<string, unknown>) => {
  const { latitude, longitude } = value;
  if (typeof latitude !== "number" || typeof longitude !== "number") return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // (0, 0) is a missing fix, not a place in Türkiye's charging network.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
};

/**
 * The focus in a `stations_focus` event, or null for anything else: another
 * type, no usable center, or no usable station. Entries that are not
 * stations (no id, bad coordinates, unknown type) are dropped one by one.
 */
export function parseStationsFocus(event: unknown): StationFocus | null {
  if (!isRecord(event) || event.type !== "stations_focus") return null;
  if (!isRecord(event.center) || !Array.isArray(event.stations)) return null;

  const centerAt = coordinateOf(event.center);
  if (!centerAt) return null;
  const label = typeof event.center.label === "string" ? withoutProviderNames(event.center.label) : "";

  const seen = new Set<string>();
  const stations: StationFocusStation[] = [];
  for (const entry of event.stations) {
    if (stations.length >= MAX_FOCUS_STATIONS) break;
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (!id || seen.has(id)) continue;
    const at = coordinateOf(entry);
    if (!at) continue;
    if (typeof entry.type !== "string" || !STATION_TYPES.has(entry.type)) continue;
    seen.add(id);
    stations.push({
      id,
      ...at,
      name: typeof entry.name === "string" ? withoutProviderNames(entry.name) : "",
      type: entry.type as StationType,
    });
  }
  if (stations.length === 0) return null;

  const radius = event.radius_km;
  const radiusKm =
    typeof radius === "number" && Number.isFinite(radius) && radius > 0 ? radius : null;
  return { center: { ...centerAt, label }, stations, radiusKm };
}

/**
 * A found station the map has not loaded (its feed is still on the way), as
 * a map station: drawn with the same pin, availability unknown.
 */
export function stationFromFocus(entry: StationFocusStation): Station {
  return {
    id: entry.id,
    uuid: entry.id,
    name: entry.name || "Şarj istasyonu",
    latitude: entry.latitude,
    longitude: entry.longitude,
    type: entry.type,
    powerKw: 0,
    status: "busy",
    isEfish: false,
    source: entry.id.startsWith("electrip-") ? "electrip" : undefined,
  };
}

/** Half the smallest height the camera frames: ~800 m across, so one station next door is not street level. */
const MIN_HALF_SPAN_LAT = 0.0036;

/**
 * What the camera fits: the search center and every station, widened to at
 * least MIN_HALF_SPAN_LAT around their middle (two corner points more).
 */
export function focusFitCoordinates(
  focus: StationFocus,
): { latitude: number; longitude: number }[] {
  const points = [focus.center, ...focus.stations].map(({ latitude, longitude }) => ({
    latitude,
    longitude,
  }));
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude);
    maxLat = Math.max(maxLat, p.latitude);
    minLng = Math.min(minLng, p.longitude);
    maxLng = Math.max(maxLng, p.longitude);
  }
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;
  const halfLng = MIN_HALF_SPAN_LAT / Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  // The corners sit inside whichever side is already wider, so they only widen the other.
  if (maxLat - minLat < MIN_HALF_SPAN_LAT * 2 || maxLng - minLng < halfLng * 2) {
    points.push(
      { latitude: midLat - MIN_HALF_SPAN_LAT, longitude: midLng - halfLng },
      { latitude: midLat + MIN_HALF_SPAN_LAT, longitude: midLng + halfLng },
    );
  }
  return points;
}

type Listener = (focus: StationFocusEvent | null) => void;

/**
 * The latest focus, handed from the voice hook (car mode) to the map screen.
 * Only the newest counts: a new search replaces the one before it.
 */
class StationFocusBusImpl {
  private current: StationFocusEvent | null = null;
  private seq = 0;
  private listeners = new Set<Listener>();

  publish(focus: StationFocus, now: number = Date.now()) {
    this.seq += 1;
    this.current = { ...focus, seq: this.seq, receivedAt: now };
    this.listeners.forEach((listener) => listener(this.current));
  }

  /** The highlight ended (timer, a pan, the drive ending). */
  clear() {
    if (!this.current) return;
    this.current = null;
    this.listeners.forEach((listener) => listener(null));
  }

  get(): StationFocusEvent | null {
    return this.current;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const StationFocusBus = new StationFocusBusImpl();
