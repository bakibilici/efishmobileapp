import { BlurView } from "expo-blur";
import { AnimatedTextView } from "expo-ios-text-animations";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useTheme } from "../context/ThemeContext";
import { useActivityState } from "../hooks/useActivityState";
import { useSpeed } from "../hooks/useSpeed";
import { useStepCount } from "../hooks/useStepCount";
import { ActivityState } from "../services/ActivityStateMachine";
import { DriveSessionState, DriveSessionStore } from "../services/DriveSessionStore";
import ActivityIcon from "./ActivityIcon";
import { RollingNumber } from "./RollingNumber";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ActivityBarMode = "FULL" | "COMPACT" | "MINIMAL";

interface Props {
  mode?: ActivityBarMode;
  onPress?: () => void;
}

export function ActivityContextBar({ mode = "FULL", onPress }: Props) {
  const activityState = useActivityState();
  const stepData = useStepCount();
  const speed = useSpeed();
  const { colors, themeScheme } = useTheme();
  const isDark = themeScheme === "dark";
  const [driveSessionState, setDriveSessionState] = useState(
    DriveSessionStore.getState(),
  );

  const { width: SCREEN_WIDTH } = Dimensions.get("window");
  const FULL_WIDTH = SCREEN_WIDTH - 32;

  const [displaySpeed, setDisplaySpeed] = useState(speed);

  // Debounce/smooth speed display purely for UI feel (to prevent rapid 1km/h micro-jitters)
  useEffect(() => {
    if (Math.abs(speed - displaySpeed) >= 1 || speed === 0) {
      setDisplaySpeed(Math.round(speed));
    }
  }, [speed, displaySpeed]);

  // Animate smoothly on state transition (Layout)
  useEffect(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  }, [activityState]);

  useEffect(() => {
    const unsub = DriveSessionStore.onStateChange((next) =>
      setDriveSessionState(next),
    );
    return unsub;
  }, []);

  // Entrance animation values
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.96);
  const translateY = useSharedValue(4);

  useEffect(() => {
    opacity.value = withSpring(1, { damping: 20, stiffness: 100 });
    scale.value = withSpring(1, { damping: 20, stiffness: 100 });
    translateY.value = withSpring(0, { damping: 20, stiffness: 100 });
  }, [opacity, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    width: FULL_WIDTH,
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const getConfig = () => {
    switch (activityState) {
      case ActivityState.CAR:
        const dSpeedText = displaySpeed >= 0 ? displaySpeed : "?";
        return {
          icon: "car-sport",
          color: "#FF9F0A", // Apple Orange
          bgColor: isDark
            ? "rgba(255, 159, 10, 0.15)"
            : "rgba(255, 159, 10, 0.1)",
          borderColor: isDark
            ? "rgba(255, 159, 10, 0.3)"
            : "rgba(255, 159, 10, 0.2)",
          label: "Driving",
          data: `${dSpeedText} km/h`,
        };
      case ActivityState.RUNNING: {
        const displaySpeed = Math.round(speed * 10) / 10;
        return {
          icon: "walk",
          color: colors.primary,
          bgColor: isDark
            ? "rgba(0, 147, 201, 0.15)"
            : "rgba(0, 147, 201, 0.1)",
          borderColor: isDark
            ? "rgba(0, 147, 201, 0.3)"
            : "rgba(0, 147, 201, 0.2)",
          label: "Running",
          speedText: `${displaySpeed} km/h • `,
          showSteps: true,
        };
      }
      case ActivityState.WALKING: {
        const isUnknownSpeed = displaySpeed < 0;
        const isPaused = !isUnknownSpeed && displaySpeed < 1;

        let primaryString = "Walking";
        if (isPaused) primaryString = "Idle";

        const speedText = isUnknownSpeed ? "" : `${displaySpeed} km/h • `;

        return {
          icon: "walk",
          color: isDark ? colors.tertiary : "#00875A", // Darker green in light mode for contrast
          bgColor: isDark
            ? "rgba(124, 251, 199, 0.15)"
            : "rgba(124, 251, 199, 0.1)",
          borderColor: isDark
            ? "rgba(124, 251, 199, 0.3)"
            : "rgba(124, 251, 199, 0.2)",
          label: primaryString,
          speedText,
        };
      }
      case ActivityState.CHARGING: {
        const isUnknownSpeed = displaySpeed < 0;
        const isPacing = displaySpeed >= 1;

        if (isPacing) {
          return {
            icon: "walk",
            color: "#FFD60A", // Keep icon yellow for charging context
            bgColor: isDark
              ? "rgba(255, 214, 10, 0.15)"
              : "rgba(255, 214, 10, 0.1)",
            borderColor: isDark
              ? "rgba(255, 214, 10, 0.3)"
              : "rgba(255, 214, 10, 0.2)",
            label: "Walking",
            speedText: isUnknownSpeed ? "" : `${displaySpeed} km/h • `,
            showSteps: true,
          };
        }

        return {
          icon: "flash",
          color: "#FFD60A", // Apple Yellow
          bgColor: isDark
            ? "rgba(255, 214, 10, 0.15)"
            : "rgba(255, 214, 10, 0.1)",
          borderColor: isDark
            ? "rgba(255, 214, 10, 0.3)"
            : "rgba(255, 214, 10, 0.2)",
          label: "Charging",
          data: null,
        };
      }
      case ActivityState.IDLE:
      default:
        return {
          icon: "moon",
          color: colors.neutral,
          bgColor: isDark
            ? "rgba(88, 122, 153, 0.15)"
            : "rgba(88, 122, 153, 0.1)",
          borderColor: isDark
            ? "rgba(88, 122, 153, 0.3)"
            : "rgba(88, 122, 153, 0.2)",
          label: "Idle",
          data: null,
        };
    }
  };

  const config = getConfig();
  const showDriveCta =
    activityState === ActivityState.CAR &&
    driveSessionState === DriveSessionState.IDLE;

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[animatedStyle, styles.outerContainer]}>
        <BlurView
          intensity={mode === "FULL" ? 80 : 0} // Only blur when in header flow
          tint={isDark ? "dark" : "light"}
          style={[
            styles.container,
            {
              backgroundColor:
                mode === "FULL"
                  ? isDark
                    ? "rgba(25, 25, 25, 0.45)"
                    : "rgba(255, 255, 255, 0.5)"
                  : isDark
                    ? "#1E1E1E"
                    : "#FFFFFF",
              borderColor: isDark
                ? "rgba(255, 255, 255, 0.15)"
                : "rgba(0, 0, 0, 0.05)",
            },
          ]}
        >
          <View style={styles.leftContent}>
            <ActivityIcon
              state={activityState}
              size={28} // slightly larger icon
              color={config.color}
              movementSpeed={speed}
            />
            {mode !== "MINIMAL" &&
              (Platform.OS === "ios" ? (
                <AnimatedTextView
                  text={config.label}
                  type="blur"
                  fontSize={16}
                  fontColor={config.color}
                  animationDuration={0.6}
                  animating={true}
                  style={
                    [
                      styles.label,
                      { height: 20, minWidth: config.label.length * 9 },
                    ] as any
                  }
                />
              ) : (
                <Text style={[styles.label, { color: config.color }]}>
                  {config.label}
                </Text>
              ))}
          </View>

          {/* Only show the right pill if there is actually data (steps, speed, or boosting info) */}
          {(config.speedText ||
            activityState === ActivityState.WALKING ||
            activityState === ActivityState.RUNNING ||
            (config as any).showSteps ||
            config.data) && (
            <View
              style={[
                styles.rightContent,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.05)",
                },
              ]}
            >
              <View style={styles.dataContainer}>
                {config.speedText ? (
                  <Text style={[styles.dataText, { color: colors.text }]}>
                    {config.speedText}
                  </Text>
                ) : null}
                {activityState === ActivityState.WALKING ||
                activityState === ActivityState.RUNNING ||
                (config as any).showSteps ? (
                  <View style={styles.stepsWrapper}>
                    <RollingNumber
                      value={stepData.effectiveSteps}
                      style={{ color: colors.text, fontSize: 14 }}
                    />
                    <Text style={[styles.dataText, { color: colors.text }]}>
                      {" steps"}
                    </Text>
                    {activityState === ActivityState.CHARGING && (
                      <View style={styles.multiplierBadge}>
                        <Text style={styles.multiplierText}>×2</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={[styles.dataText, { color: colors.text }]}>
                    {config.data}
                  </Text>
                )}
                {showDriveCta && (
                  <Pressable
                    onPress={() => DriveSessionStore.startPrompt()}
                    style={[
                      styles.driveModeButton,
                      { backgroundColor: colors.primary },
                    ]}
                  >
                    <Text style={styles.driveModeButtonText}>Sürüşe Geç</Text>
                  </Pressable>
                )}
              </View>
            </View>
          )}
        </BlurView>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    alignSelf: "center",
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 100, // Fully Rounded (Capsule)
    // Soft, premium shadow to avoid "blackish" bottom effect
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 4,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20, // slightly more horizontal padding
    paddingVertical: 14, // increased height
    borderRadius: 100, // Matching outerContainer
    borderWidth: 0.5, // Razor-thin refined border
    overflow: "hidden",
  },
  leftContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10, // slightly more gap
  },
  label: {
    fontSize: 17, // slightly larger font
    fontWeight: "700", // Bolder for high-contrast visibility
    letterSpacing: -0.4,
  },
  rightContent: {
    paddingHorizontal: 16, // more horizontal padding
    paddingVertical: 8, // slightly more vertical height
    borderRadius: 100, // Matching the main bar (Capsule)
  },
  dataText: {
    fontSize: 14,
    fontWeight: "500", // medium text for stats
    letterSpacing: -0.2,
    fontVariant: ["tabular-nums"],
  },
  dataContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepsWrapper: {
    flexDirection: "row",
    alignItems: "center",
  },
  multiplierBadge: {
    backgroundColor: "#FFD60A", // Apple Yellow
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    marginLeft: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  multiplierText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#000",
    letterSpacing: -0.2,
  },
  driveModeButton: {
    marginLeft: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  driveModeButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
});
