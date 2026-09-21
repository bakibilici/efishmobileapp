/**
 * The assistant orb, "ribbon" style: a glass sphere with a band of light
 * across its middle. In silence the band is a still line; a voice makes it
 * swell into a lens of light whose bulges drift slowly — the driver's voice
 * while AKBA listens, AKBA's while it speaks. Nothing moves on its own.
 *
 * The glass follows the app's theme: frosted and bright over the map in the
 * light theme, smoked in the dark one.
 *
 * The band is three SVG ribbons (warm above, cool below, white on top) whose
 * outlines are rebuilt every frame on the UI thread; everything soft around
 * them is a static radial gradient that only moves, scales and fades. Drop-in
 * replacement for the other orbs in CarModeView (same props plus the optional
 * agent track) — switch back there with ORB_STYLE.
 */
import { useTrackVolume } from "@livekit/react-native";
import type { RemoteAudioTrack } from "livekit-client";
import { BlurView } from "expo-blur";
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
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

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
  /** How many bulges fit along the band, in radians across it. */
  k: number;
  /** How fast the bulges drift relative to the shared clock (sign = direction). */
  drift: number;
  offset: number;
  /** Share of the swell that rises above the centre line; the rest hangs below. */
  up: number;
  /** Reach relative to the other ribbons. */
  weight: number;
}

// Warm light rises, cool light hangs, the white core stays between them.
const WARM: RibbonShape = { k: 2.3, drift: 1.0, offset: 0.6, up: 0.86, weight: 1.12 };
const COOL: RibbonShape = { k: 2.7, drift: -0.8, offset: 2.4, up: 0.14, weight: 1.12 };
const WHITE: RibbonShape = { k: 2.0, drift: 0.55, offset: 4.1, up: 0.5, weight: 0.56 };

/**
 * The closed outline of one ribbon: upper edge left to right, lower edge back.
 * The edges only ever move away from the centre line, so the ribbon swells and
 * settles like a lens instead of wriggling.
 */
