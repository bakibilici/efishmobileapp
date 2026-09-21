import {
  SCROLLABLE_STATUS,
  useBottomSheetInternal,
  useScrollEventsHandlersDefault,
  type ScrollEventHandlerCallbackType,
  type ScrollEventsHandlersHookType,
} from "@gorhom/bottom-sheet";
import { useCallback } from "react";
import { runOnJS } from "react-native-reanimated";

/**
 * gorhom's default scroll handlers, plus a report of whether content sits
 * under the sheet's fixed bar (offset above 1 pt). While a drag moves the
 * sheet the content is locked: the scroll view reports the finger's offset,
 * gorhom snaps it back to its lock position, and the finger's report can
 * reach JS after the snap-back one. So a locked event reports the position
 * gorhom holds the content at, not the one in the event.
 *
 * Build it once per sheet with a stable callback, e.g. a useState setter.
 */
export const scrollHandlersReportingScrolled = (
  onScrolledChange: (scrolled: boolean) => void,
): ScrollEventsHandlersHookType =>
  function useScrollHandlersReportingScrolled(scrollableRef, scrollableContentOffsetY) {
    const handlers = useScrollEventsHandlersDefault(scrollableRef, scrollableContentOffsetY);
    const { animatedScrollableStatus } = useBottomSheetInternal();
    const defaultOnScroll = handlers.handleOnScroll;

    const handleOnScroll = useCallback<ScrollEventHandlerCallbackType>(
      (event, context) => {
        "worklet";
        defaultOnScroll?.(event, context);
        // The default handler has just set the lock position when locked.
        const offset =
          animatedScrollableStatus.value === SCROLLABLE_STATUS.UNLOCKED
            ? event.contentOffset.y
            : scrollableContentOffsetY.value;
        runOnJS(onScrolledChange)(offset > 1);
      },
      [defaultOnScroll, animatedScrollableStatus, scrollableContentOffsetY],
    );

    return { ...handlers, handleOnScroll };
  };
