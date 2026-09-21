import type {
  RoutePlanData,
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "./DriveSessionStore";
import { withoutProviderNamesInPlan } from "./providerNames";

function isSnakeHighlight(
  h: Record<string, unknown>,
): h is Record<string, unknown> & { interest_key: string } {
  return typeof h.interest_key === "string";
}

export function mapGatewayHighlightToApp(
  raw: Record<string, unknown> | RoutePlanInterestHighlight | null | undefined,
): RoutePlanInterestHighlight | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const h = raw as Record<string, unknown>;
  if (
    !isSnakeHighlight(h) &&
    typeof (h as unknown as RoutePlanInterestHighlight).interestKey === "string"
  ) {
    return raw as unknown as RoutePlanInterestHighlight;
  }
  if (!isSnakeHighlight(h)) return undefined;

  return {
    id: String(h.id ?? ""),
    interestKey: String(h.interest_key),
    interestLabel: String(h.interest_label ?? ""),
    icon: String(h.icon ?? "location-outline"),
    shortLabel: String(h.short_label ?? ""),
    title: String(h.title ?? ""),
    message: String(h.message ?? ""),
    stationName: String(h.station_name ?? ""),
    poiName: h.poi_name != null ? String(h.poi_name) : undefined,
    poiCategory: h.poi_category != null ? String(h.poi_category) : undefined,
    distanceM: typeof h.distance_m === "number" ? h.distance_m : undefined,
    stationIndex:
      typeof h.station_index === "number" ? h.station_index : undefined,
    poiSource:
      h.poi_source === "places" || h.poi_source === "none" ? h.poi_source : undefined,
    alternatives: Array.isArray(h.alternatives)
      ? h.alternatives.map(mapGatewayAlternative).filter((a) => a.name !== "")
      : undefined,
  };
}

function mapGatewayAlternative(raw: unknown): RoutePlanHighlightAlternative {
  const a = (raw ?? {}) as Record<string, unknown>;
  return {
    name: String(a.name ?? ""),
    title: typeof a.title === "string" ? a.title : undefined,
    category: typeof a.category === "string" ? a.category : undefined,
    distanceM: typeof a.distance_m === "number" ? a.distance_m : undefined,
    reason: typeof a.reason === "string" ? a.reason : undefined,
  };
}

/**
 * Full gateway URL including path, e.g. https://xxx.vercel.app/api/route-plan
 */
export function getRoutePlanGatewayUrl(): string {
  const raw = process.env.EXPO_PUBLIC_ROUTE_PLAN_GATEWAY_URL?.trim();
  if (!raw) {
    return "https://geocode-service.vercel.app/api/route-plan";
  }
  if (raw.includes("/api/route-plan")) {
    return raw;
  }
  return `${raw.replace(/\/$/, "")}/api/route-plan`;
}

export function isRoutePlanGatewayUrl(url: string): boolean {
  return url.includes("/api/route-plan");
}

export function normalizeRoutePlanFromGateway(
  data: RoutePlanData,
): RoutePlanData {
  const raw = data as unknown as Record<string, unknown>;
  const rawHighlights = raw.interest_highlights;
  const highlights: RoutePlanInterestHighlight[] = Array.isArray(rawHighlights)
    ? rawHighlights
        .map((x) =>
          mapGatewayHighlightToApp(x as Record<string, unknown>),
        )
        .filter((x): x is RoutePlanInterestHighlight => x != null)
    : [];

  const locations: RoutePlanLocation[] = (data.locations ?? []).map(
    (loc) => {
      const l = loc as unknown as Record<string, unknown>;
      const ih = mapGatewayHighlightToApp(
        l.interest_highlight as Record<string, unknown> | undefined,
      );
      return {
        ...loc,
        interest_highlight: ih,
      };
    },
  );

  // Stop names and brands come from the route provider's data; the driver
  // never reads the provider's own name (services/providerNames).
  return withoutProviderNamesInPlan({
    ...data,
    locations,
    interest_highlights: highlights,
    route_optimization_summary:
      typeof raw.route_optimization_summary === "string"
        ? raw.route_optimization_summary
        : data.route_optimization_summary ?? "",
  });
}
