/**
 * What the app may conclude about the state it comes back to.
 *
 * The pipeline is JavaScript, so it does not run while the phone is locked or
 * the app is backgrounded. Coming back it has an empty buffer, and the state
 * machine needs one window to classify and another to clear its debounce:
 * about ten seconds of "Beklemede" after every unlock, in the middle of a walk
 * the phone was counting the whole time. That is the reported bug all over
 * again, only shorter.
 *
 * The steps are not lost, though — iOS kept counting them — so on resume we ask
 * CMPedometer what happened and commit the walk straight away.
 *
 * Two deliberate limits:
 *
 *  - Steps are evidence of walking and of nothing else. We never seed RUNNING
 *    (that needs a speed, and there is no fix from a locked phone) and never
 *    seed CAR (a passenger's steps say nothing about a car).
 *  - We only ever seed a state the app is not already in the middle of. A live
 *    drive, a run, a charge — all of those are the state machine's business,
 *    and history must not overrule the present.
 *
 * Pure (no expo, no React Native), so scripts/check-activity-pipeline.ts can
 * run it under tsx.
 */

import { ActivityState } from "../ActivityStateMachine";

/** How far back to ask the pedometer. Long enough to be a pace, short enough to be now. */
export const RESUME_LOOKBACK_MS = 10000;

/**
 * Steps per second that counts as walking — the classifier's own
 * walkingStepFreqThreshold, so the seed agrees with the live windows that
 * follow it rather than committing a state they will immediately undo.
 */
export const RESUME_WALK_STEP_FREQ = 1.2;

/**
 * The state the recent step history justifies committing right now, or null to
 * leave the state machine alone and let the live windows decide.
 */
export function seededStateFrom(
  current: ActivityState,
  steps: number,
  spanMs: number,
): ActivityState | null {
  // Anything else is a state the app is already living in; only a standstill
  // (or a blank) is worth correcting from history.
  if (current !== ActivityState.IDLE && current !== ActivityState.UNKNOWN) return null;

  if (!Number.isFinite(steps) || steps <= 0) return null;
  if (!Number.isFinite(spanMs) || spanMs <= 0) return null;

  const stepFreq = steps / (spanMs / 1000);
  return stepFreq >= RESUME_WALK_STEP_FREQ ? ActivityState.WALKING : null;
}
