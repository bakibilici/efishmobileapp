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
}

const ActivityAnimations = {
  driving: require("../assets/lotties/activity/driving_icon.json"),
  walking: require("../assets/lotties/activity/walking_icon.json"),
} as const;

/**
 * Reusable ActivityIcon component that renders a Lottie animation
 * for the given ActivityState, with a fallback to Ionicons if the
 * animation file is missing or not yet provided.
 */
const ActivityIcon = forwardRef<ActivityIconHandle, Props>(
  ({ state, size = 24, color = "#000" }, ref) => {
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

      if (state === ActivityState.WALKING) {
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
          color: colors.primary,
        }));
      }

      return [];
    }, [themeScheme, state, colors.primary]);

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
          // Idle optimization: slower animation if it's the idle state
          speed={state === ActivityState.IDLE ? 0.5 : 1}
          renderMode="SOFTWARE"
          colorFilters={colorFilters}
        />
      </View>
    );
  },
);

ActivityIcon.displayName = "ActivityIcon";

export default memo(ActivityIcon);
