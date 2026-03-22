/**
 * Centralized, observable store for real-time step data.
 * 
 * This is the single source of truth for step counts across the app.
 * UI components subscribe via the useStepCount hook; the ActivityPipeline
 * pushes data in. Neither side knows about the other.
 */

import { calculateEffectiveSteps } from './StepCalculator';
import { DailyStepStore } from './DailyStepStore';
import { ActivityState } from '../ActivityStateMachine';

export interface StepSnapshot {
  /** Raw steps from hardware sensors */
  rawSteps: number;
  /** Steps after applying multipliers (e.g. 2x while charging) */
  effectiveSteps: number;
  /** Whether the device is currently charging */
  isCharging: boolean;
  /** Timestamp of the last update */
  lastUpdatedAt: number;
}

type StepListener = (snapshot: StepSnapshot) => void;

const INITIAL_SNAPSHOT: StepSnapshot = {
  rawSteps: 0,
  effectiveSteps: 0,
  isCharging: false,
  lastUpdatedAt: 0,
};

class StepStoreImpl {
  private snapshot: StepSnapshot = { ...INITIAL_SNAPSHOT };
  private listeners: Set<StepListener> = new Set();
  private isHydrated = false;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      const today = await DailyStepStore.getToday();
      if (today) {
        this.snapshot = {
          ...this.snapshot,
          rawSteps: today.rawSteps,
          effectiveSteps: today.totalSteps,
          lastUpdatedAt: today.lastUpdatedAt || Date.now(),
        };
        this.isHydrated = true;
        this.notify();
        console.log(`[StepStore] Hydrated from DailyStepStore: ${this.snapshot.effectiveSteps} steps`);
      }
    } catch (error) {
      console.error('[StepStore] Hydration error:', error);
    }
  }

  /** Called by the pipeline whenever new sensor data arrives */
  public async addSteps(steps: number, isCharging: boolean, activityState?: ActivityState): Promise<void> {
    if (steps <= 0) return;

    if (!this.isHydrated) {
      await this.waitForHydration();
    }

    const effective = calculateEffectiveSteps({ steps, isCharging });

    this.snapshot = {
      rawSteps: this.snapshot.rawSteps + steps,
      effectiveSteps: this.snapshot.effectiveSteps + effective,
      isCharging,
      lastUpdatedAt: Date.now(),
    };
    
    // Persist to DailyStepStore
    DailyStepStore.incrementSteps(steps, isCharging, activityState);

    this.notify();
  }

  private async waitForHydration() {
    if (this.isHydrated) return;
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.isHydrated) {
          clearInterval(check);
          resolve();
        }
      }, 50);
      // Timeout after 2s just in case
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, 2000);
    });
  }

  /** Update charging state without adding steps */
  public setChargingState(isCharging: boolean): void {
    if (this.snapshot.isCharging === isCharging) return;
    this.snapshot = { ...this.snapshot, isCharging, lastUpdatedAt: Date.now() };
    this.notify();
  }

  public getSnapshot(): StepSnapshot {
    return this.snapshot;
  }

  public subscribe(listener: StepListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reset for new session / testing */
  public reset(): void {
    this.snapshot = { ...INITIAL_SNAPSHOT };
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn(this.snapshot);
      } catch (err) {
        console.error('[StepStore] Listener error:', err);
      }
    });
  }
}

// Singleton — shared across the entire app
export const StepStore = new StepStoreImpl();
