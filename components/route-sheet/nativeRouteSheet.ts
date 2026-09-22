import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform } from "react-native";

import { hasLiquidGlass, isIOS26 } from "../ui/glass";

/**
 * The kill switch for the system route sheet. True: on iOS 26 the route
 * panel is the system's own sheet (app/route-sheet.tsx: Liquid Glass at the
 * lower stops, opaque and edge to edge at the full height). False: every
 * device shows the gorhom sheet (RoutePlanSheet) again, after a reload.
 */
export const NATIVE_ROUTE_SHEET_ENABLED = true;

/**
 * Development only: the gorhom sheet on an iOS 26 device too, to check the
 * fallback on the same simulator. Never ship it as true.
 */
const FORCE_GORHOM = false;

/**
 * iOS 26 with Liquid Glass (loaded defensively in ui/glass), the switch on.
 * Android and older iOS keep the gorhom sheet. Fixed for the app's run, so
 * a screen can branch on it once.
 */
const NATIVE_ROUTE_SHEET =
  Platform.OS === "ios" &&
  isIOS26 &&
  hasLiquidGlass &&
  NATIVE_ROUTE_SHEET_ENABLED &&
  !FORCE_GORHOM;

export const supportsNativeRouteSheet = () => NATIVE_ROUTE_SHEET;

/**
 * A stored drive only looked at (a peek, no swipe away) or a drive being
 * driven (the middle and the full height; a swipe down puts it away).
 */
export type RouteSheetMode = "preview" | "live";

export const routeSheetModeOf = (params: object | undefined): RouteSheetMode =>
  (params as { mode?: unknown } | undefined)?.mode === "preview" ? "preview" : "live";

/**
 * The store's level, as RoutePlanSheet counts it: -1 closed, 0 the peek
 * (previews only), 1 the middle, 2 the full height.
 */
export const MIDDLE_LEVEL = 1;

export const levelOfIndex = (index: number, isPreview: boolean) =>
  index < 0 ? -1 : isPreview ? index : index + 1;

/**
 * The stops, in fractions of the sheet's largest height. The highest must
 * be exactly 1: only a full-height stop turns the glass opaque (0.85 stays
 * glass). The middle and the peek leave the map undimmed and tappable.
 *
 * Fixed for a presentation: sheetInitialDetentIndex applies once, and
 * changing the stops of a presented sheet keeps its index (a different
 * height) or throws when an index falls outside them. A preview turning
 * into a drive is a new presentation instead.
 */
const COMMON_OPTIONS: NativeStackNavigationOptions = {
  presentation: "formSheet",
  headerShown: false,
  // The system draws the material: any fill here, the navigator theme's
  // default included, turns the glass into a solid card.
  contentStyle: { backgroundColor: "transparent" },
  sheetGrabberVisible: true,
  // Scrolling the content at the middle raises the sheet, as the gorhom one did.
  sheetExpandsWhenScrolledToEdge: true,
};

const PREVIEW_OPTIONS: NativeStackNavigationOptions = {
  ...COMMON_OPTIONS,
  sheetAllowedDetents: [0.15, 0.55, 1],
  sheetInitialDetentIndex: 1,
  sheetLargestUndimmedDetentIndex: 1,
  // The peek is the floor: a preview is left through "Oturumlara dön".
  gestureEnabled: false,
};

const LIVE_OPTIONS: NativeStackNavigationOptions = {
  ...COMMON_OPTIONS,
  sheetAllowedDetents: [0.55, 1],
  sheetInitialDetentIndex: 0,
  sheetLargestUndimmedDetentIndex: 0,
  // A swipe down puts the sheet away; the car-mode capsule brings it back.
  gestureEnabled: true,
};

/** The route-sheet screen's options, by the mode it was presented in. */
export const routeSheetScreenOptions = ({
  route,
}: {
  route: { params?: object };
}): NativeStackNavigationOptions =>
  routeSheetModeOf(route.params) === "preview" ? PREVIEW_OPTIONS : LIVE_OPTIONS;
