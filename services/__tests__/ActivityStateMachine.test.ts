import { ActivityStateMachine, ActivityState } from '../ActivityStateMachine';
import { ActivityState as ClassifierState } from '../sensors/ActivityClassifier';

describe('ActivityStateMachine', () => {
  let fsm: ActivityStateMachine;
  let time: number;

  beforeEach(() => {
    fsm = new ActivityStateMachine({
      walkingToIdleDelayMs: 2000,
      carToIdleDelayMs: 3000,
      debounceMs: 1000,
    });
    time = 10000; // start at 10s mark
  });

  const tick = (steps: number, speed: number, isCharging: boolean = false) => {
    time += 1000; // advance 1 second per tick
    
    // Simulate ActivityClassifier logic for the test
    let classified: ClassifierState = 'IDLE';
    if (speed > 5.0) {
      classified = 'CAR';
    } else if (steps > 0) {
      classified = 'WALKING';
    }

    fsm.transition(classified, isCharging, time);
  };

  it('starts in IDLE state', () => {
    expect(fsm.getState()).toBe(ActivityState.IDLE);
  });

  it('transitions IDLE -> WALKING immediately on steps', () => {
    tick(2, 1.0); 
    expect(fsm.getState()).toBe(ActivityState.WALKING);
  });

  it('debounces WALKING -> IDLE transition (hysteresis)', () => {
    tick(2, 1.0); // start walking
    expect(fsm.getState()).toBe(ActivityState.WALKING);

    tick(0, 0); // stop walking for 1s
    expect(fsm.getState()).toBe(ActivityState.WALKING); // debouncing protects state

    time += 2000; // skip ahead past the 2s delay
    fsm.transition('IDLE', false, time);
    
    expect(fsm.getState()).toBe(ActivityState.IDLE);
  });

  it('interrupts pending transitions if user resumes activity', () => {
    tick(2, 1.0); // WALKING
    tick(0, 0);   // Stop (pending IDLE)
    
    time += 1000; // wait 1s (halfway)
    fsm.transition('IDLE', false, time);
    expect(fsm.getState()).toBe(ActivityState.WALKING); 
    
    tick(1, 1.0); // take a step! this cancels the pending IDLE

    time += 2500; // wait what would have been enough time to idle
    fsm.transition('IDLE', false, time);
    
    // We expect it to still be WALKING because the timer reset when they took a step
    expect(fsm.getState()).toBe(ActivityState.WALKING);
  });

  it('transitions to CAR if speed exceeds threshold continuously', () => {
    // IDLE -> CAR
    tick(0, 6.0); // over limit 5.0
    expect(fsm.getState()).toBe(ActivityState.IDLE); // wait for 1000ms debounce
    
    time += 1500;
    fsm.transition('CAR', false, time);
    expect(fsm.getState()).toBe(ActivityState.CAR);
  });

  it('ignores steps while in CAR state', () => {
    // Transition to CAR first
    tick(0, 6.0); 
    time += 1500;
    fsm.transition('CAR', false, time);
    expect(fsm.getState()).toBe(ActivityState.CAR);

    // Bump in the road triggers step sensor
    tick(5, 6.0); 
    expect(fsm.getState()).toBe(ActivityState.CAR); // Should stay CAR
  });

  it('transitions to CHARGING immediately when plugged in overrides other states', () => {
    tick(2, 1.5); // WALKING
    tick(0, 0, true); // Plugged in
    expect(fsm.getState()).toBe(ActivityState.CHARGING);
  });

  it('leaves CHARGING state and returns to IDLE when unplugged', () => {
    tick(0, 0, true);
    expect(fsm.getState()).toBe(ActivityState.CHARGING);
    
    tick(0, 0, false);
    expect(fsm.getState()).toBe(ActivityState.IDLE);
  });
});
