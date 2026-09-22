import { useIsFocused } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";

import { DriveSessionState, DriveSessionStore } from "../../services/DriveSessionStore";
import { hasRouteSheet } from "../RoutePlanSheet";
import type { RouteSheetMode } from "./nativeRouteSheet";
import { routeSheetBridge, useRouteSheetState } from "./routeSheetBridge";

type DriveSnapshot = {
  active: boolean;
  hasSheet: boolean;
  isPreview: boolean;
  dismissed: boolean;
};

const readDrive = (): DriveSnapshot => {
  const state = DriveSessionStore.getState();
  const context = DriveSessionStore.getContext();
  return {
    active: state !== DriveSessionState.IDLE && state !== DriveSessionState.PROMPTING,
    hasSheet: hasRouteSheet(context?.routePlanData),
    isPreview: !!context?.isPreviewMode,
    dismissed: DriveSessionStore.isRouteSheetDismissed(),
  };
};

const sameDrive = (a: DriveSnapshot, b: DriveSnapshot) =>
  a.active === b.active &&
  a.hasSheet === b.hasSheet &&
  a.isPreview === b.isPreview &&
  a.dismissed === b.dismissed;

/**
 * The map screen's route sheet on iOS 26: renders nothing, and presents
 * the system sheet (app/route-sheet.tsx) whenever a drive has a route to
 * show, the driver has not put a live route's sheet away, and nothing holds
 * it off (routeSheetBridge). It presents only while the map screen is
 * focused; the sheet itself takes the focus, so a blur never closes it.
 *
 * A preview turning into a drive closes the preview sheet and presents a
 * live one, at the middle. The capsule and the header's trip reopen a
 * sheet put away (DriveSessionStore.openRouteSheet) through here too.
 */
export function RouteSheetPresenter() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const sheet = useRouteSheetState();
  const [drive, setDrive] = useState(readDrive);

  useEffect(
    () =>
      DriveSessionStore.onStateChange(() => {
        const next = readDrive();
        setDrive((previous) => (sameDrive(previous, next) ? previous : next));
      }),
    [],
  );

  const mode: RouteSheetMode = drive.isPreview ? "preview" : "live";
  const wantsSheet =
    drive.active && drive.hasSheet && !(mode === "live" && drive.dismissed) && !sheet.held;
  const isUp = sheet.presenting || sheet.presented;

  useEffect(() => {
    if (!wantsSheet) {
      if (isUp) routeSheetBridge.requestDismiss("route-gone");
      return;
    }
    if (isUp) {
      if (sheet.presented && sheet.mode !== mode) {
        routeSheetBridge.requestDismiss("mode-switch");
      }
      return;
    }
    // The last sheet may still be sliding away; a push meanwhile would be refused.
    if (sheet.settling || !isFocused) return;
    if (!routeSheetBridge.beginPresent(mode)) return;
    router.push({ pathname: "/route-sheet", params: { mode } });
  }, [wantsSheet, isUp, sheet.presented, sheet.mode, sheet.settling, mode, isFocused, router]);

  // The map screen going away takes the sheet with it.
  useEffect(() => () => routeSheetBridge.requestDismiss("route-gone"), []);

  return null;
}
