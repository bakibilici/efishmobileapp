/**
 * What the map's status capsule says for an activity: its label, the speed
 * and steps beside it, and the glyph's colour. The label is always in the
 * label colour; the state's colour lives only in the glyph.
 *
 * Pure (no React Native), so scripts/check-map-header.ts runs it under tsx.
 */
import { ActivityState } from "../../services/ActivityStateMachine";

export type ActivityStatus = {
  label: string;
  glyphColor: string;
  /** The glyph drawn: UNKNOWN is drawn as IDLE (the moon), as its label says "Beklemede". */
  iconState: ActivityState;
  speedText: string | null;
  showSteps: boolean;
  /** Steps count double while charging (StepStore): the ×2 badge. */
  doubleSteps: boolean;
};

/**
 * `kmh` is whole km/h as toDisplayKmh gives it, -1 when unknown.
 * `colors` are the theme's primary, tertiary and neutral.
 */
export function activityStatus(
  state: ActivityState,
  kmh: number,
  colors: { primary: string; tertiary: string; neutral: string },
  isDark: boolean,
): ActivityStatus {
  const known = kmh >= 0;
  const speed = known ? `${kmh} km/sa` : null;

  switch (state) {
    case ActivityState.CAR:
      return {
        label: "Sürüş",
        glyphColor: "#FF9F0A",
        iconState: ActivityState.CAR,
        speedText: `${known ? kmh : "?"} km/sa`,
        showSteps: false,
        doubleSteps: false,
      };
    case ActivityState.RUNNING:
      return {
        label: kmh >= 9 ? "Koşu (hızlı)" : "Koşu (yavaş)",
        glyphColor: colors.primary,
        iconState: ActivityState.RUNNING,
        speedText: speed,
        showSteps: true,
        doubleSteps: false,
      };
    case ActivityState.WALKING:
      // The state machine decides whether this is a walk, and it already waits
      // out a pause before it says otherwise. The capsule used to overrule it
      // whenever the speed read under 1 km/h, which is most of a real walk:
      // GPS gives a pedestrian's speed late, roughly, or not at all.
      return {
        label: "Yürüyüş",
        glyphColor: isDark ? colors.tertiary : "#00875A",
        iconState: ActivityState.WALKING,
        speedText: speed,
        showSteps: true,
        doubleSteps: false,
      };
    case ActivityState.CHARGING:
      return {
        label: "Şarjda",
        // #FFD60A is about 1.4:1 on light glass: a darker yellow there.
        glyphColor: isDark ? "#FFD60A" : "#B38600",
        iconState: ActivityState.CHARGING,
        speedText: kmh >= 1 ? speed : null,
        showSteps: true,
        doubleSteps: true,
      };
    default:
      return {
        label: "Beklemede",
        glyphColor: colors.neutral,
        iconState: ActivityState.IDLE,
        speedText: null,
        showSteps: true,
        doubleSteps: false,
      };
  }
}
