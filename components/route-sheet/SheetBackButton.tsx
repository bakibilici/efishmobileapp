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
import {
  SHEET_BACK_REVEAL_START,
  SHEET_BACK_SIZE,
  SHEET_CLOSE_SIZE,
  useSheetMotion,
} from "./sheetMotion";

/**
 * Level with a panel title's first line: the scroll content's top padding
 * (4) and the title's margin (2), then the 29 pt line centred on the circle.
 */
const TOP = 4;

/**
 * The gorhom sheet's own back button: a compact frosted circle at the left
 * of the panel's title, pinned under the handle while the content scrolls.
 *
 * An inner panel's (`pinned`: the stops, a break's page) is a step inside
 * the sheet and shows at every stop. A preview overview's "Oturumlara dön"
 * leaves the sheet, so below the highest stop it is the floating button
 * outside it (RoutePlanSheet); this one takes touches and VoiceOver focus
 * from the handover, as the floating one leaves, and fades in over the last
 * stretch of the rise (the title slides right as it does,
 * SHEET_BACK_REVEAL_START). Frosted, because Liquid Glass does not draw
 * under a changing opacity, and a glass circle on the sheet's blur would be
 * a material on a material.
 */
function SheetBackButtonComponent({
  label,
  onPress,
  active,
  pinned = false,
}: {
  label: string;
  onPress: () => void;
  /** Past the handover: the floating button has left and this one leads back. */
  active: boolean;
  /** An inner panel's step back: shown at every stop, no reveal. */
  pinned?: boolean;
}) {
  const motion = useSheetMotion();
  const resting = useSharedValue(0);
  const progress = motion?.topProgress ?? resting;
  const revealStyle = useAnimatedStyle(() => {
    if (pinned) return { opacity: 1, transform: [{ scale: 1 }] };
    const shown = interpolate(
      progress.value,
      [SHEET_BACK_REVEAL_START, 1],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity: shown, transform: [{ scale: 0.85 + 0.15 * shown }] };
  }, [pinned]);

  return (
    <Animated.View pointerEvents="box-none" style={[styles.backSlot, revealStyle]}>
      <GlassNavButton
        visible={pinned || active}
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

/**
 * A live route's Close, the standard xmark at the sheet's top-trailing
 * corner, level with the title's first line (Maps, Find My): it puts the
 * sheet away, as a swipe down does. Frosted for the same reason as the back
 * button; `visible` fades it out as the sheet sets off to close.
 */
function SheetCloseButtonComponent({
  onPress,
  visible,
}: {
  onPress: () => void;
  visible: boolean;
}) {
  return (
    <GlassNavButton
      symbol="xmark"
      visible={visible}
      size={SHEET_CLOSE_SIZE}
      material="frosted"
      onPress={onPress}
      onAccessibilityEscape={onPress}
      accessibilityLabel="Kapat"
      accessibilityHint="Rota özetini gizler."
      style={styles.closeSlot}
    />
  );
}

export const SheetCloseButton = memo(SheetCloseButtonComponent);

const styles = StyleSheet.create({
  backSlot: {
    position: "absolute",
    top: TOP,
    left: SIDE_MARGIN,
    zIndex: 1,
  },
  closeSlot: {
    position: "absolute",
    top: TOP,
    right: SIDE_MARGIN,
    zIndex: 1,
  },
});
