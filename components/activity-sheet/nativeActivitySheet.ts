import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Platform } from "react-native";

import { hasLiquidGlass, isIOS26 } from "../ui/glass";

/**
 * The activity sheet as the system's own sheet, on the devices that draw one:
 * iOS 26 with Liquid Glass, exactly as the route panel decides it
 * (components/route-sheet/nativeRouteSheet.ts). Android and older iOS get a
 * plain modal page instead, which the screen paints itself.
 *
 * Fixed for the app's run, so the screen can branch on it once.
 */
const NATIVE_ACTIVITY_SHEET = Platform.OS === "ios" && isIOS26 && hasLiquidGlass;

export const supportsNativeActivitySheet = () => NATIVE_ACTIVITY_SHEET;

/**
 * The route sheet's live options: it opens at a little over half the screen,
 * rises to the full height when it is dragged or scrolled past its edge, and
 * a swipe down puts it away. The lower stop leaves the map undimmed, so the
 * capsule the sheet came from stays visible under it.
 */
const SHEET_OPTIONS: NativeStackNavigationOptions = {
  presentation: "formSheet",
  headerShown: false,
  // The system draws the material: any fill here turns the glass into a card.
  contentStyle: { backgroundColor: "transparent" },
  sheetGrabberVisible: true,
  sheetExpandsWhenScrolledToEdge: true,
  sheetAllowedDetents: [0.55, 1],
  sheetInitialDetentIndex: 0,
  sheetLargestUndimmedDetentIndex: 0,
  gestureEnabled: true,
};

/**
 * Everywhere else: an ordinary modal page. Its background is the screen's
 * own (the page palette follows Görünüm, which a static option cannot).
 */
const MODAL_OPTIONS: NativeStackNavigationOptions = {
  presentation: "modal",
  headerShown: false,
  gestureEnabled: true,
};

export const activitySheetScreenOptions: NativeStackNavigationOptions =
  NATIVE_ACTIVITY_SHEET ? SHEET_OPTIONS : MODAL_OPTIONS;
