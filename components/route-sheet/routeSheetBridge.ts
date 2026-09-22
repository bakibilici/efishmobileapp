import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { DriveSessionStore } from "../../services/DriveSessionStore";
import {
  MIDDLE_LEVEL,
  supportsNativeRouteSheet,
  type RouteSheetMode,
} from "./nativeRouteSheet";

/**
 * Why the system route sheet closes, and what its close then does:
 * - "user": the driver put it away (a swipe down, "Haritaya dön"): the
 *   car-mode capsule offers it back.
 * - "remove": "Rotayı kaldır" was confirmed: the route is cleared once the
 *   sheet has gone.
 * - "route-gone", "leave", "mode-switch", "yield": nothing. The route went,
 *   the driver left for Oturumlar, a preview turned into a drive (presented
 *   again), or something the sheet would hide has to show (a confirmation,
 *   a station's details).
 */
export type RouteSheetCloseReason =
  | "user"
  | "remove"
  | "route-gone"
  | "leave"
  | "mode-switch"
  | "yield";

export type RouteSheetState = Readonly<{
  /** Pushed, not yet on screen. */
  presenting: boolean;
  /** The sheet's screen is mounted. */
  presented: boolean;
  /** Just closed: UIKit may still be sliding it away, so nothing else presents yet. */
  settling: boolean;
  /** The mode it was presented in, while presenting or presented. */
  mode: RouteSheetMode | null;
  /** Something asked for the sheet to stay away (addHold). */
  held: boolean;
}>;

/** A push that never mounts a sheet gives up after this, and the presenter tries again. */
const PRESENT_TIMEOUT_MS = 3000;
/**
 * A sheet closed from JS leaves the navigation state at once, while UIKit
 * slides it away for about 0.35 s. A React Native <Modal> (or another sheet)
 * presented meanwhile is refused silently, so both wait this long.
 */
const DISMISS_SETTLE_MS = 600;
/** The same after the last hold ends: its <Modal> may still be fading out. */
const HOLD_SETTLE_MS = 450;
/** "Rotayı kaldır": the route is cleared this late at the latest, even if the close reports nothing. */
const REMOVE_FALLBACK_MS = 700;

/**
 * The system route sheet (iOS 26, app/route-sheet.tsx) is a screen of the
 * root stack presented over the whole window, so the map screen cannot
 * drive it as a child view. This keeps what both sides need: whether it is
 * up, why it is closing, and who needs it away.
 *
 * RouteSheetPresenter (the map screen) presents it and asks for it to go;
 * the sheet's screen registers how to close itself and reports its
 * unmount, where the close reason is applied. Holds (a confirmation in
 * CarModeView, a station's details) keep it away until they are released.
 * Unused on the gorhom path: nothing is ever presented there, so every
 * request is a no-op.
 */
