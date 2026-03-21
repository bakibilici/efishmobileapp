/**
 * Centralized, observable store for real-time speed data.
 * 
 * This is the UI's source of truth for the user's current spatial speed.
 */

type SpeedListener = (speed: number) => void;

class SpeedStoreImpl {
  private speed: number = 0;
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
    this.speed = 0;
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
