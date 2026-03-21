type ChargingListener = (isCharging: boolean) => void;

class ChargingSessionStoreImpl {
  private _isCharging: boolean = false;
  private listeners: Set<ChargingListener> = new Set();

  public get isCharging(): boolean {
    return this._isCharging;
  }

  public setChargingState(isCharging: boolean) {
    if (this._isCharging !== isCharging) {
      this._isCharging = isCharging;
      this.notifyListeners();
    }
  }

  public subscribe(listener: ChargingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener(this._isCharging));
  }
}

export const ChargingSessionStore = new ChargingSessionStoreImpl();
