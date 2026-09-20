/**
 * The assistant orb, "aurora" style: a glass sphere with coloured light moving
 * inside it, which swells and brightens with AKBA's voice.
 *
 * Every layer is a static SVG radial gradient; only transforms and opacity are
 * animated, on the UI thread, so it stays smooth while the map and the voice
 * pipeline are busy. Drop-in replacement for the classic orb in CarModeView
 * (same props) — switch back there with ORB_STYLE = "classic".
 */
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";

import { DriveSessionState } from "../services/DriveSessionStore";

const BOX = 118; // same footprint as the classic orb
const SPHERE = 104;
const LOOP_MS = 14000;
const TAU = Math.PI * 2;

interface Blob {
  id: string;
  color: string;
  size: number;
  /** Orbit radius at rest, in px. */
  orbit: number;
  /** Whole turns per loop (sign = direction); integers keep the loop seamless. */
  turns: number;
  /** Whole breaths per loop. */
  breaths: number;
  phase: number;
}

const BLOBS: Blob[] = [
  { id: "magenta", color: "#FF2D92", size: 96, orbit: 17, turns: 1, breaths: 2, phase: 0.0 },
  { id: "violet", color: "#7B5CFF", size: 104, orbit: 15, turns: -1, breaths: 3, phase: 0.21 },
  { id: "blue", color: "#1E8BFF", size: 110, orbit: 19, turns: 2, breaths: 2, phase: 0.46 },
  { id: "cyan", color: "#2FE6F0", size: 88, orbit: 22, turns: -2, breaths: 3, phase: 0.69 },
  { id: "amber", color: "#FF9A4D", size: 66, orbit: 25, turns: 3, breaths: 1, phase: 0.87 },
];

/** A soft disc of one colour that fades to nothing at its edge. */
const Glow = ({ id, color, size, core = 0.95 }: { id: string; color: string; size: number; core?: number }) => (
  <Svg width={size} height={size}>
    <Defs>
      <RadialGradient id={id} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={color} stopOpacity={core} />
        <Stop offset="0.45" stopColor={color} stopOpacity={core * 0.55} />
        <Stop offset="1" stopColor={color} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
  </Svg>
);

const BlobLayer = ({
  blob,
  t,
  energy,
  presence,
}: {
  blob: Blob;
  t: SharedValue<number>;
  energy: SharedValue<number>;
  presence: SharedValue<number>;
}) => {
  const style = useAnimatedStyle(() => {
    const angle = (t.value * blob.turns + blob.phase) * TAU;
    const radius = blob.orbit * (0.55 + 0.8 * energy.value);
    const breath = Math.sin((t.value * blob.breaths + blob.phase) * TAU);
    return {
      opacity: Math.min(1, (0.62 + 0.38 * energy.value) * presence.value),
      transform: [
        { translateX: Math.cos(angle) * radius },
        { translateY: Math.sin(angle) * radius },
        { scale: 0.92 + 0.09 * breath + 0.26 * energy.value },
      ],
    };
  });
  return (
    <Animated.View style={[styles.centered, { width: blob.size, height: blob.size }, style]}>
      <Glow id={`orb-${blob.id}`} color={blob.color} size={blob.size} />
    </Animated.View>
  );
};

