import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import React, { memo, useEffect, useMemo, useState } from "react";
import { Animated, Platform, StyleSheet } from "react-native";

import {
  ANCHOR_GAP,
  BAND_FADE,
  BAND_LAYERS,
  BAND_OVERSCAN,
  bandSolidHeight,
  statusCollapseOffset,
} from "./headerMetrics";

export type HeaderBackdropProps = {
  safeTop: number;
  /** The search row and the chips, measured. */
  controlsHeight: number;
  /** The status capsule and whatever sits under it, measured. */
  statusHeight: number;
  /** The header's own collapse value (0 expanded, 1 compact), so both move as one. */
  collapse: Animated.Value;
  /** The header's hide slide, so the band leaves with it instead of only fading. */
  slide: Animated.Value;
  visible: boolean;
  isDark: boolean;
};

/**
 * The wash over the blur — the old scrim's job, now across the whole band.
 * It loses a little of itself on the way down (`top` → `soft`) and the fade
 * carries `soft` to nothing, so the band ends without an edge.
 */
const WASH = {
  dark: { top: "rgba(0,0,0,0.24)", soft: "rgba(0,0,0,0.12)", none: "rgba(0,0,0,0)" },
  light: {
    top: "rgba(255,255,255,0.20)",
    soft: "rgba(255,255,255,0.09)",
    none: "rgba(255,255,255,0)",
  },
} as const;

/**
 * The strip behind the status bar, as it was before the band: the band covers
 * it on iOS and crossfades with it, and on Android — where expo-blur does not
 * blur — it is the whole backdrop.
 */
const STRIP_SCRIM = {
  dark: ["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"] as const,
  light: ["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"] as const,
};

/**
 * The blurred band behind the map header: the whole width of the screen,
 * from behind the status bar down to just under the status capsule, with the
 * map blurred and washed underneath so the search field, the filter circle,
 * the tier chips and the capsule sit on one backdrop instead of floating
 * over live map detail.
 *
 * Three things keep it honest. It is bounded — never the whole screen, only
 * the header's own block — so the map below stays sharp and cheap. It ends
 * in a falloff rather than a line: BAND_LAYERS stacks blurs that stop at
 * different depths (see headerMetrics), the weakest last. And it follows the
 * header: the same collapse value moves the band up by exactly the distance
 * the capsule travels, so the band always stops just under whatever the
 * header currently is.
 *
 * It is a backdrop, never a parent: the glass controls stay outside it,
 * because glass under a view whose opacity animates stops drawing
 * (expo/expo#41024). Memoised, because the map screen around it re-renders
 * on every position update and six blur views are not worth reconciling for
 * a header that has not moved.
 */
function HeaderBackdropComponent({
  safeTop,
  controlsHeight,
  statusHeight,
  collapse,
  slide,
  visible,
  isDark,
}: HeaderBackdropProps) {
  // Mounted while it is seen, and a moment longer: the band fades instead of
  // popping when the search or the filters take the header's place.
  const [mounted, setMounted] = useState(visible);
  const [fade] = useState(() => new Animated.Value(visible ? 1 : 0));
  useEffect(() => {
    if (visible) setMounted(true);
    const animation = Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: visible ? 180 : 140,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
    return () => animation.stop();
  }, [fade, visible]);

  // The band travels exactly as far as the capsule, on the same value.
  const travel = useMemo(
    () =>
      collapse.interpolate({
        inputRange: [0, 1],
        outputRange: [0, statusCollapseOffset(controlsHeight)],
      }),
    [collapse, controlsHeight],
  );

  // The strip and the band are one crossfade: whatever the band is not
  // covering, the strip is.
  const stripFade = useMemo(
    () => fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [fade],
  );

  const scrim = STRIP_SCRIM[isDark ? "dark" : "light"];
  const stripHeight = safeTop + ANCHOR_GAP;

  // Android has no blur: the scrim as it was.
  if (Platform.OS !== "ios") {
    return (
      <LinearGradient
        pointerEvents="none"
        colors={scrim}
        style={[styles.strip, { height: stripHeight }]}
      />
    );
  }

  const wash = WASH[isDark ? "dark" : "light"];
  const solid = BAND_OVERSCAN + bandSolidHeight(safeTop, controlsHeight, statusHeight);

  return (
    <>
      {/* Behind the status bar whenever the band is not: the search and the
          filters take the capsule's place without covering the top strip, so
          without this the clock and the battery would sit on live map. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.strip, { height: stripHeight, opacity: stripFade }]}
      >
        <LinearGradient colors={scrim} style={StyleSheet.absoluteFill} />
      </Animated.View>
      {mounted ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.band,
            {
              height: solid + BAND_FADE,
              opacity: fade,
              // Two moves on one band: the collapse, and the header's own
              // slide off the top, so the glass never travels over
              // unblurred map.
              transform: [{ translateY: travel }, { translateY: slide }],
            },
          ]}
        >
          {BAND_LAYERS.map((layer) => (
            <BlurView
              key={layer.reach}
              tint={isDark ? "systemUltraThinMaterialDark" : "systemUltraThinMaterialLight"}
              intensity={layer.intensity}
              style={[styles.layer, { height: solid + BAND_FADE * layer.reach }]}
            />
          ))}
          <LinearGradient
            // Full strength down to the screen's top edge, whatever of the
            // band is drawn above it, and easing off from there to the last row.
            colors={[wash.top, wash.top, wash.soft]}
            locations={[0, BAND_OVERSCAN / solid, 1]}
            style={[styles.layer, { height: solid }]}
          />
          <LinearGradient
            colors={[wash.soft, wash.none]}
            style={[styles.layer, { top: solid, height: BAND_FADE }]}
          />
        </Animated.View>
      ) : null}
    </>
  );
}

export const HeaderBackdrop = memo(HeaderBackdropComponent);

const styles = StyleSheet.create({
  strip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  band: {
    position: "absolute",
    top: -BAND_OVERSCAN,
    left: 0,
    right: 0,
  },
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
});
