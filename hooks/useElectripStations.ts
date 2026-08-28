/**
 * Loads the Electrip (ZES) charge-station network for the map.
 *
 * One request covers the whole country, so this fetches once per session (the
 * service caches for 30 minutes across sessions) and the map filters by viewport
 * instead of refetching on every pan.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { Station } from "@/constants/stations";
import { fetchElectripStations } from "@/services/ElectripStationService";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 4000;

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Viewport {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * Rendering every station in the network would stall the map, so callers pass the
 * visible region and get back only what is on screen, nearest first.
 */
export function stationsInViewport(
  stations: Station[],
  region: Viewport | null,
  max = 150,
): Station[] {
  if (!region || stations.length === 0) return [];

  // A small pad keeps pins from popping in exactly at the edge while panning.
  const latPad = region.latitudeDelta * 0.6;
  const lngPad = region.longitudeDelta * 0.6;
  const minLat = region.latitude - latPad;
  const maxLat = region.latitude + latPad;
  const minLng = region.longitude - lngPad;
  const maxLng = region.longitude + lngPad;

  const visible = stations.filter(
    (s) =>
      s.latitude >= minLat &&
      s.latitude <= maxLat &&
      s.longitude >= minLng &&
      s.longitude <= maxLng,
  );

  if (visible.length <= max) return visible;

  // Over the cap: keep the ones closest to the centre of the screen, but hand
  // them back in their original order. Returning them in distance order would
  // reshuffle the map's children on every pan, and re-ordering children is what
  // makes AIRMap insert at an out-of-range index under the New Architecture.
  const nearest = new Set(
    visible
      .map((s) => ({
        id: s.id,
        d:
          (s.latitude - region.latitude) ** 2 +
          (s.longitude - region.longitude) ** 2,
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, max)
      .map((entry) => entry.id),
  );

  return visible.filter((s) => nearest.has(s.id));
}

export function useElectripStations(coordinate: Coordinate | null) {
  const [stations, setStations] = useState<Station[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const hasLoadedRef = useRef(false);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (coord: Coordinate) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchElectripStations(
        coord.latitude,
        coord.longitude,
      );
      setStations(result);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // Non-fatal: the efish feed still populates the map on its own.
      console.warn("[ElectripStations] Load failed:", err.message);
      setError(err);

      // The anchor coordinate rarely changes once resolved, so nothing would
      // re-trigger the effect on its own — without this retry a single transient
      // failure leaves the map without ZES pins for the whole session.
      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current += 1;
        const attempt = retriesRef.current;
        retryTimerRef.current = setTimeout(() => {
          console.log(`[ElectripStations] Retry ${attempt}/${MAX_RETRIES}`);
          void load(coord);
        }, RETRY_DELAY_MS * attempt);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!coordinate || hasLoadedRef.current) return;
    hasLoadedRef.current = true;
    void load(coordinate);
  }, [coordinate, load]);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const reload = useCallback(() => {
    if (!coordinate) return;
    hasLoadedRef.current = true;
    retriesRef.current = 0;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    void load(coordinate);
  }, [coordinate, load]);

  return { stations, isLoading, error, reload };
}
