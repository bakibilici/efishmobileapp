/**
 * The assistant orb, "ribbon" style: a dark glass sphere with a band of light
 * across its middle. The band lies almost flat while nobody talks and turns
 * into a travelling, twisting wave with the voice — the driver's while AKBA
 * listens, AKBA's while it speaks.
 *
 * The band is three SVG ribbons (warm above, cool below, white on top) whose
 * outlines are rebuilt every frame on the UI thread; everything soft around
 * them is a static radial gradient that only moves, scales and fades. Drop-in
 * replacement for the other orbs in CarModeView (same props plus the optional
 * agent track) — switch back there with ORB_STYLE.
 */
import { useTrackVolume } from "@livekit/react-native";
import type { RemoteAudioTrack } from "livekit-client";
import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

import { DriveSessionState } from "../services/DriveSessionStore";
import { VoiceLevelBus } from "../services/VoiceLevelBus";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const BOX = 118; // same footprint as the other orbs
const SPHERE = 104;
const MID = SPHERE / 2;
const SPAN = MID - 3; // the band stops just short of the glass
const SEGMENTS = 24;

/** Speech is quiet in absolute terms; lift it so a normal voice fills 0..1. */
const normalize = (raw: number, floor: number, gain: number) => {
  const level = (Math.sqrt(Math.min(Math.max(raw, 0), 1)) - floor) * gain;
  return Math.min(Math.max(level, 0), 1);
};

/** Holds the latest level, then lets it fall if the source goes quiet. */
const pushLevel = (target: SharedValue<number>, level: number) => {
  target.value = withSequence(
    withTiming(level, { duration: 50 }),
    withDelay(650, withTiming(0, { duration: 450 })),
  );
};

interface RibbonShape {
  /** Spatial frequency of the upper and lower edge, in radians across the band. */
  kTop: number;
  kBottom: number;
  /** How fast each edge travels relative to the shared clock. */
  speedTop: number;
  speedBottom: number;
  offset: number;
  /** Thickness and swing relative to the white ribbon. */
  weight: number;
  /** Vertical shift away from the centre, grows with the voice. */
  lift: number;
}

const WARM: RibbonShape = { kTop: 2.5, kBottom: 3.3, speedTop: 1.0, speedBottom: 1.31, offset: 0.9, weight: 1.15, lift: -1 };
const COOL: RibbonShape = { kTop: 3.1, kBottom: 2.3, speedTop: 1.17, speedBottom: 0.88, offset: 2.6, weight: 1.15, lift: 1 };
const WHITE: RibbonShape = { kTop: 2.8, kBottom: 2.8, speedTop: 1.08, speedBottom: 1.12, offset: 0.0, weight: 0.62, lift: 0 };

/** The closed outline of one ribbon: upper edge left to right, lower edge back. */
function ribbonOutline(shape: RibbonShape, clock: number, energy: number): string {
  "worklet";
  const swing = (1.6 + 17 * energy) * shape.weight * (1 + 0.22 * energy * Math.sin(clock * 2.7) * Math.sin(clock * 1.3 + 1));
  const half = (0.9 + 5.2 * energy) * shape.weight;
  const centre = MID + shape.lift * (0.8 + 3.4 * energy);
  const phaseTop = clock * shape.speedTop + shape.offset;
  const phaseBottom = clock * shape.speedBottom + shape.offset + 1.1;

  const xs: number[] = [];
  const top: number[] = [];
  const bottom: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = (i / SEGMENTS) * 2 - 1;
    const taper = Math.pow(1 - u * u, 1.35);
    const waveTop = 0.76 * Math.sin(shape.kTop * u + phaseTop) + 0.24 * Math.sin(2.3 * shape.kTop * u - 1.7 * phaseTop);
    const waveBottom =
      0.76 * Math.sin(shape.kBottom * u + phaseBottom) + 0.24 * Math.sin(1.9 * shape.kBottom * u + 1.3 * phaseBottom);
    xs.push(MID + u * SPAN);
    top.push(centre + taper * (swing * waveTop - half));
    bottom.push(centre + taper * (swing * waveBottom + half));
  }

  const r = (v: number) => Math.round(v * 10) / 10;
  let d = `M${r(xs[0])} ${r(top[0])}`;
  for (let i = 1; i < SEGMENTS; i++) {
    d += `Q${r(xs[i])} ${r(top[i])} ${r((xs[i] + xs[i + 1]) / 2)} ${r((top[i] + top[i + 1]) / 2)}`;
  }
  d += `L${r(xs[SEGMENTS])} ${r(bottom[SEGMENTS])}`;
  for (let i = SEGMENTS - 1; i > 0; i--) {
    d += `Q${r(xs[i])} ${r(bottom[i])} ${r((xs[i] + xs[i - 1]) / 2)} ${r((bottom[i] + bottom[i - 1]) / 2)}`;
  }
  return `${d}L${r(xs[0])} ${r(bottom[0])}Z`;
}

