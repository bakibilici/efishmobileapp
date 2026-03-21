import { useEffect, useState } from 'react';
import { ActivityService } from '../services/ActivityService';
import { ActivityState } from '../services/ActivityStateMachine';

/**
 * Reactive hook for the current FSM activity state.
 * Subscribes to ActivityStateMachine state changes via ActivityService.
 */
export function useActivityState(): ActivityState {
  const [state, setState] = useState<ActivityState>(
    ActivityService.getStateMachine().getState(),
  );

  useEffect(() => {
    const fsm = ActivityService.getStateMachine();
    // Sync initial state (may have changed between render and effect)
    setState(fsm.getState());

    const unsubscribe = fsm.onStateChange((newState: ActivityState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  return state;
}
