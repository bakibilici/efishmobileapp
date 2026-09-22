/**
 * Plain helpers behind a break suggestion's detail page and its rows: no
 * React Native imports, so scripts/check-break-detail.ts runs them under tsx.
 */
import type {
  RoutePlanHighlightAlternative,
  RoutePlanInterestHighlight,
  RoutePlanLocation,
} from "../../services/DriveSessionStore";
import { alternativeKind, type BreakKind } from "../../services/routePersonalization";
import { gatewayPhotoUri, readable } from "./placePhoto";
import { formatMinutes } from "./routeFormat";

/**
 * Whether the highlight names a place that exists. The gateway sends
 * poi_source 'none' with an empty name when it only has a generic suggestion;
 * a highlight mapped without the flag is trusted only when it carries a name.
 */
export const hasRealPlace = (highlight: RoutePlanInterestHighlight): boolean => {
  if (!highlight.poiName?.trim()) return false;
  return highlight.poiSource ? highlight.poiSource === "places" : true;
};

/** The real place's name, or null. */
export const placeName = (highlight: RoutePlanInterestHighlight): string | null =>
  hasRealPlace(highlight) ? highlight.poiName!.trim() : null;

export const formatWalkDistance = (meters?: number): string | null => {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  if (meters < 1000) return `~${Math.max(10, Math.round(meters / 10) * 10)} m`;
  return `~${(meters / 1000).toFixed(1).replace(".", ",")} km`;
};

/** "350 m", "1,2 km": the sheet's list rows show walking distance without the tilde. */
export const shortWalkDistance = (meters?: number): string | null =>
  formatWalkDistance(meters)?.replace(/^~/, "") ?? null;

/**
 * An unhurried walk, 4.5 km/h: the gateway ranker's pace (WALK_M_PER_MIN in
 * geocode-service's poi-features), so the page's minutes match the "5 dk
 * yürüme" of the ranker's reason, rounded the same way.
 */
export const WALK_METERS_PER_MINUTE = 75;

/** One-way walking minutes (at least 1), or null without a distance. */
export const walkMinutes = (meters?: number): number | null => {
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  return Math.max(1, Math.round(meters / WALK_METERS_PER_MINUTE));
};

/** "350 m · yaklaşık 5 dk yürüme", or null without a distance. */
export const walkLine = (meters?: number): string | null => {
  const distance = shortWalkDistance(meters);
  const minutes = walkMinutes(meters);
  if (!distance || !minutes) return null;
  return `${distance} · yaklaşık ${minutes} dk yürüme`;
};

/**
 * How the break fits the stop's charge: "Gidiş-dönüş yaklaşık 10 dk yürüme;
 * 31 dk şarjın içinde yaklaşık 21 dk kalır." A walk longer than the charge
 * says so; without a distance only the charge time is given; without a
 * charge time, nothing.
 */
export const chargeFitLine = (
  distanceM: number | undefined,
  chargeMinutes: number | undefined,
): string | null => {
  const charge = formatMinutes(chargeMinutes);
  if (!charge || chargeMinutes == null) return null;
  const oneWay = walkMinutes(distanceM);
  if (!oneWay) return `Şarj ${charge} sürüyor; mola bu süreye göre önerildi.`;
  const roundTrip = oneWay * 2;
  const left = Math.round(chargeMinutes) - roundTrip;
  if (left <= 0) {
    return `Gidiş-dönüş yaklaşık ${roundTrip} dk yürüme; ${charge} şarjdan uzun sürer.`;
  }
  return `Gidiş-dönüş yaklaşık ${roundTrip} dk yürüme; ${charge} şarjın içinde yaklaşık ${left} dk kalır.`;
};

/** Where a suggestion was opened: the stop's row it was tapped in, and that stop's place among the stops. */
export type OpenedAt = {
  station?: RoutePlanLocation | null;
  stationIndex?: number | null;
};

/**
 * The charging stop a suggestion belongs to, the surest match first: the
 * very stop it was opened from, or the stop carrying this very object; the
 * one stop whose suggestion has the same id; the stop at the place it was
 * opened at (a plan saved again keeps its objects' order, not the objects);
 * the stop of the same name, which two stops of one chain can share. Null
 * when nothing matches (the page then names the stop without its charge).
 */
export const stationForHighlight = (
  highlight: RoutePlanInterestHighlight,
  stations: readonly RoutePlanLocation[],
  openedAt: OpenedAt = {},
): RoutePlanLocation | null => {
  if (openedAt.station && stations.includes(openedAt.station)) return openedAt.station;
  const carrier = stations.find((location) => location.interest_highlight === highlight);
  if (carrier) return carrier;
  const id = highlight.id?.trim();
  if (id) {
    const sameId = stations.filter((location) => location.interest_highlight?.id?.trim() === id);
    if (sameId.length === 1) return sameId[0];
  }
  const index = openedAt.stationIndex;
  if (index != null && index >= 0 && index < stations.length) return stations[index];
  const name = highlight.stationName?.trim();
  return (name && stations.find((location) => location.name?.trim() === name)) || null;
};

/** A stop's coordinates as numbers, or null when they are missing or out of range. */
export const stopCoordinates = (
  location: Pick<RoutePlanLocation, "coordinates"> | null | undefined,
): { lat: number; lng: number } | null => {
  const lat = Number.parseFloat(String(location?.coordinates?.lat ?? ""));
  const lng = Number.parseFloat(String(location?.coordinates?.lon ?? ""));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
};

