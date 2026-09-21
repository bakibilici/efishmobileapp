/**
 * A route's charging stops as map stations, so the map draws them with the
 * very pin it gives the station itself (AC/DC/HPC colour, bolts, available
 * count). A stop that is also in the loaded station list becomes that
 * station, availability included; any other stop becomes a station built
 * from the route's own fields, whose availability is unknown.
 *
 * Pure (type-only imports), so scripts/check-station-markers.ts runs it
 * under tsx.
 */
import { stationTierOf, type Station, type StationType } from "../constants/stations";
import type { RoutePlanLocation } from "./DriveSessionStore";
import { withoutProviderNames } from "./providerNames";
import { foldTurkish } from "./voice/wakeWordMatcher";

/** A stop and a station this close (metres) are the same place. */
export const SAME_PLACE_METERS = 30;
/**
 * Only this near may a stop take a station's id or name: a route id from
 * another id space, or a chain's name ("Metro Market"), must not pull in a
 * station elsewhere in the country.
 */
export const SAME_STATION_MAX_METERS = 1000;

/** The route's field, camelCase too: the gateway has sent both spellings. */
type RouteStopFields = Pick<
  RoutePlanLocation,
  "name" | "coordinates" | "cp_type" | "ac_count" | "dc_count" | "hpc_count" | "max_power" | "brand" | "address" | "id"
> & { cpType?: unknown };

const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/**
 * The plug kinds a stop offers, as the feed's cpType list: cp_type/cpType as
 * a list or as text ("DC", "AC,DC", "AC/DC/HPC"), else read off the counts.
 */
export function routeStopPlugKinds(stop: RouteStopFields): string[] {
  const raw = stop.cp_type ?? stop.cpType;
  const listed = Array.isArray(raw)
    ? raw.filter((kind): kind is string => typeof kind === "string")
    : typeof raw === "string"
      ? raw.split(/[\s,;/|+]+/)
      : [];
  const kinds = listed.map((kind) => kind.trim().toUpperCase()).filter(Boolean);
  if (kinds.length) return kinds;
  return [
    isCount(stop.hpc_count) ? "HPC" : null,
    isCount(stop.dc_count) ? "DC" : null,
    isCount(stop.ac_count) ? "AC" : null,
  ].filter((kind): kind is string => kind !== null);
}

/** The map's tier for a stop: HPC if it lists HPC, else DC if it lists DC, else AC. */
export function routeStopTier(stop: RouteStopFields): StationType {
  return stationTierOf(routeStopPlugKinds(stop));
}

export function routeStopCoordinate(
  stop: Pick<RoutePlanLocation, "coordinates">,
): { latitude: number; longitude: number } | null {
  const latitude = parseFloat(String(stop.coordinates?.lat));
  const longitude = parseFloat(String(stop.coordinates?.lon));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Metres between two points (haversine). */
export function metersBetween(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "ZES Bolu Dağı Tesisleri" and "zes bolu dagi tesisleri" compare equal. */
export function stationNameKey(name: string | null | undefined): string {
  return foldTurkish(withoutProviderNames(name ?? ""))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The loaded station a stop is, or null. In order: the map's own id for the
 * stop's id ("electrip-<id>") when it is also nearby, the nearest station
 * within SAME_PLACE_METERS, then a station of the same name nearby.
 */
export function matchRouteStop(
  stop: RouteStopFields,
  stations: readonly Station[],
  byId?: ReadonlyMap<string, Station>,
): Station | null {
  const at = routeStopCoordinate(stop);
  if (!at) return null;
  const near = (station: Station, meters: number) =>
    metersBetween(at, station) <= meters;

  if (stop.id != null && byId) {
    const byRouteId = byId.get(`electrip-${stop.id}`);
    if (byRouteId && near(byRouteId, SAME_STATION_MAX_METERS)) return byRouteId;
  }

  let nearest: Station | null = null;
  let nearestMeters = SAME_PLACE_METERS;
  const nameKey = stationNameKey(stop.name);
  let sameName: Station | null = null;
  let sameNameMeters = SAME_STATION_MAX_METERS;
  for (const station of stations) {
    // A cheap box first: 0.02° is ~2 km, well past both distances.
    if (
      Math.abs(station.latitude - at.latitude) > 0.02 ||
      Math.abs(station.longitude - at.longitude) > 0.02
    ) {
      continue;
    }
    const meters = metersBetween(at, station);
    if (meters <= nearestMeters) {
      nearest = station;
      nearestMeters = meters;
    }
    if (nameKey && meters <= sameNameMeters && stationNameKey(station.name) === nameKey) {
      sameName = station;
      sameNameMeters = meters;
    }
  }
  return nearest ?? sameName;
}

/**
 * A stop the loaded list does not have, as a station: same tier rule, the
 * route's name and power. No socket counts, since how many plugs are free
 * is unknown (the pin shows no number rather than a made-up 0).
 */
export function routeStopStation(stop: RouteStopFields, index: number): Station | null {
  const at = routeStopCoordinate(stop);
  if (!at) return null;
  const id = `route-stop-${stop.id ?? index}`;
  return {
    id,
    uuid: id,
    name: withoutProviderNames(stop.name ?? "") || "Şarj istasyonu",
    latitude: at.latitude,
    longitude: at.longitude,
    type: routeStopTier(stop),
    powerKw: isCount(stop.max_power) ? stop.max_power : 0,
    status: "busy",
    isEfish: false,
    address: stop.address ? withoutProviderNames(stop.address) : undefined,
  };
}

/** Sum of free plugs, or null when the station carries no socket counts. */
export function availableSockets(station: Pick<Station, "socket_stats">): number | null {
  if (!station.socket_stats) return null;
  return Object.values(station.socket_stats).reduce(
    (sum, stat) => sum + (stat?.available || 0),
    0,
  );
}
