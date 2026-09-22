import React, { memo } from "react";
import { StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GlassNavButton } from "../ui/GlassNavButton";
import { FLOATING_BACK_LEFT, FLOATING_BACK_TOP } from "./sheetMotion";

/**
 * A session preview's way back to Oturumlar while iOS 26's system route
 * sheet is up: hierarchical navigation, so a Liquid Glass Back in the
 * navigation layer at the screen's top-leading corner, outside the sheet
 * (the HIG's sheet Back is for a step inside it). Car mode mounts it above
 * the map; the system sheet is presented over the whole window, so it rises
 * over this button and covers it at the full height, where the sheet shows
 * the same control itself. Same place and size as the gorhom sheet's
 * floating button (RoutePlanSheet).
 *
 * Its ancestors never animate opacity (the glass would stop drawing):
 * `visible` fades the glass itself.
 */
function PreviewBackButtonComponent({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  const { top: safeTop } = useSafeAreaInsets();
  return (
    <GlassNavButton
      visible={visible}
      onPress={onPress}
      onAccessibilityEscape={onPress}
      accessibilityLabel="Oturumlara dön"
      style={[styles.button, { top: safeTop + FLOATING_BACK_TOP }]}
    />
  );
}

export const PreviewBackButton = memo(PreviewBackButtonComponent);

const styles = StyleSheet.create({
  button: {
    position: "absolute",
    left: FLOATING_BACK_LEFT,
    // Above car mode's header and orb (1000-1002), which have left by now.
    zIndex: 1003,
  },
});