const Ribbon = ({
  id,
  shape,
  stops,
  clock,
  energy,
  glow,
}: {
  id: string;
  shape: RibbonShape;
  stops: { offset: number; color: string; opacity: number }[];
  clock: SharedValue<number>;
  energy: SharedValue<number>;
  glow: number;
}) => {
  const outline = useDerivedValue(() => ribbonOutline(shape, clock.value, energy.value));
  const fillProps = useAnimatedProps(() => ({ d: outline.value }));
  const glowProps = useAnimatedProps(() => ({ d: outline.value, strokeWidth: 3 + 7 * energy.value }));
  return (
    <View style={[styles.layer, styles.light]}>
      <Svg width={SPHERE} height={SPHERE}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={SPHERE} y2="0" gradientUnits="userSpaceOnUse">
            {stops.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} stopOpacity={stop.opacity} />
            ))}
          </LinearGradient>
        </Defs>
        {/* A wide, faint stroke of the same outline stands in for the bloom */}
        <AnimatedPath
          animatedProps={glowProps}
          fill="none"
          stroke={`url(#${id})`}
          strokeOpacity={glow}
          strokeLinejoin="round"
        />
        <AnimatedPath animatedProps={fillProps} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
};

/** A soft disc of one colour that fades to nothing at its edge. */
const Glow = ({ id, color, size, core = 0.9 }: { id: string; color: string; size: number; core?: number }) => (
  <Svg width={size} height={size}>
    <Defs>
      <RadialGradient id={id} cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor={color} stopOpacity={core} />
        <Stop offset="0.45" stopColor={color} stopOpacity={core * 0.5} />
        <Stop offset="1" stopColor={color} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
  </Svg>
);

/** Reads AKBA's track level natively (every 40 ms) without re-rendering the orb. */
const TrackLevelProbe = ({ track, target }: { track: RemoteAudioTrack; target: SharedValue<number> }) => {
  const volume = useTrackVolume(track);
  useEffect(() => {
    pushLevel(target, normalize(volume, 0.06, 2.6));
  }, [volume, target]);
  return null;
};

