import React, { memo } from "react";
import { StyleSheet } from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { GlassNavButton } from "../ui/GlassNavButton";
import { SIDE_MARGIN } from "./Grouped";
import { SHEET_BACK_REVEAL_START, SHEET_BACK_SIZE, useSheetMotion } from "./sheetMotion";

/**
 * Level with a panel title's first line: the scroll content's top padding
 * (4) and the title's margin (2), then the 29 pt line centred on the circle.
 */
const TOP = 4;

/**
 * The sheet's own back button, for its highest stop, where the floating one
 * would sit on the sheet: a compact frosted circle at the left of the
 * panel's title, pinned under the handle while the content scrolls. It
 * takes touches and VoiceOver focus from the handover, as the floating one
 * leaves, and fades in over the last stretch of the rise (the title slides
 * right as it does, SHEET_BACK_REVEAL_START);
 * frosted, because Liquid Glass does not draw under a changing opacity and
 * the sheet here is almost opaque.
 */
function SheetBackButtonComponent({
  label,
  onPress,
  active,
}: {
  label: string;
  onPress: () => void;
  /** Past the handover: the floating button has left and this one leads back. */
  active: boolean;
}) {
  const motion = useSheetMotion();
  const resting = useSharedValue(0);
  const progress = motion?.topProgress ?? resting;
  const revealStyle = useAnimatedStyle(() => {
    const shown = interpolate(
      progress.value,
      [SHEET_BACK_REVEAL_START, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity: shown, transform: [{ scale: 0.85 + 0.15 * shown }] };
  });

  return (
    <Animated.View pointerEvents="box-none" style={[styles.slot, revealStyle]}>
      <GlassNavButton
        visible={active}
        size={SHEET_BACK_SIZE}
        material="frosted"
        onPress={onPress}
        onAccessibilityEscape={onPress}
        accessibilityLabel={label}
      />
    </Animated.View>
  );
}

export const SheetBackButton = memo(SheetBackButtonComponent);

const styles = StyleSheet.create({
  slot: {
    position: "absolute",
    top: TOP,
    left: SIDE_MARGIN,
    zIndex: 1,
  },
});
