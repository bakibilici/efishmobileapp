/**
 * Car mode's fixed geometry (points), shared by CarModeView, which draws the
 * header, orb and capsule, and the map screen, which frames AKBA's station
 * search in the part of the map they leave clear. Its own module, so the map
 * screen does not import CarModeView for a few numbers.
 */
import { Platform } from "react-native";

/** The trip's two header lines at text size 100%: destination 23 + trip line 17. */
export const TRIP_LINES_HEIGHT = 23 + 17;
/** Between the header's text lines; does not grow with the text size. */
export const STATUS_TEXT_STACK_GAP = 2;

/** The orb's place: `assistantContainer` bottom and `orbTouchTarget` size. */
export const ORB_BOTTOM = 36;
export const ORB_TARGET_SIZE = 132;
/**
 * The map's locate button (mainpage `recenterBtn` in drive mode): 60 pt tall,
 * bottom 132, 20 pt from the right edge. Beside it the capsule would have to
 * be narrower than "Kızılay, Ankara · 4 sa 50 dk", so it sits just above
 * both the button and the orb, as wide as the screen allows.
 */
const LOCATE_BUTTON_TOP = 132 + 60;
export const CAPSULE_BOTTOM = Math.max(ORB_BOTTOM + ORB_TARGET_SIZE + 6, LOCATE_BUTTON_TOP + 10);
/** The capsule's own height (`capsuleGlass` minHeight). */
const CAPSULE_HEIGHT = 44;

/** `floatingHeader` top. */
export const HEADER_TOP = Platform.OS === "ios" ? 60 : 30;
/**
 * The header at text size 100%: safe-area padding 6 + 6, content padding
 * 10 + 10, the top row (the trip's lines and their gap, 42), the 12 gap and
 * the 44 actions row.
 */
const HEADER_HEIGHT = 12 + 20 + (TRIP_LINES_HEIGHT + STATUS_TEXT_STACK_GAP) + 12 + 44;

/** The speed and arrival column (`floatingStats`): 20 from the right edge, 74 wide. */
const STATS_COLUMN_RIGHT = 20 + 74;

/**
 * The part of the screen car mode leaves clear, in points from each edge:
 * below the header, above the reopen capsule (which sits above the orb and
 * the locate button), left of the speed and arrival column.
 */
export const CAR_MODE_MAP_CLEAR_INSETS = {
  top: HEADER_TOP + HEADER_HEIGHT,
  bottom: CAPSULE_BOTTOM + CAPSULE_HEIGHT,
  right: STATS_COLUMN_RIGHT,
} as const;
