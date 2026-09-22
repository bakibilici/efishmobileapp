/**
 * A speed the app measures for itself, for when the platform will not give one.
 *
 * iOS reports CLLocation.speed as -1 whenever Core Location has no Doppler
 * estimate, which on a phone held at walking pace is common. The fixes
 * themselves are still good, though, so the speed is recoverable: how far two
 * of them are apart, over how long. That is a real measurement, not a guess —
 * nothing here invents movement that did not happen.
 *
 * Two things make it honest rather than noisy:
 *
 *  - It measures over a baseline of seconds, not between one fix and the next.
 *    A pedestrian covers ~3 m in 2 s, which is inside the error bars of a good
 *    fix; over 4 s they cover ~6 m, which is not. The long baseline is also
 *    what does the smoothing, so no extra filter is needed on top (the
 *    pipeline then averages these samples across its own window again).
 *  - It refuses to answer when it cannot tell movement from GPS wander: on a
 *    coarse fix, or when the displacement is inside the noise floor. Refusing
 *    reads as "no speed" on screen, which is the truth; a fabricated 0 was the
 *    bug this whole change exists to fix.
 *
 * Pure (no expo, no React Native), so the check scripts can run it under tsx.
 */

import { UNKNOWN_SPEED } from './types';

/** A location fix, reduced to what a speed can be measured from. */
export interface SpeedFix {
  /** ms since epoch. */
  t: number;
  lat: number;
  lon: number;
  /** Horizontal accuracy in metres. Non-finite or missing counts as unusable. */
  acc: number | null | undefined;
}

/** Shortest baseline worth dividing by: under this, a walk is inside the error bars. */
export const DERIVE_MIN_SPAN_MS = 3000;
/**
 * Longest baseline still worth trusting. Beyond it the straight line between
 * two fixes stops standing for the path walked (corners get cut), and the pair
 * probably spans a gap when the app was backgrounded.
 */
export const DERIVE_MAX_SPAN_MS = 12000;
/** Worse than this, a fix cannot distinguish a walk from standing still. */
export const DERIVE_MAX_ACCURACY_M = 25;
/** Displacement under this, over a full baseline, is too small to tell from wander. */
export const DERIVE_NOISE_FLOOR_M = 3;
/** ~216 km/h. Above this the pair is a bad fix, not a speed. */
export const MAX_PLAUSIBLE_SPEED_MPS = 60;
/** How much history is worth keeping to find a baseline in. */
export const TRAIL_MAX_MS = 15000;

/** Metres between two fixes, on the same haversine the route code uses. */
export function metresBetween(a: SpeedFix, b: SpeedFix): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

const usableAccuracy = (acc: number | null | undefined): boolean =>
  typeof acc === 'number' && Number.isFinite(acc) && acc >= 0 && acc <= DERIVE_MAX_ACCURACY_M;

/** Drops fixes too old to anchor a baseline. Returns a new array. */
export function trimTrail(trail: readonly SpeedFix[], now: number): SpeedFix[] {
  return trail.filter((f) => now - f.t <= TRAIL_MAX_MS);
}

/**
 * The speed in m/s implied by a trail of fixes, or UNKNOWN_SPEED when the
 * trail cannot support one. The newest fix is the near end; the anchor is the
 * oldest fix still inside DERIVE_MAX_SPAN_MS, so the baseline is as long as
 * the trail honestly allows.
 */
export function deriveSpeedMps(trail: readonly SpeedFix[]): number {
  if (trail.length < 2) return UNKNOWN_SPEED;

  const newest = trail[trail.length - 1];
  if (!usableAccuracy(newest.acc)) return UNKNOWN_SPEED;

  let anchor: SpeedFix | null = null;
  for (let i = 0; i < trail.length - 1; i += 1) {
    const candidate = trail[i];
    const span = newest.t - candidate.t;
    // Walking from the oldest end, spans shrink. Skip what is too old, stop
    // once they are too short to divide by, take the first usable one.
    if (span > DERIVE_MAX_SPAN_MS) continue;
    if (span < DERIVE_MIN_SPAN_MS) break;
    if (usableAccuracy(candidate.acc)) {
      anchor = candidate;
      break;
    }
  }
  if (!anchor) return UNKNOWN_SPEED;

  const seconds = (newest.t - anchor.t) / 1000;
  if (seconds <= 0) return UNKNOWN_SPEED;

  const metres = metresBetween(anchor, newest);
  // This is displacement, not path length: pacing a room, walking a loop or
  // turning a corner all end up near where they started. Under the noise floor
  // we genuinely cannot tell that from standing still, so we say nothing
  // instead of "0 km/sa" — which is the reading the owner complained about.
  // Someone who really is standing still is IDLE, and the capsule prints no
  // speed for IDLE either way, so refusing here costs nothing.
  if (metres < DERIVE_NOISE_FLOOR_M) return UNKNOWN_SPEED;

  const mps = metres / seconds;
  if (!Number.isFinite(mps) || mps > MAX_PLAUSIBLE_SPEED_MPS) return UNKNOWN_SPEED;
  return mps;
}

/**
 * The last measured speed, or UNKNOWN_SPEED once the fix behind it is too old
 * to still be true.
 *
 * The sampling loop re-emits the stored speed every tick, but fixes do not
 * arrive on a schedule: watchPositionAsync's `timeInterval` is Android-only, so
 * on iOS only `distanceInterval` drives delivery. Stand still and the fixes
 * simply stop — and without this, the last reading would be re-emitted forever,
 * printing "Yürüyüş · 5 km/sa" at a standstill and, worse, holding the
 * classifier above its IDLE speed bar so the walk (or the drive) never ends.
 */
export function speedIfFresh(
  speed: number,
  lastFixAt: number | null,
  now: number,
  maxAgeMs: number,
): number {
  if (lastFixAt === null || !Number.isFinite(lastFixAt)) return UNKNOWN_SPEED;
  if (now - lastFixAt > maxAgeMs) return UNKNOWN_SPEED;
  return speed;
}
