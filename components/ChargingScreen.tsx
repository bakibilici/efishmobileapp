import { useTheme } from "@/context/ThemeContext";
import { ChargingMode, ChargingState } from "@/hooks/useChargingSimulation";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import {
  Dimensions,
  Easing,
  Image,
  Pressable,
  Animated as RNAnimated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useDerivedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Mask } from "react-native-svg";
import FinishingSpinner from "./FinishingSpinner";

const { width } = Dimensions.get("window");
const CIRCLE_SIZE = width * 0.75; // Large central circle
const STROKE_WIDTH = 15;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ChargingScreenProps = {
  state: ChargingState;
  onMinimize: () => void;
  onStop: () => void;
  onToggleDev: (mode: ChargingMode) => void;
};

// Pulse Indicator Component
const PulseIndicator = ({ isComplete }: { isComplete: boolean }) => {
  const scaleAnim = useRef(new RNAnimated.Value(1)).current;

  useEffect(() => {
    if (!isComplete) {
      RNAnimated.loop(
        RNAnimated.sequence([
          RNAnimated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          RNAnimated.timing(scaleAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ).start();
    } else {
      scaleAnim.setValue(1);
      // Stop animation? RNAnimated.loop doesn't have stop easily without ref storing the animation object.
      // Simplified: just let it run or reset. For visual purity, we'll keep it simple content-wise.
    }
  }, [isComplete]);

  const color = isComplete ? "#0093C9" : "#FFD60A"; // Green vs Yellow

  return (
    <View style={styles.pulseContainer}>
      <RNAnimated.View
        style={[
          styles.pulseDot,
          {
            backgroundColor: color,
            transform: [{ scale: scaleAnim }],
            opacity: isComplete ? 1 : 0.6, // Pulse effect opacity
          },
        ]}
      />
      <View style={[styles.pulseInner, { backgroundColor: color }]} />
    </View>
  );
};

export default function ChargingScreen({
  state,
  onMinimize,
  onStop,
  onToggleDev,
}: ChargingScreenProps) {
  const { colors, themeScheme } = useTheme();
  const isDark = themeScheme === "dark";

  // Derived values for progress
  const progress = useDerivedValue(() => {
    return withTiming(state.batteryLevel / 100, { duration: 1000 });
  }, [state.batteryLevel]);

  const animatedProps = useAnimatedProps(() => {
    const strokeDashoffset = CIRCUMFERENCE * (1 - progress.value);

    // Color Interpolation for DC (Red -> Green)
    // AC stays constant or standard green
    let stroke = colors.primary; // Default
    if (state.mode === "DC" || state.mode === "HPC") {
      stroke = interpolateColor(
        progress.value,
        [0, 0.5, 1],
        ["#FF3B30", "#FFD60A", "#0093C9"], // Red -> Yellow -> Green
      );
    } else {
      stroke = "#4BACE4"; // AC Blue
    }

    return {
      strokeDashoffset,
      stroke,
    };
  }, [state.mode, colors.primary]);

  const isComplete = state.batteryLevel >= 100;

  const modeColors: Record<string, string> = {
    HPC: "#7C4DFF",
    DC: "#FF8A1F",
    AC: "#4BACE4",
  };

  return (
    <View style={styles.container}>
      <View style={{ flex: 1, paddingBottom: 40 }}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerStatus}>
            <PulseIndicator isComplete={isComplete} />
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {isComplete ? "Charging Complete" : "Charging..."}
            </Text>
            <View
              style={[
                styles.modeBadge,
                { backgroundColor: modeColors[state.mode] || "#656565" },
              ]}
            >
              <Text style={styles.modeBadgeText}>{state.mode}</Text>
            </View>
          </View>
        </View>

        {/* Main Content */}
        {state.isFinishing ? (
          <View style={styles.mainContent}>
            <FinishingSpinner size={50} color={colors.primary} />
            <Text
              style={[
                styles.percentageText,
                { color: colors.text, fontSize: 32, marginTop: 24 },
              ]}
            >
              Finishing Session...
            </Text>
            <Text style={[styles.powerText, { color: colors.textSecondary }]}>
              Please wait while we finalize your charging session.
            </Text>
          </View>
        ) : (
          <View style={styles.mainContent}>
            {/* Circular Progress & Visual (Hide for AC) */}
            {state.mode !== "AC" ? (
              <View style={styles.circleContainer}>
                <Svg
                  width={CIRCLE_SIZE}
                  height={CIRCLE_SIZE}
                  style={{ transform: [{ rotate: "-90deg" }] }}
                >
                  <Defs>
                    <Mask id="dashMask">
                      <Circle
                        cx={CIRCLE_SIZE / 2}
                        cy={CIRCLE_SIZE / 2}
                        r={RADIUS}
                        stroke="white"
                        strokeWidth={STROKE_WIDTH}
                        strokeDasharray="2, 4"
                        fill="transparent"
                      />
                    </Mask>
                  </Defs>

                  {/* Track (Faint Dashes) */}
                  <Circle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={RADIUS}
                    stroke={isDark ? "#333" : "#E5E5EA"}
                    strokeWidth={STROKE_WIDTH}
                    strokeDasharray="2, 4"
                    fill="transparent"
                  />

                  {/* Progress (Masked to look dashed) */}
                  <AnimatedCircle
                    cx={CIRCLE_SIZE / 2}
                    cy={CIRCLE_SIZE / 2}
                    r={RADIUS}
                    strokeWidth={STROKE_WIDTH}
                    strokeLinecap="butt"
                    fill="transparent"
                    strokeDasharray={`${CIRCUMFERENCE}`}
                    mask="url(#dashMask)"
                    animatedProps={animatedProps}
                  />
                </Svg>

                {/* Centered Content: Car & Percentage */}
                <View style={styles.innerCircle}>
                  <Image
                    source={require("@/assets/images/teslamodely.webp")}
                    style={styles.carImage}
                    resizeMode="contain"
                  />
                  <Text style={[styles.percentageText, { color: colors.text }]}>
                    {Math.floor(state.batteryLevel)}%
                  </Text>
                  <Text
                    style={[styles.powerText, { color: colors.textSecondary }]}
                  >
                    {state.power} kW
                  </Text>
                </View>
              </View>
            ) : (
              <View
                style={[styles.circleContainer, { justifyContent: "center" }]}
              >
                {/* AC Simplified Center Content */}
                <Image
                  source={require("@/assets/images/teslamodely.webp")}
                  style={[
                    styles.carImage,
                    { transform: [{ scale: 1.2 }], marginBottom: 20 },
                  ]}
                  resizeMode="contain"
                />
                <Text
                  style={[
                    styles.percentageText,
                    { color: colors.text, fontSize: 32 },
                  ]}
                >
                  {state.power} kW
                </Text>
                <Text
                  style={[
                    styles.powerText,
                    { color: colors.textSecondary, marginTop: 8 },
                  ]}
                >
                  Charging Power
                </Text>
              </View>
            )}

            {/* Battery Breakdown (DC/HPC Only) */}
            {(state.mode === "DC" || state.mode === "HPC") && (
              <View style={styles.batteryRow}>
                <View style={styles.batteryStat}>
                  <Text
                    style={[styles.bLabel, { color: colors.textSecondary }]}
                  >
                    Start
                  </Text>
                  <Text style={[styles.bValue, { color: colors.text }]}>
                    {state.startSoc != null ? `${state.startSoc}%` : "—"}
                  </Text>
                </View>
                <View
                  style={[styles.divider, { backgroundColor: colors.border }]}
                />
                <View style={styles.batteryStat}>
                  <Text
                    style={[styles.bLabel, { color: colors.textSecondary }]}
                  >
                    Current
                  </Text>
                  <Text style={[styles.bValue, { color: colors.text }]}>
                    {Math.floor(state.batteryLevel)}%
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Statistics Grid */}
        <View
          style={[
            styles.statsGrid,
            { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
          ]}
        >
          {/* Row 1 */}
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: "rgba(255, 214, 10, 0.15)" },
                ]}
              >
                <Ionicons name="flash" size={20} color="#FFD60A" />
              </View>
              <View>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Energy
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {state.chargedAmount.toFixed(2)} kWh
                </Text>
              </View>
            </View>

            <View style={styles.statItem}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: "rgba(48, 176, 199, 0.15)" },
                ]}
              >
                <Ionicons name="wallet-outline" size={20} color="#30B0C7" />
              </View>
              <View>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Cost
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {state.cost.toFixed(2)} ₺
                </Text>
              </View>
            </View>
          </View>

          {/* Row 2 */}
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: "rgba(175, 82, 222, 0.15)" },
                ]}
              >
                <Ionicons name="time-outline" size={20} color="#AF52DE" />
              </View>
              <View>
                <Text
                  style={[styles.statLabel, { color: colors.textSecondary }]}
                >
                  Duration
                </Text>
                <Text style={[styles.statValue, { color: colors.text }]}>
                  {Math.floor(state.duration / 60)}m {state.duration % 60}s
                </Text>
              </View>
            </View>

            {state.mode === "DC" || state.mode === "HPC" ? (
              <View style={styles.statItem}>
                <View
                  style={[
                    styles.iconBox,
                    { backgroundColor: "rgba(50, 215, 75, 0.15)" },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="battery-charging-100"
                    size={20}
                    color="#32D74B"
                  />
                </View>
                <View>
                  <Text
                    style={[styles.statLabel, { color: colors.textSecondary }]}
                  >
                    Est. 100%
                  </Text>
                  <Text style={[styles.statValue, { color: colors.text }]}>
                    {state.estTime100
                      ? Math.ceil(state.estTime100) + "m"
                      : "Done"}
                  </Text>
                </View>
              </View>
            ) : (
              // AC placeholder or empty
              <View style={styles.statItem} />
            )}
          </View>
        </View>

        {/* Footer Action */}
        <View style={styles.footer}>
          <Pressable
            onPress={onMinimize}
            style={[styles.iconBtn, { backgroundColor: colors.card }]}
          >
            <Ionicons name="chevron-down" size={24} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={onStop}
            style={({ pressed }) => [
              styles.stopBtn,
              { opacity: pressed ? 0.9 : 1 },
            ]}
          >
            <Text style={styles.stopBtnText}>Stop Charging</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  headerStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  modeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modeBadgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  pulseContainer: {
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  pulseDot: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  pulseInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  // Main Content
  mainContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  circleContainer: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  innerCircle: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  carImage: {
    width: CIRCLE_SIZE * 0.65,
    height: CIRCLE_SIZE * 0.4,
    marginBottom: 10,
  },
  percentageText: {
    fontSize: 42,
    fontWeight: "800",
    letterSpacing: -1,
  },
  powerText: {
    fontSize: 16,
    fontWeight: "500",
    marginTop: 4,
  },
  batteryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 40,
    paddingHorizontal: 30,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    gap: 20,
  },
  divider: {
    width: 1,
    height: 24,
  },
  batteryStat: {
    alignItems: "center",
    minWidth: 80,
  },
  bLabel: {
    fontSize: 13,
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    fontWeight: "600",
    opacity: 0.7,
  },
  bValue: {
    fontSize: 20,
    fontWeight: "700",
  },

  // Stats Grid
  statsGrid: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 24,
    padding: 20,
    gap: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 5,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: "700",
  },

  // Footer
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  stopBtn: {
    flex: 1,
    height: 50,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FF3B30",
  },
  stopBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "700",
  },
});
