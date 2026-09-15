type ChargingListener = (isCharging: boolean) => void;
export type ChargingSource = "session" | "device";

/**
 * Single source of truth for "is charging" as the activity FSM sees it.
 * Two independent producers exist: an EV charging session (efish/simulation)
 * and the phone's own charger (DeviceChargingMonitor). Either one keeps the
 * state on; the flag only drops when both are off.
 */
class ChargingSessionStoreImpl {
  private sources = new Set<ChargingSource>();
  private listeners: Set<ChargingListener> = new Set();

  public get isCharging(): boolean {
    return this.sources.size > 0;
  }

  public setChargingState(isCharging: boolean, source: ChargingSource = "session") {
    const before = this.isCharging;
    if (isCharging) this.sources.add(source);
    else this.sources.delete(source);
    if (before !== this.isCharging) this.notifyListeners();
  }

  public subscribe(listener: ChargingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    const value = this.isCharging;
    this.listeners.forEach((listener) => listener(value));
  }
}

export const ChargingSessionStore = new ChargingSessionStoreImpl();