export const AssistantOrbAurora = ({
  state,
  audioLevel,
}: {
  state: DriveSessionState;
  audioLevel: number;
}) => {
  const t = useSharedValue(0); // endless 0→1 loop that drives every orbit
  const swirl = useSharedValue(0); // rotation of the whole light field
  const breath = useSharedValue(0); // 0↔1, the resting pulse
  const breathAmp = useSharedValue(0); // how much of that pulse shows
  const energy = useSharedValue(0); // 0..1, follows the voice
  const presence = useSharedValue(0.5); // dim when AKBA is not connected
  const floatY = useSharedValue(0);

  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false);
    breath.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, true);
    floatY.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
        withTiming(3, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => {
      cancelAnimation(t);
      cancelAnimation(swirl);
      cancelAnimation(breath);
      cancelAnimation(floatY);
    };
  }, [t, swirl, breath, floatY]);

  useEffect(() => {
    const connecting = state === DriveSessionState.AI_CONNECTING;
    const listening = state === DriveSessionState.AI_LISTENING;
    const speaking = state === DriveSessionState.AI_SPEAKING;
    const active = connecting || listening || speaking;

    // Keep turning from wherever it is: a full extra turn from the current
    // angle loops without a visible jump when the speed changes.
    const turnMs = connecting ? 2400 : speaking ? 9000 : active ? 16000 : 30000;
    cancelAnimation(swirl);
    swirl.value = withRepeat(
      withTiming(swirl.value + 360, { duration: turnMs, easing: Easing.linear }),
      -1,
      false,
    );

    presence.value = withTiming(active ? 1 : 0.5, { duration: 450 });
    breathAmp.value = withTiming(connecting ? 0.7 : listening ? 1 : speaking ? 0.25 : 0.35, { duration: 450 });
    if (!speaking) {
      energy.value = withTiming(connecting ? 0.34 : listening ? 0.2 : 0, {
        duration: 420,
        easing: Easing.out(Easing.cubic),
      });
    }
  }, [state, swirl, presence, breathAmp, energy]);

  useEffect(() => {
    if (state !== DriveSessionState.AI_SPEAKING) return;
    // Speech levels are small numbers; lift them so normal speech fills the range.
    const level = Math.min(1, Math.sqrt(Math.min(Math.max(audioLevel, 0), 1)) * 1.25);
    energy.value = withTiming(0.42 + 0.58 * level, { duration: 130, easing: Easing.out(Easing.quad) });
  }, [audioLevel, state, energy]);

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  const auraStyle = useAnimatedStyle(() => ({
    opacity: presence.value * (0.3 + 0.5 * energy.value + 0.12 * breath.value * breathAmp.value),
    transform: [
      { rotate: `${-swirl.value}deg` },
      { scale: 1 + 0.2 * energy.value + 0.05 * breath.value * breathAmp.value },
    ],
  }));

  const sphereStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.035 * breath.value * breathAmp.value + 0.09 * energy.value }],
  }));

  const fieldStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${swirl.value}deg` }] }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: presence.value * (0.12 + 0.68 * energy.value),
    transform: [{ scale: 0.55 + 0.7 * energy.value + 0.06 * breath.value * breathAmp.value }],
  }));

  return (
    <View style={styles.box} pointerEvents="none">
      <Animated.View style={[styles.fill, styles.center, floatStyle]}>
        {/* Coloured light spilling past the glass */}
        <Animated.View style={[styles.aura, auraStyle]}>
          <View style={[styles.auraBlob, { top: 0, left: 6 }]}>
            <Glow id="orb-aura-pink" color="#FF4FA3" size={112} core={0.75} />
          </View>
          <View style={[styles.auraBlob, { bottom: 0, right: 6 }]}>
            <Glow id="orb-aura-blue" color="#2E9BFF" size={112} core={0.75} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.sphere, sphereStyle]}>
          <Animated.View style={[styles.fill, styles.center, fieldStyle]}>
            {BLOBS.map((blob) => (
              <BlobLayer key={blob.id} blob={blob} t={t} energy={energy} presence={presence} />
            ))}
          </Animated.View>

          <Animated.View style={[styles.centered, styles.core, coreStyle]}>
            <Glow id="orb-core" color="#FFFFFF" size={84} core={1} />
          </Animated.View>

          {/* Glass: darker towards the rim, a highlight top-left, a thin bright edge */}
          <Svg width={SPHERE} height={SPHERE} style={styles.centered}>
            <Defs>
              <RadialGradient id="orb-depth" cx="50%" cy="50%" r="50%">
                <Stop offset="0.55" stopColor="#050814" stopOpacity={0} />
                <Stop offset="1" stopColor="#050814" stopOpacity={0.62} />
              </RadialGradient>
              <RadialGradient id="orb-specular" cx="32%" cy="24%" r="34%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={SPHERE / 2} cy={SPHERE / 2} r={SPHERE / 2} fill="url(#orb-depth)" />
            <Circle cx={SPHERE / 2} cy={SPHERE / 2} r={SPHERE / 2} fill="url(#orb-specular)" />
            <Circle
              cx={SPHERE / 2}
              cy={SPHERE / 2}
              r={SPHERE / 2 - 0.75}
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity={0.28}
              strokeWidth={1.5}
            />
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX, alignItems: "center", justifyContent: "center", overflow: "visible" },
  fill: { ...StyleSheet.absoluteFillObject },
  center: { alignItems: "center", justifyContent: "center" },
  centered: { position: "absolute" },
  aura: { position: "absolute", width: 150, height: 150 },
  auraBlob: { position: "absolute" },
  sphere: {
    width: SPHERE,
    height: SPHERE,
    borderRadius: SPHERE / 2,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#070B1A",
  },
  core: { width: 84, height: 84 },
});
