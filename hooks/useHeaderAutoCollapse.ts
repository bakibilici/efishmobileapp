import { useState, useEffect, useRef, useCallback } from 'react';
import { ActivityState } from '../services/ActivityStateMachine';

export type HeaderMode = 'FULL' | 'COMPACT' | 'MINIMAL';

/**
 * Hook to manage the collapsible header's visual state based on 
 * map interactions and Activity pipeline changes.
 */
export function useHeaderAutoCollapse(activityState: ActivityState) {
  const [headerMode, setHeaderMode] = useState<HeaderMode>('FULL');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * User interacts with the map -> collapse to COMPACT.
   * If autoRestore is true (default), expands back to FULL after 1.5s delay.
   * If autoRestore is false, the COMPACT mode persists until explicitly changed.
   */
  const reportInteraction = useCallback((autoRestore: boolean = true) => {
    setHeaderMode('COMPACT');
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    
    if (autoRestore) {
      timerRef.current = setTimeout(() => {
        setHeaderMode('FULL');
        timerRef.current = null;
      }, 1500); 
    }
  }, []);

  /**
   * Force expand the header manually to FULL mode.
   * Clears any pending auto-collapse/expand timers.
   */
  const forceExpand = useCallback(() => {
    setHeaderMode('FULL');
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Automatic reactions to state changes from the Activity pipeline.
   * On any state change (e.g. Walking -> Driving), briefly expand 
   * to show the change before auto-collapsing.
   */
  useEffect(() => {
    setHeaderMode('FULL');
    
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    
    timerRef.current = setTimeout(() => {
      setHeaderMode('COMPACT');
      timerRef.current = null;
    }, 3000);
  }, [activityState]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    headerMode,
    reportInteraction,
    forceExpand,
  };
}
