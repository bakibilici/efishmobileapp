/**
 * Grid-based station clustering for the map.
 *
 * Dependency-free and a single pass over the input: stations are bucketed into
 * an absolute world-anchored grid whose cell size follows the zoom level, so a
 * pan never re-buckets anything and render cost is bounded by the number of
 * occupied cells (a few dozen), not by the number of stations (thousands).
 *
 * Cells holding one station render as a normal pin; cells holding more render
 * as one cluster marker carrying its members — nothing is dropped, which is
 * what replaced the old "nearest 150" cap that silently hid stations.
 */
import type { Station } from "@/constants/stations";

export interface StationCluster {
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  stations: Station[];
}

interface Viewport {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface ClusteredStations {
  singles: Station[];
  clusters: StationCluster[];
}

/** Members closer together than this (~80 m) cannot be separated by zooming. */
export const CLUSTER_SPREAD_EPSILON = 0.0008;

/**
 * The zoom is quantised to powers of two before deriving the cell size, so
 * pinching a little does not rebuild every cluster id; the grid only changes
 * when the zoom roughly doubles or halves.
 */
export function clusterStations(
  stations: Station[],
  region: Viewport,
  pinnedStationId?: string,
): ClusteredStations {
  const bucket = Math.round(
    Math.log2(Math.max(region.longitudeDelta, 0.0005)),
  );
  const cellLng = Math.pow(2, bucket) / 7; // ~7 columns per screen width
  const cellLat = cellLng * 0.75; // roughly square on screen at TR latitudes

  const singles: Station[] = [];
  const cells = new Map<string, Station[]>();

  for (const s of stations) {
    // The station whose sheet is open must stay an individual, stable marker —
    // swallowing it into a cluster would unmount it mid-interaction.
    if (pinnedStationId && s.id === pinnedStationId) {
      singles.push(s);
      continue;
    }
    const key = `${Math.floor(s.longitude / cellLng)}:${Math.floor(s.latitude / cellLat)}`;
    const cell = cells.get(key);
    if (cell) cell.push(s);
    else cells.set(key, [s]);
  }

  const clusters: StationCluster[] = [];
  for (const [key, members] of cells) {
    if (members.length === 1) {
      singles.push(members[0]);
      continue;
    }
    let lat = 0;
    let lng = 0;
    for (const m of members) {
      lat += m.latitude;
      lng += m.longitude;
    }
    clusters.push({
      // Bucket is part of the id: a zoom change replaces the marker set instead
      // of mutating markers in place, which the map's native side is fragile about.
      id: `cl-${bucket}-${key}`,
      latitude: lat / members.length,
      longitude: lng / members.length,
      count: members.length,
      stations: members,
    });
  }

  return { singles, clusters };
}

/** Bounding box of a cluster's members, for zoom-to-fit on tap. */
export function clusterBounds(cluster: StationCluster) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const s of cluster.stations) {
    if (s.latitude < minLat) minLat = s.latitude;
    if (s.latitude > maxLat) maxLat = s.latitude;
    if (s.longitude < minLng) minLng = s.longitude;
    if (s.longitude > maxLng) maxLng = s.longitude;
  }
  return { minLat, maxLat, minLng, maxLng };
}
