import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "../../context/ThemeContext";
import { useActivityState } from "../../hooks/useActivityState";
import { toDisplayKmh, useSpeed } from "../../hooks/useSpeed";
import { useStepCount } from "../../hooks/useStepCount";
import { ActivityState } from "../../services/ActivityStateMachine";
import { DriveSessionState, DriveSessionStore } from "../../services/DriveSessionStore";
import ActivityIcon from "../ActivityIcon";
import { RollingNumber } from "../RollingNumber";
import { GlassSurface } from "../ui/glass";
import { TABULAR } from "../ui/GroupedList";
import { usePagePalette } from "../ui/pagePalette";
import { activityStatus } from "./activityStatus";

/**
 * The map's status capsule: the activity, its speed and the day's steps
 * ("Beklemede · 0 adım"), and "Sürüşe Geç" while the phone is in a car and no
 * drive is running. Glass, because it is floating, tappable map chrome: a
 * tap brings the search and filters back. The status and "Sürüşe Geç" are
 * sibling buttons inside one glass shape, so VoiceOver reaches both.
 */
export function ActivityCapsule({
  compact,
  onExpand,
}: {
  compact: boolean;
  onExpand: () => void;
}) {
  const activityState = useActivityState();
  const { effectiveSteps } = useStepCount();
  const speed = useSpeed();
  const { colors, themeScheme } = useTheme();
  const palette = usePagePalette();
  const [driveState, setDriveState] = useState(() => DriveSessionStore.getState());

  // Whole km/h from the first frame: the raw reading is a window average
  // ("4.299339319991123"), and the debounce below only replaces it once the
  // speed moves by 1 km/h. -1 means unknown (toDisplayKmh).
  const [displaySpeed, setDisplaySpeed] = useState(() => toDisplayKmh(speed));
  useEffect(() => {
    if (Math.abs(speed - displaySpeed) >= 1 || speed === 0) {
      setDisplaySpeed(toDisplayKmh(speed));
    }
  }, [speed, displaySpeed]);

  useEffect(() => {
    const unsubscribe = DriveSessionStore.onStateChange((next) => setDriveState(next));
    return () => {
      unsubscribe();
    };
  }, []);

  const status = activityStatus(activityState, displaySpeed, colors, themeScheme === "dark");
  const showCta = activityState === ActivityState.CAR && driveState === DriveSessionState.IDLE;
  const accessibilityLabel = [
    status.label,
    status.speedText,
    status.showSteps ? `${effectiveSteps} adım` : null,
    status.doubleSteps ? "iki kat" : null,
  ]
    .filter((part): part is string => !!part)
    .join(", ");
  const secondary = [styles.secondary, TABULAR, { color: palette.secondaryLabel }];

  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <GlassSurface
        radius={22}
        interactive
        material="frosted"
        style={[styles.capsule, { paddingRight: showCta ? 7 : 14 }]}
      >
        <Pressable
          onPress={onExpand}
          accessibilityRole={compact ? "button" : undefined}
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={compact ? "Arama ve filtreleri gösterir" : undefined}
          style={({ pressed }) => [styles.status, pressed && styles.pressed]}
        >
          <ActivityIcon
            state={status.iconState}
            size={22}
            color={status.glyphColor}
            movementSpeed={speed}
          />
          <View style={styles.line}>
            <Text
              maxFontSizeMultiplier={1.4}
              style={[styles.label, { color: palette.label }]}
            >
              {status.label}
            </Text>
            {status.speedText ? (
              <Text maxFontSizeMultiplier={1.4} style={secondary}>
                {` · ${status.speedText}`}
              </Text>
            ) : null}
            {status.showSteps ? (
              <>
                <Text maxFontSizeMultiplier={1.4} style={secondary}>
                  {" · "}
                </Text>
                <RollingNumber
                  value={effectiveSteps}
                  style={{
                    fontSize: 15,
                    fontWeight: "400",
                    color: palette.secondaryLabel,
                  }}
                />
                <Text maxFontSizeMultiplier={1.4} style={secondary}>
                  {" adım"}
                </Text>
              </>
            ) : null}
            {status.doubleSteps ? (
              <View style={styles.badge}>
                <Text maxFontSizeMultiplier={1.4} style={styles.badgeText}>
                  ×2
                </Text>
              </View>
            ) : null}
          </View>
        </Pressable>
        {showCta ? (
          <Pressable
            onPress={() => DriveSessionStore.startPrompt()}
            accessibilityRole="button"
            accessibilityLabel="Sürüşe Geç"
            accessibilityHint="Sürüş modunu başlatır"
            style={({ pressed }) => [styles.ctaTouch, pressed && styles.pressed]}
          >
            <View style={[styles.cta, { backgroundColor: palette.accent }]}>
              <Text maxFontSizeMultiplier={1.4} style={styles.ctaText}>
                Sürüşe Geç
              </Text>
            </View>
          </Pressable>
        ) : null}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  // Frosted glass does not answer a touch by itself.
  pressed: {
    opacity: 0.6,
  },
  wrapper: {
    alignSelf: "center",
  },
  capsule: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
  },
  status: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  line: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  secondary: {
    fontSize: 15,
    lineHeight: 20,
  },
  // The ×2 badge as ActivityContextBar drew it: steps count double while charging.
  badge: {
    backgroundColor: "#FFD60A",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    marginLeft: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#000",
    letterSpacing: -0.2,
  },
  ctaTouch: {
    minHeight: 44,
    justifyContent: "center",
    marginLeft: 10,
  },
  cta: {
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
