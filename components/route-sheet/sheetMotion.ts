import { createContext, useContext } from "react";
import type { SharedValue } from "react-native-reanimated";

/**
 * The route sheet's position as the parts inside it need it, all on the UI
 * thread: RoutePlanSheet derives the values from the sheet's animated index
 * and hands them down, so the background and the title row follow a drag
 * frame by frame without a React render.
 */
export type SheetMotion = {
  /**
   * 0 at the middle stop and below, 1 at the highest stop, in between as
   * the sheet is dragged or animates: how far the glass has turned opaque.
   */
  topProgress: SharedValue<number>;
  /**
   * Whether the panel has a way back, so the sheet's own back button shows
   * at the highest stop. A panel's title then always keeps the button's
   * room free at its right and only slides into it (titleShift): its width
   * never changes, so it never wraps again while the sheet moves.
   */
  hasBack: boolean;
  /**
   * How far a panel's title slides right, as a translation, to clear the
   * sheet's own back button: 0 until the button starts to show, the full
   * inset at the top stop; 0 throughout when there is no way back.
   */
  titleShift: SharedValue<number>;
};

/**
 * Where the back button changes hands, in topProgress: above it the
 * floating button leaves and the sheet's own (SheetBackButton) takes
 * touches. Half way up, so the floating one is gone before a fling brings
 * the sheet's edge up to it.
 */
export const TOP_HANDOVER = 0.5;

/**
 * Where the sheet's own button starts to fade in, and the title to slide
 * right for it, in topProgress: both are complete at the top stop.
 */
export const SHEET_BACK_REVEAL_START = 0.7;

/** The sheet's own back button: a compact circle, and the room a title leaves for it. */
export const SHEET_BACK_SIZE = 34;
export const SHEET_BACK_INSET = SHEET_BACK_SIZE + 10;

export const SheetMotionContext = createContext<SheetMotion | null>(null);

/** Null outside a route sheet: the glass stays as it is and titles do not move. */
export const useSheetMotion = () => useContext(SheetMotionContext);
