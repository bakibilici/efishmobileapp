import { useState, useEffect } from 'react';
import { SpeedStore } from '../services/sensors/SpeedStore';

/**
 * Hook to reactively subscribe to user speed updates from the pipeline.
 * Does not block UI thread as updates are throttled at the Store level.
 * Returns the current speed in km/h, unrounded (a window average).
 */
export function useSpeed(): number {
  const [speed, setSpeed] = useState<number>(SpeedStore.getSpeed());

  useEffect(() => {
    return SpeedStore.subscribe(setSpeed);
  }, []);

  return speed;
}

/**
 * A speed as the screen prints it: whole km/h ("4 km/sa", never
 * "4.299339319991123 km/sa"). A negative or missing reading (no GPS fix)
 * becomes -1, which every caller shows as unknown instead of printing it.
 */
export function toDisplayKmh(kmh: number): number {
  if (!Number.isFinite(kmh) || kmh < 0) return -1;
  return Math.round(kmh);
}