class RouteSheetBridgeImpl {
  private state: RouteSheetState = {
    presenting: false,
    presented: false,
    settling: false,
    mode: null,
    held: false,
  };
  private listeners = new Set<() => void>();
  private sheetKey: string | null = null;
  private closer: (() => void) | null = null;
  private pendingReason: RouteSheetCloseReason | null = null;
  private closeRequested = false;
  private holds = new Set<string>();
  private presentTimer: ReturnType<typeof setTimeout> | null = null;
  private unmountTimer: ReturnType<typeof setTimeout> | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private removeTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): RouteSheetState => this.state;

  /** Up, on its way up, or still sliding away. */
  isOnScreen() {
    const { presenting, presented, settling } = this.state;
    return presenting || presented || settling;
  }

  private set(patch: Partial<RouteSheetState>) {
    const next = { ...this.state, ...patch };
    const current = this.state;
    if (
      next.presenting === current.presenting &&
      next.presented === current.presented &&
      next.settling === current.settling &&
      next.mode === current.mode &&
      next.held === current.held
    ) {
      return;
    }
    this.state = next;
    this.listeners.forEach((listener) => listener());
  }

  private clearTimer(timer: ReturnType<typeof setTimeout> | null) {
    if (timer) clearTimeout(timer);
    return null;
  }

  /**
   * The presenter is about to push the sheet. Its level counts at once, as
   * the gorhom sheet's did: the car-mode view makes way while it rises
   * (no event reports the first stop).
   */
  beginPresent(mode: RouteSheetMode): boolean {
    if (this.state.presenting || this.state.presented) return false;
    this.pendingReason = null;
    this.closeRequested = false;
    this.set({ presenting: true, mode });
    DriveSessionStore.setRoutePlanSheetIndex(MIDDLE_LEVEL);
    this.presentTimer = this.clearTimer(this.presentTimer);
    this.presentTimer = setTimeout(() => {
      this.presentTimer = null;
      if (!this.state.presenting || this.state.presented) return;
      this.pendingReason = null;
      this.set({ presenting: false, mode: null });
      DriveSessionStore.setRoutePlanSheetIndex(-1);
    }, PRESENT_TIMEOUT_MS);
    return true;
  }

  /** The sheet's screen mounted; `close` pops exactly that screen. */
  sheetDidMount(key: string, mode: RouteSheetMode, close: () => void) {
    if (this.unmountTimer) {
      this.unmountTimer = this.clearTimer(this.unmountTimer);
      // The same sheet mounting again (Fast Refresh) keeps going; another
      // one first finishes the old one's close.
      if (this.sheetKey !== key) this.finishClose();
    }
    this.presentTimer = this.clearTimer(this.presentTimer);
    this.sheetKey = key;
    this.closer = close;
    this.set({ presenting: false, presented: true, settling: false, mode });
    // Asked to go before it was up.
    if (this.pendingReason) {
      this.close();
      return;
    }
    // A push slower than PRESENT_TIMEOUT_MS gave its level up; the sheet
    // is at its middle stop all the same, so the car-mode view makes way.
    if (DriveSessionStore.getRoutePlanSheetIndex() < 0) {
      DriveSessionStore.setRoutePlanSheetIndex(MIDDLE_LEVEL);
    }
  }

  /**
   * The sheet's screen unmounted: it closed, whoever closed it. Finished a
   * tick later, so an immediate remount of the same screen (Fast Refresh)
   * is not taken for a close.
   */
  sheetDidUnmount(key: string) {
    if (key !== this.sheetKey) return;
    this.unmountTimer = this.clearTimer(this.unmountTimer);
    this.unmountTimer = setTimeout(() => {
      this.unmountTimer = null;
      this.finishClose();
    }, 0);
  }

  private finishClose() {
    // A close nobody asked for is the driver's swipe down (live only: a
    // preview has no swipe).
    const reason =
      this.pendingReason ?? (this.state.mode === "live" ? "user" : "route-gone");
    this.pendingReason = null;
    this.closeRequested = false;
    this.closer = null;
    this.sheetKey = null;
    this.removeTimer = this.clearTimer(this.removeTimer);
    this.settleTimer = this.clearTimer(this.settleTimer);
    this.set({ presenting: false, presented: false, settling: true, mode: null });
    this.settleTimer = setTimeout(() => {
      this.settleTimer = null;
      this.set({ settling: false });
    }, DISMISS_SETTLE_MS);

    DriveSessionStore.setRoutePlanSheetIndex(-1);
    if (reason === "user") {
      DriveSessionStore.dismissRouteSheet();
    } else if (reason === "remove") {
      DriveSessionStore.clearRoute();
    }
  }

  private close() {
    if (this.closeRequested || !this.closer) return;
    this.closeRequested = true;
    this.closer();
  }

  /**
   * Closes the sheet if it is up or on its way. The first reason given
   * wins, except "remove": a confirmed "Rotayı kaldır" always clears the
   * route, also when the sheet already closed (or began closing) for
   * something else while its Alert was open.
   */
  requestDismiss(reason: RouteSheetCloseReason) {
    if (!this.state.presented && !this.state.presenting) {
      if (reason === "remove" && supportsNativeRouteSheet()) {
        DriveSessionStore.clearRoute();
      }
      return;
    }
    if (!this.pendingReason || (reason === "remove" && this.pendingReason !== "remove")) {
      this.pendingReason = reason;
      if (reason === "remove") {
        this.removeTimer = this.clearTimer(this.removeTimer);
        this.removeTimer = setTimeout(() => {
          this.removeTimer = null;
          if (this.pendingReason !== "remove") return;
          this.pendingReason = "route-gone";
          DriveSessionStore.clearRoute();
        }, REMOVE_FALLBACK_MS);
      }
    }
    if (this.state.presented) this.close();
  }

  /** Keeps the sheet away (closing it if it is up) until every hold is released. */
  addHold(key: string) {
    this.holds.add(key);
    this.holdTimer = this.clearTimer(this.holdTimer);
    this.set({ held: true });
    this.requestDismiss("yield");
  }

  releaseHold(key: string) {
    if (!this.holds.delete(key) || this.holds.size > 0) return;
    this.holdTimer = this.clearTimer(this.holdTimer);
    this.holdTimer = setTimeout(() => {
      this.holdTimer = null;
      if (this.holds.size === 0) this.set({ held: false });
    }, HOLD_SETTLE_MS);
  }
}

export const routeSheetBridge = new RouteSheetBridgeImpl();

export const useRouteSheetState = () =>
  useSyncExternalStore(routeSheetBridge.subscribe, routeSheetBridge.getSnapshot);

/** How long a <Modal> may take to report that it is on screen before it is mounted again. */
const MODAL_SHOW_TIMEOUT_MS = 1200;
const MODAL_SHOW_RETRIES = 3;

/**
 * A React Native <Modal> that must show while the system route sheet may be
 * up: UIKit refuses a second presentation from the root silently, and the
 * Modal then never appears. While `wanted`, the sheet is held away; the
 * Modal shows once the sheet has gone, and is mounted again (the returned
 * key) if it has not reported onShow in time.
 *
 * On the gorhom path it returns `wanted` unchanged, with no key change and
 * no onShow: the Modal behaves as before.
 */
export function useModalOverRouteSheet(holdKey: string, wanted: boolean) {
  const native = supportsNativeRouteSheet();
  const sheet = useRouteSheetState();
  const sheetOnScreen = native && (sheet.presenting || sheet.presented || sheet.settling);
  const visible = wanted && !sheetOnScreen;

  useEffect(() => {
    if (!native) return;
    if (wanted) routeSheetBridge.addHold(holdKey);
    else routeSheetBridge.releaseHold(holdKey);
  }, [native, wanted, holdKey]);
  useEffect(
    () => () => {
      if (native) routeSheetBridge.releaseHold(holdKey);
    },
    [native, holdKey],
  );

  const [attempt, setAttempt] = useState(0);
  const shownRef = useRef(false);
  const retriesRef = useRef(0);
  useEffect(() => {
    if (!visible) retriesRef.current = 0;
  }, [visible]);
  useEffect(() => {
    shownRef.current = false;
    if (!native || !visible) return;
    const timer = setTimeout(() => {
      if (shownRef.current || retriesRef.current >= MODAL_SHOW_RETRIES) return;
      retriesRef.current += 1;
      setAttempt((count) => count + 1);
    }, MODAL_SHOW_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [native, visible, attempt]);
  const onShow = useCallback(() => {
    shownRef.current = true;
  }, []);

  return { visible, key: attempt, onShow: native ? onShow : undefined };
}
