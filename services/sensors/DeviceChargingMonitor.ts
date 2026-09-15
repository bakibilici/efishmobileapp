import * as Battery from "expo-battery";
import { ChargingSessionStore } from "../ChargingSessionStore";

/**
 * Feeds the phone's own charger state into the activity pipeline so that
 * plugging the phone in yields the CHARGING state and 2x steps.
 *
 * `isBlocked` lets the caller veto the signal — while driving, a phone on the
 * car's USB port must not hijack car mode.
 */
class DeviceChargingMonitorImpl {
  private subscription: { remove(): void } | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastPlugged: boolean | null = null;
  private isBlocked: () => boolean = () => false;

  async start(isBlocked?: () => boolean): Promise<void> {
    if (isBlocked) this.isBlocked = isBlocked;
    this.stop();
    try {
      this.apply(await Battery.getBatteryStateAsync());
      this.subscription = Battery.addBatteryStateListener(({ batteryState }) => this.apply(batteryState));
    } catch (e) {
      console.warn("[DeviceChargingMonitor] battery state unavailable:", e);
    }
    // Re-evaluate periodically: the veto (driving) can lift while the phone
    // stays plugged in, and no battery event fires for that.
    this.pollTimer = setInterval(() => {
      Battery.getBatteryStateAsync().then((s) => this.apply(s)).catch(() => {});
    }, 15000);
  }

  stop(): void {
    this.subscription?.remove();
    this.subscription = null;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.lastPlugged) ChargingSessionStore.setChargingState(false, "device");
    this.lastPlugged = null;
  }

  private apply(state: Battery.BatteryState): void {
    const plugged =
      state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;
    const effective = plugged && !this.isBlocked();
    if (effective === this.lastPlugged) return;
    this.lastPlugged = effective;
    ChargingSessionStore.setChargingState(effective, "device");
  }
}

export const DeviceChargingMonitor = new DeviceChargingMonitorImpl();
