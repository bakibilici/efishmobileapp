import { useEffect, useRef, useState } from 'react';
import { StepStore, StepSnapshot } from '../services/sensors/StepStore';

const THROTTLE_MS = 300; // Max UI update frequency

/**
 * Reactive hook for real-time step data.
 * Throttled to prevent excessive re-renders from rapid sensor updates.
 */
export function useStepCount() {
  const [snapshot, setSnapshot] = useState<StepSnapshot>(StepStore.getSnapshot());
  const lastUpdateTime = useRef(0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = StepStore.subscribe((next) => {
      const now = Date.now();
      const elapsed = now - lastUpdateTime.current;

      // If enough time has passed, update immediately
      if (elapsed >= THROTTLE_MS) {
        lastUpdateTime.current = now;
        setSnapshot(next);
        return;
      }

      // Otherwise, schedule a trailing update
      if (!pendingTimer.current) {
        pendingTimer.current = setTimeout(() => {
          pendingTimer.current = null;
          lastUpdateTime.current = Date.now();
          setSnapshot(StepStore.getSnapshot());
        }, THROTTLE_MS - elapsed);
      }
    });

    return () => {
      unsubscribe();
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
      }
    };
  }, []);

  return snapshot;
}
