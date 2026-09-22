import { PHOTO_URL_MAX } from "../components/route-sheet/placePhoto";
import type {
  RoutePlanData,
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "./DriveSessionStore";
import { withoutProviderNamesInPlan } from "./providerNames";

/**
 * The cap on a photo path admitted to the store is the renderer's own
 * (PHOTO_URL_MAX in components/route-sheet/placePhoto, which is a module with
 * no runtime imports): a second copy of the number here would be a second
 * chance for the two to disagree. The endpoint and the origin are checked
 * there too, where the path becomes a URL.
 */

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
    // The gateway sends the chosen place's photo as a path on its own origin;
    // it is absent when the place has no photo, and placePhotoUri is what
    // turns it into a URL. The cap only keeps a nonsense value out of the store.
    photoUrl:
      typeof h.photo_url === "string" && h.photo_url.length <= PHOTO_URL_MAX
        ? h.photo_url
        : undefined,
    photoAttribution:
      typeof h.photo_attribution === "string" ? h.photo_attribution : undefined,
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

/**
 * The destination's own photo, as the gateway sends it beside the plan: a path
 * on its own origin and a plain-text credit, both simply absent when the place
 * has no photo. Anything of the wrong shape leaves both keys off the plan
 * rather than on it as undefined, so a plan with no photo is a plan with no
 * photo wherever it is read. destinationPhotoUri is what turns the path into a
 * URL; the cap only keeps a nonsense value out of the store.
 */
function destinationPhotoOf(raw: Record<string, unknown>) {
  const url = raw.destination_photo_url;
  if (typeof url !== "string" || url.length > PHOTO_URL_MAX) return {};
  const credit = raw.destination_photo_attribution;
  return {
    destination_photo_url: url,
    ...(typeof credit === "string" ? { destination_photo_attribution: credit } : {}),
  };
}

/** A highlight carrying either photo key — the test both strip paths share. */
function hasPhoto(
  highlight: RoutePlanInterestHighlight | undefined,
): highlight is RoutePlanInterestHighlight {
  return (
    !!highlight &&
    ("photoUrl" in highlight || "photoAttribution" in highlight)
  );
}

function highlightWithoutPhoto(
  highlight: RoutePlanInterestHighlight,
): RoutePlanInterestHighlight {
  // Object rest, so a highlight that never had the keys does not gain
  // `undefined` ones — a plan with no photo stays a plan with no photo.
  const { photoUrl: _url, photoAttribution: _credit, ...rest } = highlight;
  return rest;
}

/**
 * The plan with no photographs in it: the destination's and every break
 * suggestion's alike. This is the agent's withoutPhotos (apps/agent/src/tools/
 * route-planner) on the app's side of the wire, for the copy the app writes to
 * its own drive history.
 *
 * A photo path is signed and good for a day or two; stored, it can only ever
 * come back as a 403. Drawing one anyway means a header that mounts the photo
 * branch, reserves the slot and shifts its copy, and then collapses back when
 * the request fails — the one thing a plan without a photo never does. So a
 * stored plan carries no photo at all and a previewed drive is the photo-less
 * layout exactly, which is what the type's own comments promise.
 *
 * Spread-only and non-mutating: the same object comes back when there was
 * nothing to strip, so a plan that never had a photo is not copied.
 */
export function withoutPhotosInPlan(plan: RoutePlanData): RoutePlanData {
  const highlights = plan.interest_highlights ?? [];
  const locations = plan.locations ?? [];
  const carriesTop =
    "destination_photo_url" in plan || "destination_photo_attribution" in plan;
  if (
    !carriesTop &&
    !highlights.some(hasPhoto) &&
    !locations.some((location) => hasPhoto(location.interest_highlight))
  ) {
    return plan;
  }

  const {
    destination_photo_url: _photoUrl,
    destination_photo_attribution: _photoCredit,
    ...rest
  } = plan;
  return {
    ...rest,
    ...(plan.interest_highlights
      ? {
          interest_highlights: plan.interest_highlights.map((h) =>
            hasPhoto(h) ? highlightWithoutPhoto(h) : h,
          ),
        }
      : {}),
    ...(plan.locations
      ? {
          locations: plan.locations.map((location) =>
            hasPhoto(location.interest_highlight)
              ? {
                  ...location,
                  interest_highlight: highlightWithoutPhoto(
                    location.interest_highlight,
                  ),
                }
              : location,
          ),
        }
      : {}),
  };
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

  // The two destination-photo keys are taken off the plan and put back only
  // when they are the right shape: a spread of `data` alone would carry a
  // malformed one straight through.
  const {
    destination_photo_url: _photoUrl,
    destination_photo_attribution: _photoCredit,
    ...rest
  } = data;

  // Stop names and brands come from the route provider's data; the driver
  // never reads the provider's own name (services/providerNames).
  return withoutProviderNamesInPlan({
    ...rest,
    ...destinationPhotoOf(raw),
    locations,
    interest_highlights: highlights,
    route_optimization_summary:
      typeof raw.route_optimization_summary === "string"
        ? raw.route_optimization_summary
        : data.route_optimization_summary ?? "",
  });
}
