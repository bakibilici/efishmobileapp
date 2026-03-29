import { useEffect, useRef } from 'react';
import { ActivityState, ActivityStateMachine } from '../services/ActivityStateMachine';
import { DriveSessionStore } from '../services/DriveSessionStore';
import { useUser } from '../context/UserContext';

export interface CarModeConfig {
  fsm: ActivityStateMachine;
  /** If true, the modal will only show once per driving session */
  triggerOncePerSession?: boolean;
}

/**
 * Custom hook to bridge ActivityStateMachine and DriveSessionStore.
 * This acts as the "orchestrator" for triggering the car mode flow.
 */
export function useCarModeNavigation({ fsm, triggerOncePerSession = true }: CarModeConfig) {
  const { user } = useUser();
  // Track if we've already prompted the user this "session".
  const hasTriggeredOnce = useRef(false);

  useEffect(() => {
    const unsubscribe = fsm.onStateChange((newState) => {
      // 0. DO NOTHING if user is not logged in
      if (!user) return;

      // 1. Forward all activity changes to the session store for delay logic
      DriveSessionStore.handleActivityChange(newState);

      // 2. Trigger Prompting if we just started driving
      if (newState === ActivityState.CAR) {
        if (triggerOncePerSession && hasTriggeredOnce.current) {
          return;
        }
        
        DriveSessionStore.startPrompt();
        hasTriggeredOnce.current = true;
      } else if (newState === ActivityState.IDLE) {
        // Reset the trigger flag when we are completely idle
        hasTriggeredOnce.current = false;
      }
    });

    return unsubscribe;
  }, [fsm, triggerOncePerSession, user]);

  return {
    // We return nothing for now as the components subscribe to DriveSessionStore directly
  };
}
