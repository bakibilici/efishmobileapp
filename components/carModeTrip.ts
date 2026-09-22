/**
 * What car mode says about the planned trip: the header's line ("34,6 km ·
 * 1 şarj durağı · 35 dk şarj"), the reopen capsule's time, and how long the
 * trip still takes, which is what the VARIŞ clock counts from.
 *
 * Pure (type-only store imports), so scripts/check-car-mode.ts runs it under tsx.
 */
import type {
  DriveSessionContext,
  RoutePlanData,
} from "../services/DriveSessionStore";
import { destinationTitle } from "../services/placeTitle";
import { formatKm, formatMinutes } from "./route-sheet/routeFormat";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * The charging the trip's stops need, in minutes. A plan without a stop can
 * still report a duration, and that one is never spent.
 */
export function chargingMinutes(plan?: RoutePlanData | null): number {
  const stops = plan?.summary?.total_station_count ?? 0;
  const minutes = plan?.summary?.total_charge_duration;
  return stops > 0 && isNumber(minutes) && minutes > 0 ? minutes : 0;
}

export type TripSummary = {
  destination: string;
  detail: string | null;
  line: string;
  tripTime: string | null;
};

/**
 * The drive the driver is shown, in minutes: the plan's own travel duration.
 * Every trip number on screen comes from this one — the route sheet's SÜRÜŞ
 * stat, its "şarj dahil" subtitle, the reopen capsule — so the VARIŞ clock
 * counts from it too. The route's (Google's) duration is only the fallback
 * for a route carried without a plan; preferring it put VARIŞ minutes away
 * from the total printed right under it.
 */
function driveMinutes(plan?: RoutePlanData | null): number | null {
  const minutes = plan?.summary?.total_travel_duration;
  return isNumber(minutes) && minutes > 0 ? minutes : null;
}

/** What the driver wants to see about the planned trip at a glance; null without a plan. */
export function planTripSummary(plan?: RoutePlanData | null): TripSummary | null {
  if (!plan) return null;
  // The same short title as the sheet and Oturumlar: "Alemdağ Cd. No:940",
  // not the geocoder's whole postal address.
  const place = destinationTitle(plan);
  const destination = place?.title ?? "Hedef";
  const parts: string[] = [];
  // The same formats as the route sheet right below: "34,6 km", "1 sa 35 dk".
  const distance = formatKm(plan.summary?.total_travel_length);
  if (distance) parts.push(distance);
  const stops = plan.summary?.total_station_count ?? 0;
  parts.push(stops > 0 ? `${stops} şarj durağı` : "şarj durağı yok");
  const charge = formatMinutes(chargingMinutes(plan));
  if (charge) parts.push(`${charge} şarj`);
  // The capsule's time: the whole trip, charging included. The same sum the
  // VARIŞ clock counts (tripDurationSeconds), so the two never disagree.
  const tripTime = formatMinutes((driveMinutes(plan) ?? 0) + chargingMinutes(plan));
  return {
    destination,
    detail: place?.detail ?? null,
    line: parts.join(" · "),
    tripTime,
  };
}

/**
 * How long the trip takes, in seconds: the plan's drive plus the charging its
 * stops need — the very sum the sheet below prints as "şarj dahil …", so the
 * header's VARIŞ and that line are one number in two places. Counting only
 * the drive put VARIŞ a charge's worth early; counting the route's own
 * duration instead of the plan's put it minutes away from the total printed
 * under it, which is the same bug wearing a different sign. The route's
 * duration is the fallback for a route carried without a plan. Null when no
 * duration is known.
 */
export function tripDurationSeconds(
  context?: DriveSessionContext | null,
): number | null {
  const plan = context?.routePlanData;
  const chargeSeconds = chargingMinutes(plan) * 60;

  const minutes = driveMinutes(plan);
  if (minutes !== null) return minutes * 60 + chargeSeconds;

  // No plan duration: a route set on its own still knows how long its roads take.
  const durationFromRoute = context?.route?.summary?.duration;
  if (isNumber(durationFromRoute) && durationFromRoute > 0) {
    return durationFromRoute + chargeSeconds;
  }

  return null;
}
