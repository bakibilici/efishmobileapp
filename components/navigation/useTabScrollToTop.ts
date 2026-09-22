import { useScrollToTop } from "@react-navigation/native";
import { useRef, useState, type RefObject } from "react";
import {
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type SectionList,
} from "react-native";

type ScrollTarget = ScrollView | SectionList<any, any>;

/**
 * Tapping the tab of the page on screen scrolls it back to its top, as iOS
 * tab bars do (React Navigation's `useScrollToTop` decides when: the tab is
 * focused and the page is its stack's first).
 *
 * On iOS the top is not y = 0. The page sits under a transparent large-title
 * header (`contentInsetAdjustmentBehavior="automatic"`), so at rest the list
 * is at y = -adjustedContentInset.top, and y = 0 would leave the first rows
 * under a collapsed title. React Native does not report that inset, so the
 * rest offset is read from where drags begin: a drag cannot begin above the
 * top, and the first one begins at rest. Until the list is first dragged it
 * is still at rest, and a tap does nothing. React Native clamps a scroll
 * above y = 0 unless `scrollToOverflowEnabled` is set: spread the returned
 * props on the list. Android's header is not transparent: its top is y = 0.
 */
export function useTabScrollToTop(target: RefObject<ScrollTarget | null>) {
  const restY = useRef<number | null>(Platform.OS === "ios" ? null : 0);

  // What useScrollToTop scrolls: this stands in for the list and sends it to its rest offset.
  const [scrollable] = useState(() => ({
    current: {
      scrollTo: ({ animated }: { animated?: boolean }) => {
        const y = restY.current;
        const node = target.current;
        if (y === null || !node) return;
        // A ScrollView scrolls itself; a SectionList through its ScrollView.
        const view = "scrollTo" in node ? node : node.getScrollResponder();
        view?.scrollTo({ x: 0, y, animated });
      },
    },
  }));
  useScrollToTop(scrollable);

  const [scrollProps] = useState(() => ({
    scrollToOverflowEnabled: true,
    onScrollBeginDrag: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS !== "ios") return;
      const y = event.nativeEvent.contentOffset.y;
      restY.current = restY.current === null ? y : Math.min(restY.current, y);
    },
  }));
  return scrollProps;
}
