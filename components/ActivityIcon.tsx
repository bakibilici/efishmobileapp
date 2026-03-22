import Ionicons from "@expo/vector-icons/Ionicons";
import LottieView from "lottie-react-native";
import React, { forwardRef, memo, useImperativeHandle, useRef } from "react";
import { View } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { ActivityState } from "../services/ActivityStateMachine";

export interface ActivityIconHandle {
  play: () => void;
  pause: () => void;
  reset: () => void;
}

interface Props {
  state: ActivityState;
  size?: number;
  color?: string;
  /** Current speed in km/h to dynamically adjust animation speed */
  movementSpeed?: number;
}

const ActivityAnimations = {
  driving: require("../assets/lotties/activity/driving_icon.json"),
  walking: require("../assets/lotties/activity/walking_icon.json"),
  running: require("../assets/lotties/activity/running_icon.json"),
} as const;

/**
 * Reusable ActivityIcon component that renders a Lottie animation
 * for the given ActivityState, with a fallback to Ionicons if the
 * animation file is missing or not yet provided.
 */
const ActivityIcon = forwardRef<ActivityIconHandle, Props>(
  ({ state, size = 24, color = "#000", movementSpeed = 0 }, ref) => {
    const lottieRef = useRef<LottieView>(null);
    const { colors, themeScheme } = useTheme();

    useImperativeHandle(ref, () => ({
      play: () => lottieRef.current?.play(),
      pause: () => lottieRef.current?.pause(),
      reset: () => lottieRef.current?.reset(),
    }));

    let lottieSource: any = null;
    let fallbackIcon: string = "help-circle";

    // Map activity state to Lottie source
    switch (state) {
      case ActivityState.CAR:
        lottieSource = ActivityAnimations.driving;
        fallbackIcon = "car-sport";
        break;
      case ActivityState.CHARGING:
        lottieSource = null;
        fallbackIcon = "flash";
        break;
      case ActivityState.WALKING:
        lottieSource = ActivityAnimations.walking;
        fallbackIcon = "walk";
        break;
      case ActivityState.RUNNING:
        lottieSource = ActivityAnimations.running;
        fallbackIcon = "walk";
        break;
      case ActivityState.IDLE:
        lottieSource = null;
        fallbackIcon = "moon";
        break;
      default:
        fallbackIcon = "help-circle";
    }

    // Determine color filters for dark mode accent color
    const colorFilters = React.useMemo(() => {
      if (themeScheme !== "dark") return [];

      if (state === ActivityState.CAR) {
        return [
          {
            keypath: "Capa 1/ coche Outlines.Group 1.Fill 1",
            color: colors.primary,
          },
          {
            keypath: "Capa 3/ coche Outlines.Group 1.Fill 1",
            color: colors.primary,
          },
        ];
      }

      const isWalkingOrRunning =
        state === ActivityState.WALKING || state === ActivityState.RUNNING;

      if (isWalkingOrRunning) {
        return [
          "Union 1",
          "Union 2",
          "Union 3",
          "Union 4",
          "Union 5",
          "Union 6",
          "Union 7",
        ].map((name) => ({
          keypath: `${name}.${name}.Fill 1`,
          color: colors.tertiary,
        }));
      }

      return [];
    }, [themeScheme, state, colors.primary, colors.tertiary]);

    if (!lottieSource) {
      return <Ionicons name={fallbackIcon as any} size={size} color={color} />;
    }

    return (
      <View
        style={{
          width: size,
          height: size,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <LottieView
          ref={lottieRef}
          source={lottieSource}
          autoPlay
          loop
          style={{ width: size, height: size }}
          // Dynamic speed adjustment
          speed={(() => {
            if (state === ActivityState.IDLE) return 0.5;
            
            if (state === ActivityState.RUNNING) {
              // Base speed at 6 km/h is 0.6. Scale up to 1.6 at 18 km/h.
              // This makes a slow jog feel "slow" and a fast run feel "intense".
              const runSpeed = Math.max(6, movementSpeed);
              const multiplier = 0.6 + ((runSpeed - 6) / 12);
              return Math.min(1.8, multiplier);
            }
            
            if (state === ActivityState.WALKING) {
              // Base speed at 3 km/h is 1.0. Scale up to 1.4 at 6 km/h.
              const walkSpeed = Math.max(3, movementSpeed);
              const multiplier = 1 + (walkSpeed - 3) / 7.5;
              return Math.min(1.4, multiplier);
            }
            
            return 1;
          })()}
          renderMode="SOFTWARE"
          colorFilters={colorFilters}
        />
      </View>
    );
  },
);

ActivityIcon.displayName = "ActivityIcon";

export default memo(ActivityIcon);
