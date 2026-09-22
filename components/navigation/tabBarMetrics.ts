import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** The floating tab bar's pill and its action circle. */
export const TAB_BAR_HEIGHT = 62;

/** The room kept between the bar and the content scrolled under it. */
const CONTENT_GAP = 16;

/**
 * The bottom edge of the map's floating buttons on mainpage (re-center and
 * the temporary car-mode button sit at `bottom: 120`), with 8 pt kept
 * between them and the bar's top edge.
 */
const MAP_BUTTONS_BOTTOM = 120;
const MAP_BUTTONS_GAP = 8;

/**
 * The bar's distance from the bottom edge. On iOS it sits in the home
 * indicator's area, as the iOS 26 tab bar does (20 pt on a Face ID iPhone),
 * or 16 pt above the edge on a phone without one. On Android edge-to-edge,
 * `insets.bottom` is the system navigation bar (about 48 dp with three
 * buttons), so the bar goes above it, but no higher than the map's
 * buttons allow: 12 dp over three-button navigation would put its top edge
 * over the re-center button's bottom edge. It never goes into the system bar.
 */
export function useTabBarBottomOffset(): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === "ios") {
    return insets.bottom > 0 ? Math.max(insets.bottom - 14, 8) : 16;
  }
  const clearOfMapButtons = MAP_BUTTONS_BOTTOM - TAB_BAR_HEIGHT - MAP_BUTTONS_GAP;
  return Math.max(insets.bottom, Math.min(insets.bottom + 12, clearOfMapButtons));
}

/**
 * Bottom padding for a tab page's scroll content, so its last row can
 * scroll clear of the bar. On iOS the scroll view already adds the bottom
 * safe area (contentInsetAdjustmentBehavior "automatic"): it is taken off.
 */
export function useTabBarContentInset(): number {
  const insets = useSafeAreaInsets();
  const offset = useTabBarBottomOffset();
  const inset = TAB_BAR_HEIGHT + offset + CONTENT_GAP;
  return Platform.OS === "ios" ? inset - insets.bottom : inset;
}
