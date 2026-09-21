/**
 * The app is AKBA everywhere a driver can read it. The companies behind the
 * station feed and the route plan are never named on screen, even when their
 * own data carries the name (a station called "… Electrip Hub", a route
 * stop's brand). Code identifiers, URLs and storage keys keep the names: they
 * are invisible and renaming them would break things.
 *
 * Pure (no React Native imports), so scripts/check-station-markers.ts can run
 * it under tsx.
 */
import type {
  RoutePlanData,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "./DriveSessionStore";

/** Letters and digits a provider word cannot be glued to (Latin + Turkish; no \p{…}, to stay safe on Hermes). */
const WORD_CHAR = "A-Za-z0-9ÇĞİÖŞÜÂÎÛçğıöşüâîû";

/**
 * efish, e-fish, eFish, efiş, e-fiş, EFİŞ, electrip, ELECTRİP, electrıp,
 * elektrip, electripglobal: case-insensitive, with the Turkish dotted and
 * dotless i spelled out (the regex `i` flag does not fold "İ"). A match must
 * start a word and swallows the rest of it, so "ElectripGlobal" goes whole
 * while "Cafe Fish" or "Defish" are left alone. The character before the
 * word is captured (group 1) instead of a lookbehind, and put back.
 */
const PROVIDER_WORD = new RegExp(
  `(^|[^${WORD_CHAR}])(?:e[-‐‑]?f[iıİI](?:sh|ş)|ele[ck]tr[iıİI]p)[${WORD_CHAR}]*` +
    // The company's own suffixes go with it: "Electrip Global", "Electrip Maps".
    `(?:[ \\t-]+(?:global|maps)(?![${WORD_CHAR}]))?`,
  "gi",
);

/** Separators a removed word can leave dangling: "ZES - " or "( )". */
const EDGE_SEPARATORS = /^[\s\-–—|·•,:/]+|[\s\-–—|·•,:/]+$/g;

/** True when the text names one of the providers. */
export function mentionsProviderName(text: string | null | undefined): boolean {
  if (!text) return false;
  PROVIDER_WORD.lastIndex = 0;
  const found = PROVIDER_WORD.test(text);
  PROVIDER_WORD.lastIndex = 0;
  return found;
}

/**
 * The text without the providers' names: "Electrip Kadıköy" → "Kadıköy",
 * "ZES - eFish Hub" → "ZES - Hub", "Electrip" → "". Text that names none of
 * them comes back unchanged (same string), so callers can compare cheaply.
 */
export function withoutProviderNames(text: string): string {
  if (!mentionsProviderName(text)) return text;
  return text
    .replace(PROVIDER_WORD, "$1 ")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s*([-–—|·•])\s*(?:[-–—|·•]\s*)+/g, " $1 ")
    .replace(/\s+,/g, ",")
    .replace(/,(?:\s*,)+/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .replace(EDGE_SEPARATORS, "")
    .trim();
}

/**
 * withoutProviderNames for a field that may be absent. A text that was only a
 * provider's name becomes `fallback` (undefined unless given), so a brand of
 * "Electrip" disappears rather than showing as an empty line.
 */
export function cleanProviderText(
  text: string | undefined,
  fallback?: string,
): string | undefined {
  if (typeof text !== "string") return text;
  const cleaned = withoutProviderNames(text);
  if (cleaned === text) return text;
  return cleaned || fallback;
}

/** A charging stop whose own name was only a provider's name is still a charging stop. */
const STOP_FALLBACK_NAME = "Şarj istasyonu";

/**
 * A station's detail payload from the backend (the charge_area_detail socket
 * message, GET charge-areas/:id): its name, address and charge point names
 * without the providers' names. Anything else, or a payload that is not an
 * object, comes back as it was; the same object when there was nothing to clean.
 */
export function withoutProviderNamesInStationDetails<T>(details: T): T {
  if (typeof details !== "object" || details === null || Array.isArray(details)) {
    return details;
  }
  const record = details as Record<string, unknown>;
  const name =
    typeof record.name === "string"
      ? (cleanProviderText(record.name, STOP_FALLBACK_NAME) ?? record.name)
      : record.name;
  const address =
    typeof record.address === "string" ? withoutProviderNames(record.address) : record.address;
  let chargePoints = record.charge_points;
  if (Array.isArray(chargePoints)) {
    const cleaned = chargePoints.map((point: unknown) => {
      if (typeof point !== "object" || point === null) return point;
      const pointName = (point as Record<string, unknown>).name;
      if (typeof pointName !== "string") return point;
      const cleanedName = cleanProviderText(pointName, "Şarj noktası") ?? pointName;
      return cleanedName === pointName ? point : { ...point, name: cleanedName };
    });
    if (cleaned.some((point, i) => point !== (chargePoints as unknown[])[i])) {
      chargePoints = cleaned;
    }
  }
  if (
    name === record.name &&
    address === record.address &&
    chargePoints === record.charge_points
  ) {
    return details;
  }
  return { ...record, name, address, charge_points: chargePoints } as T;
}

/**
 * A place title (placeTitle's destinationTitle or originTitle) without the
 * providers' names, for titles built from stored records, which keep what
 * the route said when it was saved. Null when the title was nothing but a
 * provider's name, so the caller falls back as it does for no title.
 */
export function withoutProviderNamesInTitle<
  T extends { title: string; detail: string | null; address: string | null },
>(place: T | null): T | null {
  if (!place) return null;
  const title = withoutProviderNames(place.title);
  if (!title) return null;
  const detail = place.detail === null ? null : withoutProviderNames(place.detail) || null;
  const address = place.address === null ? null : withoutProviderNames(place.address) || null;
  if (title === place.title && detail === place.detail && address === place.address) {
    return place;
  }
  return { ...place, title, detail, address };
}

/** The break suggestion's texts: its station, title and reason. */
const cleanHighlight = (
  highlight: RoutePlanInterestHighlight,
  stationFallback: string,
): RoutePlanInterestHighlight => {
  const stationName = cleanProviderText(highlight.stationName, stationFallback) ?? "";
  const title = cleanProviderText(highlight.title) ?? "";
  const message = cleanProviderText(highlight.message) ?? "";
  return stationName === highlight.stationName &&
    title === highlight.title &&
    message === highlight.message
    ? highlight
    : { ...highlight, stationName, title, message };
};

const cleanLocation = (location: RoutePlanLocation): RoutePlanLocation => {
  const name = cleanProviderText(location.name, STOP_FALLBACK_NAME) ?? location.name;
  const brand = cleanProviderText(location.brand);
  const address = cleanProviderText(location.address);
  const highlight = location.interest_highlight
    ? cleanHighlight(location.interest_highlight, name)
    : location.interest_highlight;
  if (
    name === location.name &&
    brand === location.brand &&
    address === location.address &&
    highlight === location.interest_highlight
  ) {
    return location;
  }
  return { ...location, name, brand, address, interest_highlight: highlight };
};

/**
 * The route plan as the driver may see it: stop names, brands, addresses,
 * break suggestions, the plan's summary line and the waypoint labels without
 * the providers' names. The same object comes back when there was nothing
 * to clean.
 */
export function withoutProviderNamesInPlan(plan: RoutePlanData): RoutePlanData {
  const locations = (plan.locations ?? []).map(cleanLocation);
  const highlights = plan.interest_highlights?.map((highlight) =>
    cleanHighlight(highlight, STOP_FALLBACK_NAME),
  );
  const summaryLine =
    typeof plan.route_optimization_summary === "string"
      ? withoutProviderNames(plan.route_optimization_summary)
      : plan.route_optimization_summary;
  const waypoints = plan.waypoints
    ? {
        ...plan.waypoints,
        origin: cleanProviderText(plan.waypoints.origin) ?? "",
        destination: cleanProviderText(plan.waypoints.destination) ?? "",
        stops: Array.isArray(plan.waypoints.stops)
          ? plan.waypoints.stops.map((stop) =>
              typeof stop === "string" ? (cleanProviderText(stop, STOP_FALLBACK_NAME) ?? stop) : stop,
            )
          : plan.waypoints.stops,
      }
    : plan.waypoints;
  const unchanged =
    locations.every((location, i) => location === plan.locations?.[i]) &&
    (highlights ?? []).every((highlight, i) => highlight === plan.interest_highlights?.[i]) &&
    summaryLine === plan.route_optimization_summary &&
    (!plan.waypoints ||
      (waypoints!.origin === plan.waypoints.origin &&
        waypoints!.destination === plan.waypoints.destination &&
        (waypoints!.stops ?? []).every((stop, i) => stop === plan.waypoints.stops?.[i])));
  if (unchanged) return plan;
  return {
    ...plan,
    locations,
    ...(highlights ? { interest_highlights: highlights } : {}),
    route_optimization_summary: summaryLine,
    waypoints: waypoints!,
  };
}
