/**
 * Centralized, observable store for real-time speed data.
 * 
 * This is the UI's source of truth for the user's current spatial speed.
 */

import { UNKNOWN_SPEED } from './types';

type SpeedListener = (speed: number) => void;

class SpeedStoreImpl {
  /**
   * km/h, or UNKNOWN_SPEED (-1) when no window has measured one yet. Unknown
   * rather than 0: before the first GPS fix the app knows nothing about the
   * speed, and a screen that prints "0 km/sa" there is stating a measurement
   * it never took.
   */
  private speed: number = UNKNOWN_SPEED;
  private listeners: Set<SpeedListener> = new Set();

  public setSpeed(speed: number): void {
    if (this.speed === speed) return;
    this.speed = speed;
    this.notify();
  }

  public getSpeed(): number {
    return this.speed;
  }

  public subscribe(listener: SpeedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public reset(): void {
    this.speed = UNKNOWN_SPEED;
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn(this.speed);
      } catch (err) {
        console.error('[SpeedStore] Listener error:', err);
      }
    });
  }
}

// Singleton
export const SpeedStore = new SpeedStoreImpl();
