import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { ActivityState, ActivityStateMachine } from '../services/ActivityStateMachine';

export interface CarModeConfig {
  fsm: ActivityStateMachine;
  /** If true, the modal will only show once per driving session */
  triggerOncePerSession?: boolean;
}

/**
 * Custom hook to manage the car mode navigation trigger state.
 * Keeping this completely separated from the UI component ensures clean architecture
 * and highly testable state logic.
 */
export function useCarModeNavigation({ fsm, triggerOncePerSession = true }: CarModeConfig) {
  const router = useRouter();
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  // Track if we've already prompted the user this "session".
  // Using a ref ensures we don't cause unnecessary re-renders.
  const hasTriggeredOnce = useRef(false);

  useEffect(() => {
    const unsubscribe = fsm.onStateChange((newState) => {
      if (newState === ActivityState.CAR) {
        // Prevent repeated popups if they already saw it this session
        if (triggerOncePerSession && hasTriggeredOnce.current) {
          return;
        }
        
        setIsModalVisible(true);
      } else if (newState === ActivityState.IDLE) {
        // Edge Case: Reset the session trigger if they have been completely idle.
        // This resets the "session", meaning the next time they start driving, it will trigger again.
        hasTriggeredOnce.current = false;
        // We purposefully DO NOT call setIsModalVisible(false) here. 
        // It's bad UX for a modal to suddenly vanish while reading it just because the car stopped!
      }
    });

    return unsubscribe;
  }, [fsm, triggerOncePerSession]);

  const onConfirm = () => {
    setIsModalVisible(false);
    hasTriggeredOnce.current = true;
    router.push('/route-plan'); // Navigate to Route Plan screen
  };

  const onDismiss = () => {
    setIsModalVisible(false);
    // Even if dismissed, we prevent it from popping up continuously while driving
    hasTriggeredOnce.current = true; 
  };

  return {
    isModalVisible,
    onConfirm,
    onDismiss,
  };
}