function ribbonOutline(shape: RibbonShape, clock: number, energy: number): string {
  "worklet";
  const half = (0.8 + 2.4 * energy) * shape.weight;
  const swell = 22 * energy * shape.weight;
  const phase = clock * shape.drift + shape.offset;

  const xs: number[] = [];
  const top: number[] = [];
  const bottom: number[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const u = (i / SEGMENTS) * 2 - 1;
    const taper = Math.pow(1 - u * u, 1.35);
    const bulgeTop = 0.58 + 0.42 * Math.sin(shape.k * u + phase);
    const bulgeBottom = 0.58 + 0.42 * Math.sin(shape.k * u + phase + 1.7);
    xs.push(MID + u * SPAN);
    top.push(MID - taper * (half + swell * shape.up * bulgeTop));
    bottom.push(MID + taper * (half + swell * (1 - shape.up) * bulgeBottom));
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

type Tone = "light" | "dark";
type GradientStop = { offset: number; color: string; opacity: number };

interface Palette {
  /** Lights add up on dark glass; on bright glass they are laid over each other. */
  additive: boolean;
  warm: GradientStop[];
  cool: GradientStop[];
  white: GradientStop[];
  bloomWarm: string;
  bloomCool: string;
  bloom: number;
  ribbonGlow: number;
  auraCool: string;
  auraWarm: string;
  aura: number;
  shadow: { color: string; opacity: number };
}

const PALETTES: Record<Tone, Palette> = {
  dark: {
    additive: true,
    warm: [
      { offset: 0, color: "#FF375F", opacity: 0 },
      { offset: 0.22, color: "#FF3B30", opacity: 0.95 },
      { offset: 0.55, color: "#FF9F0A", opacity: 0.95 },
      { offset: 0.82, color: "#FF5E8A", opacity: 0.9 },
      { offset: 1, color: "#FF5E8A", opacity: 0 },
    ],
    cool: [
      { offset: 0, color: "#5E5CE6", opacity: 0 },
      { offset: 0.2, color: "#0A84FF", opacity: 0.95 },
      { offset: 0.5, color: "#64D2FF", opacity: 0.95 },
      { offset: 0.8, color: "#5E5CE6", opacity: 0.9 },
      { offset: 1, color: "#5E5CE6", opacity: 0 },
    ],
    white: [
      { offset: 0, color: "#FFFFFF", opacity: 0 },
      { offset: 0.18, color: "#FFFFFF", opacity: 0.9 },
      { offset: 0.5, color: "#FFFFFF", opacity: 1 },
      { offset: 0.82, color: "#FFFFFF", opacity: 0.9 },
      { offset: 1, color: "#FFFFFF", opacity: 0 },
    ],
    bloomWarm: "#FF4B2B",
    bloomCool: "#1F6BFF",
    bloom: 1,
    ribbonGlow: 0.3,
    auraCool: "#3D8BFF",
    auraWarm: "#FF8A4C",
    aura: 1,
    shadow: { color: "#000000", opacity: 0.55 },
  },
  light: {
    additive: false,
    warm: [
      { offset: 0, color: "#FF2D55", opacity: 0 },
      { offset: 0.2, color: "#FF2D55", opacity: 0.9 },
      { offset: 0.55, color: "#FF9500", opacity: 0.92 },
      { offset: 0.82, color: "#FF4F8B", opacity: 0.88 },
      { offset: 1, color: "#FF4F8B", opacity: 0 },
    ],
    cool: [
      { offset: 0, color: "#5856D6", opacity: 0 },
      { offset: 0.2, color: "#007AFF", opacity: 0.92 },
      { offset: 0.5, color: "#30B0FF", opacity: 0.92 },
      { offset: 0.8, color: "#5856D6", opacity: 0.88 },
      { offset: 1, color: "#5856D6", opacity: 0 },
    ],
    white: [
      { offset: 0, color: "#FFFFFF", opacity: 0 },
      { offset: 0.16, color: "#FFFFFF", opacity: 0.95 },
      { offset: 0.5, color: "#FFFFFF", opacity: 1 },
      { offset: 0.84, color: "#FFFFFF", opacity: 0.95 },
      { offset: 1, color: "#FFFFFF", opacity: 0 },
    ],
    bloomWarm: "#FF7A59",
    bloomCool: "#4C9BFF",
    bloom: 0.8,
    ribbonGlow: 0.22,
    auraCool: "#5AA2FF",
    auraWarm: "#FF9A6B",
    aura: 0.7,
    shadow: { color: "#1B2A44", opacity: 0.34 },
  },
};

const Ribbon = ({
  id,
  shape,
  stops,
  clock,
  energy,
  glow,
  additive,
}: {
  id: string;
  shape: RibbonShape;
  stops: GradientStop[];
  clock: SharedValue<number>;
  energy: SharedValue<number>;
  glow: number;
  additive: boolean;
}) => {
  const outline = useDerivedValue(() => ribbonOutline(shape, clock.value, energy.value));
  const fillProps = useAnimatedProps(() => ({ d: outline.value }));
  const glowProps = useAnimatedProps(() => ({ d: outline.value, strokeWidth: 3 + 7 * energy.value }));
  return (
    <View style={[styles.layer, additive && styles.additive]}>
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

/** Smoked glass: a little lighter low in the middle, near black at the rim. */
const DarkGlassBody = () => (
  <Svg width={SPHERE} height={SPHERE} style={styles.layer}>
    <Defs>
      <RadialGradient id="ribbon-glass-dark" cx="50%" cy="58%" r="62%">
        <Stop offset="0" stopColor="#262A36" stopOpacity={1} />
        <Stop offset="0.6" stopColor="#0D0F16" stopOpacity={1} />
        <Stop offset="1" stopColor="#020308" stopOpacity={1} />
      </RadialGradient>
    </Defs>
    <Circle cx={MID} cy={MID} r={MID} fill="url(#ribbon-glass-dark)" />
  </Svg>
);

/** Frosted glass over the blurred map: milky at the rim, a cool grey towards the middle. */
const LightGlassBody = () => (
  <>
    <BlurView intensity={55} tint="light" style={styles.fill} />
    <Svg width={SPHERE} height={SPHERE} style={styles.layer}>
      <Defs>
        <RadialGradient id="ribbon-glass-light" cx="50%" cy="54%" r="54%">
          <Stop offset="0" stopColor="#9DB4D6" stopOpacity={0.34} />
          <Stop offset="0.55" stopColor="#BFD2EC" stopOpacity={0.3} />
          <Stop offset="0.86" stopColor="#EAF3FF" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0.92} />
        </RadialGradient>
      </Defs>
      <Circle cx={MID} cy={MID} r={MID} fill="url(#ribbon-glass-light)" />
    </Svg>
  </>
);

/** The glass in front of the band: depth at the rim, a prismatic edge, highlights. */
const GlassFront = ({ tone }: { tone: Tone }) =>
  tone === "dark" ? (
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
  ) : (
    <Svg width={SPHERE} height={SPHERE}>
      <Defs>
        <LinearGradient id="ribbon-rim" x1="0" y1="0.35" x2="1" y2="0.65">
          <Stop offset="0" stopColor="#7DB9FF" stopOpacity={0.95} />
          <Stop offset="0.28" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="0.72" stopColor="#FFFFFF" stopOpacity={0.95} />
          <Stop offset="1" stopColor="#FFC08F" stopOpacity={0.95} />
        </LinearGradient>
        <RadialGradient id="ribbon-specular" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.85} />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="ribbon-depth" cx="50%" cy="50%" r="50%">
          <Stop offset="0.8" stopColor="#3C5078" stopOpacity={0} />
          <Stop offset="0.93" stopColor="#3C5078" stopOpacity={0.16} />
          <Stop offset="1" stopColor="#3C5078" stopOpacity={0.05} />
        </RadialGradient>
      </Defs>
      <Circle cx={MID} cy={MID} r={MID} fill="url(#ribbon-depth)" />
      {/* Window light up top, its reflection pooling at the bottom */}
      <Ellipse cx={MID - 5} cy={19} rx={33} ry={14} fill="url(#ribbon-specular)" />
      <Ellipse cx={MID + 4} cy={SPHERE - 12} rx={26} ry={8} fill="url(#ribbon-specular)" opacity={0.7} />
      <Circle cx={MID} cy={MID} r={MID - 1.25} fill="none" stroke="url(#ribbon-rim)" strokeWidth={2.5} />
      <Circle cx={MID} cy={MID} r={MID - 0.35} fill="none" stroke="#2A3B5C" strokeOpacity={0.16} strokeWidth={0.7} />
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
  tone = "light",
}: {
  state: DriveSessionState;
  audioLevel: number;
  agentTrack?: RemoteAudioTrack | null;
  tone?: Tone;
}) => {
  const palette = PALETTES[tone];
  const clock = useSharedValue(0); // radians; only a voice moves it
  const energy = useSharedValue(0.02); // 0..1, what the band actually shows
  const rest = useSharedValue(0.02); // how open the band sits without a voice
  const mic = useSharedValue(0);
  const agent = useSharedValue(0);
  const listenTo = useSharedValue(0); // 0 nobody, 1 the driver, 2 AKBA
  const presence = useSharedValue(0.55); // dim when AKBA is not connected
  const glow = useSharedValue(1); // fades in and out while connecting, steady otherwise

  useEffect(() => {
    const connecting = state === DriveSessionState.AI_CONNECTING;
    const listening = state === DriveSessionState.AI_LISTENING;
    const speaking = state === DriveSessionState.AI_SPEAKING;
    const active = connecting || listening || speaking;

    listenTo.value = listening ? 1 : speaking ? 2 : 0;
    presence.value = withTiming(active ? 1 : 0.55, { duration: 450 });
    rest.value = withTiming(connecting ? 0.1 : speaking ? 0.08 : listening ? 0.05 : 0.02, { duration: 600 });

    // Waiting is shown by light, not by motion.
    cancelAnimation(glow);
    glow.value = connecting
      ? withRepeat(withTiming(0.45, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true)
      : withTiming(1, { duration: 400 });
    return () => cancelAnimation(glow);
  }, [state, listenTo, presence, rest, glow]);

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
    const target = rest.value + (1 - rest.value) * voice;
    // Rise with the syllable, settle slowly: a swell, not a flicker.
    const rate = target > energy.value ? 11 : 2.4;
    energy.value += (target - energy.value) * Math.min(1, rate * dt);
    // The bulges drift only while there is a voice; in silence the band is still.
    clock.value += dt * 2.4 * Math.max(0, energy.value - rest.value);
  });

  const bloom = palette.bloom;
  const aura = palette.aura;

  const sphereStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * energy.value }] }));

  const auraStyle = useAnimatedStyle(() => ({
    opacity: aura * presence.value * (0.18 + 0.6 * energy.value),
    transform: [{ scale: 1 + 0.16 * energy.value }],
  }));

  const bandStyle = useAnimatedStyle(() => ({ opacity: (0.35 + 0.65 * presence.value) * glow.value }));

  // Bright glass needs a shade behind the band for the white ribbon to read.
  const shadeStyle = useAnimatedStyle(() => ({
    opacity: 0.5 + 0.5 * energy.value,
    transform: [{ scaleY: 0.7 + 0.9 * energy.value }],
  }));

  const warmBloomStyle = useAnimatedStyle(() => ({
    opacity: bloom * presence.value * (0.16 + 0.62 * energy.value),
    transform: [
      { translateX: -9 + 8 * Math.sin(clock.value * 0.6) },
      { translateY: -3 - 7 * energy.value },
      { scaleX: 1.35 },
      { scaleY: 0.34 + 0.6 * energy.value },
    ],
  }));

  const coolBloomStyle = useAnimatedStyle(() => ({
    opacity: bloom * presence.value * (0.18 + 0.62 * energy.value),
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

  const blend = palette.additive ? styles.additive : null;

  return (
    <View style={styles.box} pointerEvents="none">
      {agentTrack ? <TrackLevelProbe track={agentTrack} target={agent} /> : null}
      <View style={[styles.fill, styles.center]}>
        {/* The sphere clips its own content, so its shadow is a layer of its own */}
        <View style={[styles.shadow, { opacity: palette.shadow.opacity }]}>
          <Glow id="ribbon-shadow" color={palette.shadow.color} size={132} core={0.8} />
        </View>
        {/* Light spilling past the glass: cool to the left, warm to the right */}
        <Animated.View style={[styles.aura, auraStyle]}>
          <View style={[styles.auraBlob, { left: 0, top: 22 }]}>
            <Glow id="ribbon-aura-cool" color={palette.auraCool} size={100} core={0.7} />
          </View>
          <View style={[styles.auraBlob, { right: 0, top: 22 }]}>
            <Glow id="ribbon-aura-warm" color={palette.auraWarm} size={100} core={0.7} />
          </View>
        </Animated.View>

        <Animated.View style={[styles.sphere, tone === "dark" ? styles.sphereDark : styles.sphereLight, sphereStyle]}>
          {tone === "dark" ? <DarkGlassBody /> : <LightGlassBody />}

          <Animated.View style={[styles.fill, bandStyle]}>
            {tone === "light" ? (
              <Animated.View style={[styles.layer, shadeStyle]}>
                <Svg width={SPHERE} height={SPHERE}>
                  <Defs>
                    <RadialGradient id="ribbon-shade" cx="50%" cy="50%" r="50%">
                      <Stop offset="0" stopColor="#35507F" stopOpacity={0.46} />
                      <Stop offset="0.6" stopColor="#35507F" stopOpacity={0.2} />
                      <Stop offset="1" stopColor="#35507F" stopOpacity={0} />
                    </RadialGradient>
                  </Defs>
                  <Ellipse cx={MID} cy={MID} rx={MID - 2} ry={20} fill="url(#ribbon-shade)" />
                </Svg>
              </Animated.View>
            ) : null}

            <Animated.View style={[styles.bloom, blend, warmBloomStyle]}>
              <Glow id="ribbon-bloom-warm" color={palette.bloomWarm} size={72} />
            </Animated.View>
            <Animated.View style={[styles.bloom, blend, coolBloomStyle]}>
              <Glow id="ribbon-bloom-cool" color={palette.bloomCool} size={72} />
            </Animated.View>
            <Animated.View style={[styles.bloom, blend, whiteBloomStyle]}>
              <Glow id="ribbon-bloom-white" color="#FFFFFF" size={72} core={0.8} />
            </Animated.View>

            <Ribbon id="ribbon-warm" shape={WARM} stops={palette.warm} clock={clock} energy={energy} glow={palette.ribbonGlow} additive={palette.additive} />
            <Ribbon id="ribbon-cool" shape={COOL} stops={palette.cool} clock={clock} energy={energy} glow={palette.ribbonGlow} additive={palette.additive} />
            <Ribbon id="ribbon-white" shape={WHITE} stops={palette.white} clock={clock} energy={energy} glow={palette.ribbonGlow * 0.75} additive={palette.additive} />

            {/* Where the band meets the glass */}
            <Animated.View style={[styles.layer, blend, flareStyle]}>
              <View style={[styles.flare, { left: -13 }]}>
                <Glow id="ribbon-flare-left" color={tone === "dark" ? "#9CC8FF" : "#FFFFFF"} size={34} />
              </View>
              <View style={[styles.flare, { right: -13 }]}>
                <Glow id="ribbon-flare-right" color={tone === "dark" ? "#FFD2A6" : "#FFFFFF"} size={34} />
              </View>
            </Animated.View>
          </Animated.View>

          <Animated.View style={[styles.layer, rimStyle]}>
            <GlassFront tone={tone} />
          </Animated.View>
        </Animated.View>
      </View>
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
  sphere: { width: SPHERE, height: SPHERE, borderRadius: SPHERE / 2, overflow: "hidden" },
  sphereLight: { backgroundColor: "rgba(255,255,255,0.18)" },
  sphereDark: {
    backgroundColor: "#05060B",
    // Lets the lights inside blend with each other only, not with the map behind.
    isolation: "isolate",
  },
  shadow: { position: "absolute", top: (BOX - 132) / 2 + 7, left: (BOX - 132) / 2 },
  bloom: { position: "absolute", left: (SPHERE - 72) / 2, top: (SPHERE - 72) / 2, width: 72, height: 72 },
  flare: { position: "absolute", top: MID - 17, width: 34, height: 34 },
  additive: { mixBlendMode: "screen" },
});