/**
 * Searches the place by name near the stop in the platform's maps app:
 * Apple Maps (maps://?q=…&sll=lat,lng) on iOS, the geo: intent (Google Maps)
 * on Android.
 */
export const mapsSearchUrl = (
  os: string,
  name: string,
  near: { lat: number; lng: number } | null,
): string => {
  const query = encodeURIComponent(name.trim());
  if (os === "android") {
    return near ? `geo:${near.lat},${near.lng}?q=${query}` : `geo:0,0?q=${query}`;
  }
  return near ? `maps://?q=${query}&sll=${near.lat},${near.lng}` : `maps://?q=${query}`;
};

/** The same search on the web, for a device where the maps app does not open. */
export const mapsWebUrl = (
  os: string,
  name: string,
  near: { lat: number; lng: number } | null,
): string => {
  const query = encodeURIComponent(name.trim());
  if (os === "android") {
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }
  return near
    ? `https://maps.apple.com/?q=${query}&sll=${near.lat},${near.lng}`
    : `https://maps.apple.com/?q=${query}`;
};

const KIND_TITLE: Record<BreakKind, string> = {
  coffee: "Kahve molası",
  food: "Yemek molası",
  dessert: "Tatlı molası",
  shopping: "Alışveriş molası",
  worship: "İbadet molası",
  restroom: "İhtiyaç molası",
  park: "Yürüyüş molası",
  viewpoint: "Manzara molası",
  sport: "Spor molası",
};

/**
 * What kind of break an alternative is: its category, else its title read
 * by the kinds' titles ("Kısa manzara molası"), so an option sent without
 * a category still gets its tile.
 */
export const alternativeKindOf = (
  alternative: RoutePlanHighlightAlternative,
): BreakKind | null => {
  const byCategory = alternativeKind(alternative);
  if (byCategory) return byCategory;
  const title = alternative.title?.trim().toLocaleLowerCase("tr-TR");
  if (!title) return null;
  const match = (Object.entries(KIND_TITLE) as [BreakKind, string][]).find(([, kindTitle]) =>
    title.includes(kindTitle.split(" ")[0].toLocaleLowerCase("tr-TR")),
  );
  return match?.[0] ?? null;
};

/** The alternative's own name, when it is a readable one. */
export const alternativeName = (
  alternative: RoutePlanHighlightAlternative,
): string | null => readable(alternative.name);

/**
 * The alternatives worth listing: those with a name or a title, leaving out
 * every one of a kind the driver ruled out, the kind read as its tile reads
 * it (alternativeKindOf), so an option sent without a category but titled
 * "Kısa manzara molası" goes too when manzara is ruled out.
 */
export const listedAlternatives = (
  alternatives: readonly RoutePlanHighlightAlternative[] | undefined,
  excludedKinds: readonly string[],
): RoutePlanHighlightAlternative[] =>
  (alternatives ?? []).filter((alternative) => {
    if (!alternative || !(alternativeName(alternative) || readable(alternative.title))) return false;
    const kind = alternativeKindOf(alternative);
    return kind === null || !excludedKinds.includes(kind);
  });

/** "Manzara molası": the alternative's own title, else its category's. */
export const alternativeTitle = (
  alternative: RoutePlanHighlightAlternative,
): string | null => {
  const own = readable(alternative.title);
  if (own) return own;
  const kind = alternativeKind(alternative);
  return kind ? KIND_TITLE[kind] : null;
};

/**
 * The photo to show for a suggestion, as a full https URL on the app's own
 * gateway (placePhoto's one rule for every photo the sheet shows). A highlight
 * that names no real place never shows one, whatever it carries: a generic
 * suggestion has no place for a photograph to be of.
 */
export const placePhotoUri = (
  highlight: RoutePlanInterestHighlight,
  gatewayUrl: string,
): string | null =>
  hasRealPlace(highlight) ? gatewayPhotoUri(highlight.photoUrl, gatewayUrl) : null;

/** "Ayşe K." for the break page's credit under the photo, or null. */
export const photoCredit = (
  highlight: RoutePlanInterestHighlight,
): string | null => readable(highlight.photoAttribution);

/**
 * "Fotoğraflar: Ayşe K., Veli A." for the suggestions group's footer: the
 * credits of the photos actually on screen, de-duped, at most two, and null
 * when no shown photo is credited (Google sends no attribution for many
 * places, and an uncredited photo is a legitimate one). The plural follows the
 * names, not the photos: with one credited name among several photos,
 * "Fotoğraflar: Ayşe K." would read as if the uncredited ones were hers too.
 */
export const photoCreditLine = (
  highlights: readonly RoutePlanInterestHighlight[],
  gatewayUrl: string,
): string | null => {
  const shown = (highlights ?? []).filter(
    (highlight) => highlight && placePhotoUri(highlight, gatewayUrl) !== null,
  );
  const names: string[] = [];
  for (const highlight of shown) {
    const credit = photoCredit(highlight);
    if (credit && !names.includes(credit)) names.push(credit);
  }
  if (!names.length) return null;
  const credited = names.slice(0, 2);
  return `${credited.length > 1 ? "Fotoğraflar" : "Fotoğraf"}: ${credited.join(", ")}`;
};