export const AssistantOrbRibbon = ({
  state,
  audioLevel,
  agentTrack,
}: {
  state: DriveSessionState;
  audioLevel: number;
  agentTrack?: RemoteAudioTrack | null;
}) => {
  const clock = useSharedValue(0); // radians, runs faster with the voice
  const energy = useSharedValue(0.04); // 0..1, what the band actually shows
  const rest = useSharedValue(0.04); // the floor each state keeps without a voice
  const pace = useSharedValue(1);
  const mic = useSharedValue(0);
  const agent = useSharedValue(0);
  const listenTo = useSharedValue(0); // 0 nobody, 1 the driver, 2 AKBA
  const presence = useSharedValue(0.55); // dim when AKBA is not connected
  const breath = useSharedValue(0);
  const floatY = useSharedValue(0);

  useEffect(() => {
    breath.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true);
    floatY.value = withRepeat(
      withSequence(
        withTiming(-3, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
        withTiming(3, { duration: 2100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
    return () => {
      cancelAnimation(breath);
      cancelAnimation(floatY);
    };
  }, [breath, floatY]);

  useEffect(() => {
    const connecting = state === DriveSessionState.AI_CONNECTING;
    const listening = state === DriveSessionState.AI_LISTENING;
    const speaking = state === DriveSessionState.AI_SPEAKING;
    const active = connecting || listening || speaking;

    listenTo.value = listening ? 1 : speaking ? 2 : 0;
    presence.value = withTiming(active ? 1 : 0.55, { duration: 450 });
    pace.value = withTiming(connecting ? 2.6 : 1, { duration: 450 });
    rest.value = withTiming(connecting ? 0.3 : speaking ? 0.16 : listening ? 0.09 : 0.04, { duration: 450 });
  }, [state, listenTo, presence, pace, rest]);

  // The room's speaker levels: the only source for the driver's voice, and the
  // fallback for AKBA's when its track is not available.
  useEffect(
    () =>
      VoiceLevelBus.subscribe((levels) => {
        pushLevel(mic, normalize(levels.mic, 0.05, 1.5));
        if (!agentTrack) pushLevel(agent, normalize(levels.agent, 0.05, 1.5));
      }),
    [mic, agent, agentTrack],
  );

  useEffect(() => {
    if (agentTrack || state !== DriveSessionState.AI_SPEAKING) return;
    if (audioLevel > 0) pushLevel(agent, normalize(audioLevel, 0.05, 1.5));
  }, [audioLevel, agentTrack, state, agent]);

  useFrameCallback((frame) => {
    const dt = Math.min(frame.timeSincePreviousFrame ?? 16, 50) / 1000;
    const voice = listenTo.value === 1 ? mic.value : listenTo.value === 2 ? agent.value : 0;
    const floor = rest.value * (1 + 0.35 * (breath.value - 0.5));
    const target = Math.max(floor, floor + (1 - floor) * voice);
    // Rise with the syllable, fall more slowly, the way a meter does.
    const rate = target > energy.value ? 16 : 4.2;
    energy.value += (target - energy.value) * Math.min(1, rate * dt);
    clock.value += dt * (0.75 + 3.4 * energy.value) * pace.value;
  });

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));

  const sphereStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.02 * breath.value + 0.07 * energy.value }],
  }));

  const auraStyle = useAnimatedStyle(() => ({
    opacity: presence.value * (0.18 + 0.6 * energy.value),
    transform: [{ scale: 1 + 0.16 * energy.value }],
  }));

  const bandStyle = useAnimatedStyle(() => ({ opacity: presence.value }));

  const warmBloomStyle = useAnimatedStyle(() => ({
    opacity: presence.value * (0.16 + 0.62 * energy.value),
    transform: [
      { translateX: -9 + 8 * Math.sin(clock.value * 0.6) },
      { translateY: -3 - 7 * energy.value },
      { scaleX: 1.35 },
      { scaleY: 0.34 + 0.6 * energy.value },
    ],
  }));

  const coolBloomStyle = useAnimatedStyle(() => ({
    opacity: presence.value * (0.18 + 0.62 * energy.value),
    transform: [
      { translateX: 9 + 8 * Math.sin(clock.value * 0.5 + 2) },
      { translateY: 3 + 7 * energy.value },
      { scaleX: 1.35 },
      { scaleY: 0.34 + 0.6 * energy.value },
    ],
  }));

  const whiteBloomStyle = useAnimatedStyle(() => ({
    opacity: presence.value * (0.2 + 0.6 * energy.value),
    transform: [{ scaleX: 1.5 }, { scaleY: 0.22 + 0.5 * energy.value }],
  }));

  const flareStyle = useAnimatedStyle(() => ({ opacity: presence.value * (0.12 + 0.75 * energy.value) }));

  const rimStyle = useAnimatedStyle(() => ({ opacity: 0.6 + 0.4 * presence.value * (0.4 + 0.6 * energy.value) }));

  return (
    <View style={styles.box} pointerEvents="none">
      {agentTrack ? <TrackLevelProbe track={agentTrack} target={agent} /> : null}
      <Animated.View style={[styles.fill, styles.center, floatStyle]}>
        {/* The sphere clips its own content, so its shadow is a layer of its own */}
        <View style={styles.shadow}>
          <Glow id="ribbon-shadow" color="#000000" size={132} core={0.8} />
        </View>
        {/* Light spilling past the glass: cool to the left, warm to the right */}
        <Animated.View style={[styles.aura, auraStyle]}>
          <View style={[styles.auraBlob, { left: 0, top: 22 }]}>
            <Glow id="ribbon-aura-cool" color="#3D8BFF" size={100} core={0.7} />
          </View>
          <View style={[styles.auraBlob, { right: 0, top: 22 }]}>
            <Glow id="ribbon-aura-warm" color="#FF8A4C" size={100} core={0.7} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.sphere, sphereStyle]}>
          {/* Smoked glass: a little lighter low in the middle, near black at the rim */}
          <Svg width={SPHERE} height={SPHERE} style={styles.layer}>
            <Defs>
              <RadialGradient id="ribbon-glass" cx="50%" cy="58%" r="62%">
                <Stop offset="0" stopColor="#262A36" stopOpacity={1} />
                <Stop offset="0.6" stopColor="#0D0F16" stopOpacity={1} />
                <Stop offset="1" stopColor="#020308" stopOpacity={1} />
              </RadialGradient>
            </Defs>
            <Circle cx={MID} cy={MID} r={MID} fill="url(#ribbon-glass)" />
          </Svg>

          <Animated.View style={[styles.fill, bandStyle]}>
            <Animated.View style={[styles.bloom, styles.light, warmBloomStyle]}>
              <Glow id="ribbon-bloom-warm" color="#FF4B2B" size={72} />
            </Animated.View>
            <Animated.View style={[styles.bloom, styles.light, coolBloomStyle]}>
              <Glow id="ribbon-bloom-cool" color="#1F6BFF" size={72} />
            </Animated.View>
            <Animated.View style={[styles.bloom, styles.light, whiteBloomStyle]}>
              <Glow id="ribbon-bloom-white" color="#FFFFFF" size={72} core={0.8} />
            </Animated.View>

            <Ribbon
              id="ribbon-warm"
              shape={WARM}
              clock={clock}
              energy={energy}
              glow={0.3}
              stops={[
                { offset: 0, color: "#FF375F", opacity: 0 },
                { offset: 0.22, color: "#FF3B30", opacity: 0.95 },
                { offset: 0.55, color: "#FF9F0A", opacity: 0.95 },
                { offset: 0.82, color: "#FF5E8A", opacity: 0.9 },
                { offset: 1, color: "#FF5E8A", opacity: 0 },
              ]}
            />
            <Ribbon
              id="ribbon-cool"
              shape={COOL}
              clock={clock}
              energy={energy}
              glow={0.3}
              stops={[
                { offset: 0, color: "#5E5CE6", opacity: 0 },
                { offset: 0.2, color: "#0A84FF", opacity: 0.95 },
                { offset: 0.5, color: "#64D2FF", opacity: 0.95 },
                { offset: 0.8, color: "#5E5CE6", opacity: 0.9 },
                { offset: 1, color: "#5E5CE6", opacity: 0 },
              ]}
            />
            <Ribbon
              id="ribbon-white"
              shape={WHITE}
              clock={clock}
              energy={energy}
              glow={0.22}
              stops={[
                { offset: 0, color: "#FFFFFF", opacity: 0 },
                { offset: 0.18, color: "#FFFFFF", opacity: 0.9 },
                { offset: 0.5, color: "#FFFFFF", opacity: 1 },
                { offset: 0.82, color: "#FFFFFF", opacity: 0.9 },
                { offset: 1, color: "#FFFFFF", opacity: 0 },
              ]}
            />

            {/* Where the band meets the glass */}
            <Animated.View style={[styles.layer, styles.light, flareStyle]}>
              <View style={[styles.flare, { left: -13 }]}>
                <Glow id="ribbon-flare-left" color="#9CC8FF" size={34} />
              </View>
              <View style={[styles.flare, { right: -13 }]}>
                <Glow id="ribbon-flare-right" color="#FFD2A6" size={34} />
              </View>
            </Animated.View>
          </Animated.View>

          {/* Glass: a prismatic edge, a faint highlight up top, depth at the rim */}
          <Animated.View style={[styles.layer, rimStyle]}>
            <Svg width={SPHERE} height={SPHERE}>
              <Defs>
                <LinearGradient id="ribbon-rim" x1="0" y1="0.35" x2="1" y2="0.65">
                  <Stop offset="0" stopColor="#5AA9FF" stopOpacity={0.95} />
                  <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0.3} />
                  <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0.3} />
                  <Stop offset="1" stopColor="#FFB070" stopOpacity={0.95} />
                </LinearGradient>
                <RadialGradient id="ribbon-specular" cx="36%" cy="16%" r="36%">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.2} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </RadialGradient>
                <RadialGradient id="ribbon-depth" cx="50%" cy="50%" r="50%">
                  <Stop offset="0.7" stopColor="#000000" stopOpacity={0} />
                  <Stop offset="0.9" stopColor="#000000" stopOpacity={0.4} />
                  <Stop offset="0.94" stopColor="#C9D6FF" stopOpacity={0.05} />
                  <Stop offset="1" stopColor="#C9D6FF" stopOpacity={0.32} />
                </RadialGradient>
              </Defs>
              <Circle cx={MID} cy={MID} r={MID} fill="url(#ribbon-depth)" />
              <Circle cx={MID} cy={MID} r={MID} fill="url(#ribbon-specular)" />
              <Circle cx={MID} cy={MID} r={MID - 1.25} fill="none" stroke="url(#ribbon-rim)" strokeWidth={2.5} />
            </Svg>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  box: { width: BOX, height: BOX, alignItems: "center", justifyContent: "center", overflow: "visible" },
  fill: { ...StyleSheet.absoluteFillObject },
  center: { alignItems: "center", justifyContent: "center" },
  layer: { position: "absolute", top: 0, left: 0, width: SPHERE, height: SPHERE },
  aura: { position: "absolute", width: 156, height: 144 },
  auraBlob: { position: "absolute" },
  sphere: {
    width: SPHERE,
    height: SPHERE,
    borderRadius: SPHERE / 2,
    overflow: "hidden",
    backgroundColor: "#05060B",
    // Lets the lights inside blend with each other only, not with the map behind.
    isolation: "isolate",
  },
  shadow: { position: "absolute", top: (BOX - 132) / 2 + 7, left: (BOX - 132) / 2, opacity: 0.55 },
  bloom: { position: "absolute", left: (SPHERE - 72) / 2, top: (SPHERE - 72) / 2, width: 72, height: 72 },
  flare: { position: "absolute", top: MID - 17, width: 34, height: 34 },
  light: { mixBlendMode: "screen" },
});
