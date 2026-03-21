import { useState, useEffect } from 'react';
import { SpeedStore } from '../services/sensors/SpeedStore';

/**
 * Hook to reactively subscribe to user speed updates from the pipeline.
 * Does not block UI thread as updates are throttled at the Store level.
 * Returns the current speed (usually in m/s).
 */
export function useSpeed(): number {
  const [speed, setSpeed] = useState<number>(SpeedStore.getSpeed());

  useEffect(() => {
    return SpeedStore.subscribe(setSpeed);
  }, []);

  return speed;
}
