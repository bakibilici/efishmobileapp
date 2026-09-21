/**
 * Short names for a route's destination. The geocoder often hands over a full
 * postal address ("Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul,
 * Türkiye") where the driver asked for a place; titles show a compact part of
 * it and the full address goes on a secondary line.
 *
 * Pure (no React Native), so scripts/check-place-title.ts runs it under tsx.
 */
import type { RoutePlanData } from "./DriveSessionStore";

/** What a title shows: "Alemdağ Cd. No:940", detail "Ümraniye, İstanbul". */
export type PlaceTitle = { title: string; detail: string | null };

/** The agent's own display name for the destination (planEvRoute tool_end). */
export type RouteDestinationDisplay = {
  /** "Metrogarden AVM". */
  title: string;
  /** "Ümraniye, İstanbul". */
  detail?: string;
  /** The full address, when the agent sends one. */
  address?: string;
};

/** Titles, the address line and the district a screen shows for a destination. */
export type DestinationTitle = PlaceTitle & {
  /** The full address without the country; null when it says what the title says. */
  address: string | null;
};

/** Names up to this long, with no postcode and no country, are shown as they are. */
const SHORT_NAME_MAX = 32;

/** Case-folds Turkish by hand: "İ"/"I" become "i"/"ı" whatever the runtime's locale data. */
const fold = (text: string) =>
  text.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().trim();

const COUNTRIES = new Set(["türkiye", "turkiye", "turkey", "türkiye cumhuriyeti"]);
const isCountry = (segment: string) => COUNTRIES.has(fold(segment));

/** "34773 Ümraniye/İstanbul", "34773 Ümraniye", "Ümraniye/İstanbul". */
const POSTAL_AREA = /^(\d{5})\s+(.+)$/;
const SLASH_AREA = /^([^/\d]+)\/([^/\d]+)$/;

/** Cd., Cad., Sk., Sok., Blv., Bul. and the spelled-out words. */
const STREET_WORDS =
  "(?:cd|cad|sk|sok|blv|bul)\\.?|cadde|caddesi|sokak|sokağı|sokagi|bulvar|bulvarı|bulvari|yolu";
const STREET = new RegExp(`(?:^|\\s)(?:${STREET_WORDS})(?=\\s|$)`, "i");
const STREET_WORD = new RegExp(`^(?:${STREET_WORDS})$`, "i");
/** "No:940", "No: 12", "No.5". */
const HOUSE_NUMBER = /(?:^|\s)no\s*[:.]?\s*\d/i;
const ONLY_HOUSE_NUMBER = /^no\s*[:.]?\s*\d+[a-z]?$/i;
const NEIGHBOURHOOD = /(?:^|\s)(?:mah|mh)\.?(?=\s|$)|mahallesi(?=\s|$)/i;
const NEIGHBOURHOOD_WORD = /^(?:(?:mah|mh)\.?|mahallesi)$/i;
/**
 * Words that make a part a named place, better than any street it stands
 * on: "Metrogarden AVM", "Kadıköy İskelesi", "Zorlu Center". Matched on the
 * folded text, so "İ" needs no case rule.
 */
const PLACE_WORDS = [
  "avm",
  "alışveriş merkezi",
  "merkezi",
  "mall",
  "outlet",
  "hastanesi",
  "hastane",
  "havalimanı",
  "havaalanı",
  "üniversitesi",
  "kampüsü",
  "otogar",
  "otogarı",
  "terminali",
  "garı",
  "istasyonu",
  "iskele",
  "iskelesi",
  "liman",
  "limanı",
  "müze",
  "müzesi",
  "tesisleri",
  "tesisi",
  "kule",
  "kulesi",
  "stadyumu",
  "stadı",
  "park",
  "parkı",
  "plaza",
  "center",
  "centre",
  "camii",
  "otel",
  "oteli",
  "hotel",
  "rezidans",
].join("|");
const POINT_OF_INTEREST = new RegExp(`(?:^|\\s)(?:${PLACE_WORDS})(?=\\s|$|\\))`);
const PLACE_WORD = new RegExp(`^(?:${PLACE_WORDS})\\)?$`);

const isStreet = (segment: string) =>
  STREET.test(segment) || HOUSE_NUMBER.test(segment);
const isPlain = (segment: string) =>
  !isStreet(segment) && !NEIGHBOURHOOD.test(segment) && !/\d/.test(segment);
/** A named place, never a street ("Park Cd.") or a neighbourhood ("Hastane Mah."). */
const isPointOfInterest = (segment: string) =>
  !isStreet(segment) && !NEIGHBOURHOOD.test(segment) && POINT_OF_INTEREST.test(fold(segment));

const POSTCODE_WORD = /^\d{5}$/;
const SLASH_AREA_WORD = /^[^/\d]+\/[^/\d]+$/;
const NUMBER_WORD = /^\d+[a-z]?$/i;
const NO_WORD = /^no[:.]?$/i;

/**
 * Cuts an address written without commas where the commas would be: after
 * a named place ("… AVM"), after the neighbourhood ("… Mah."), after the
 * street and its number ("Alemdağ Cd. No:940"), before the postcode and the
 * "district/province" part, around the country. The street's own name
 * cannot be told from what precedes it, so it keeps that text.
 */
const splitWithoutCommas = (text: string): string[] => {
  const words = text.split(" ").filter(Boolean);
  const segments: string[] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.length) segments.push(current.join(" "));
    current = [];
  };
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = words[index + 1] ?? "";
    if (isCountry(word)) {
      flush();
      segments.push(word);
      continue;
    }
    if (POSTCODE_WORD.test(word)) {
      flush();
      current.push(word);
      continue;
    }
    if (SLASH_AREA_WORD.test(word)) {
      // "34773 Ümraniye/İstanbul" stays one part with its postcode.
      if (!(current.length === 1 && POSTCODE_WORD.test(current[0]))) flush();
      current.push(word);
      flush();
      continue;
    }
    current.push(word);
    if (NEIGHBOURHOOD_WORD.test(word)) {
      flush();
    } else if (STREET_WORD.test(word)) {
      // The street takes its number: "No:940", "No: 940", "No 940".
      if (ONLY_HOUSE_NUMBER.test(next)) {
        current.push(next);
        index += 1;
      } else if (NO_WORD.test(next) && NUMBER_WORD.test(words[index + 2] ?? "")) {
        current.push(next, words[index + 2]);
        index += 2;
      }
      flush();
    } else if (
      PLACE_WORD.test(fold(word)) &&
      // "Park Cd.", "Hastane Mah.": the word names the street, not a place.
      !STREET_WORD.test(next) &&
      !NEIGHBOURHOOD_WORD.test(next)
    ) {
      flush();
    }
  }
  flush();
  return segments;
};

const splitSegments = (name: string) => {
  const text = name.replace(/\s+/g, " ").trim();
  if (!text.includes(",")) return splitWithoutCommas(text);
  return text
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
};

/** Reads "34773 Ümraniye/İstanbul" as ["Ümraniye", "İstanbul"]; null for anything else. */
const readArea = (segment: string): string[] | null => {
  const postal = POSTAL_AREA.exec(segment);
  const place = postal ? postal[2].trim() : SLASH_AREA.test(segment) ? segment : null;
  if (!place) return null;
  const parts = place
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  // "34000 İstanbul/İstanbul" names the province twice.
  return parts.filter((part, index) => parts.findIndex((p) => fold(p) === fold(part)) === index);
};

/**
 * "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul, Türkiye" →
 * title "Alemdağ Cd. No:940", detail "Ümraniye, İstanbul". The country and
 * the postcode go; the title is a named place (AVM, havalimanı, iskelesi…)
 * when the address has one, else the first of two or more plain parts
 * before the street ("Hilton Istanbul Bosphorus, Harbiye, Cumhuriyet Cd.":
 * Google puts the neighbourhood just before the street, so the part before
 * it is the place's name), else the street with its number, else the
 * neighbourhood (Mah.), else the first part. The detail is the district and
 * province. Names that are already short ("Kızılay, Ankara") come back
 * untouched; an address without commas is cut where they would be.
 */
export function shortPlaceTitle(name: string): PlaceTitle {
  const full = name.replace(/\s+/g, " ").trim();
  const segments = splitSegments(full);
  const hasCountry = segments.some(isCountry);
  const hasPostcode = segments.some((segment) => POSTAL_AREA.test(segment));
  if (!full || (full.length <= SHORT_NAME_MAX && !hasCountry && !hasPostcode)) {
    return { title: full, detail: null };
  }

  const rest = segments.filter((segment) => !isCountry(segment));
  // The last segment that reads as "district/province" gives the detail.
  let area: string[] | null = null;
  for (let index = rest.length - 1; index >= 0; index -= 1) {
    const parsed = readArea(rest[index]);
    if (parsed?.length) {
      area = parsed;
      rest.splice(index, 1);
      break;
    }
  }
  if (!rest.length) {
    // Only a postcode area and the country: "34000 İstanbul, Türkiye".
    return area?.length
      ? { title: area.join(", "), detail: null }
      : { title: full, detail: null };
  }

  let titleIndex = rest.findIndex(isPointOfInterest);
  let title: string | null = titleIndex >= 0 ? rest[titleIndex] : null;
  if (title === null) {
    const streetIndex = rest.findIndex(isStreet);
    // "Name, Neighbourhood, Street": two plain parts before the street.
    if (streetIndex >= 2 && rest.slice(0, streetIndex).filter(isPlain).length >= 2) {
      titleIndex = rest.findIndex(isPlain);
      title = rest[titleIndex];
    }
  }
  if (title === null) {
    titleIndex = rest.findIndex(isStreet);
    if (titleIndex >= 0) {
      title = rest[titleIndex];
      // "Alemdağ Cd., No:940" split in two: read them as one.
      if (ONLY_HOUSE_NUMBER.test(title) && titleIndex > 0) {
        title = `${rest[titleIndex - 1]} ${title}`;
      } else if (
        !HOUSE_NUMBER.test(title) &&
        titleIndex + 1 < rest.length &&
        ONLY_HOUSE_NUMBER.test(rest[titleIndex + 1])
      ) {
        title = `${title} ${rest[titleIndex + 1]}`;
        titleIndex += 1;
      }
    }
  }
  if (title === null) {
    titleIndex = rest.findIndex((segment) => NEIGHBOURHOOD.test(segment));
    title = titleIndex >= 0 ? rest[titleIndex] : null;
  }
  if (title === null) {
    titleIndex = 0;
    title = rest[0];
  }

  // Without a postcode area, plain names after the title are the district and city.
  const detailParts =
    area ?? rest.slice(titleIndex + 1).filter(isPlain).slice(-2);
  const detail = detailParts
    .filter((part) => fold(part) !== fold(title))
    .join(", ");
  return { title, detail: detail || null };
}

/** The address as it reads on a secondary line: everything but the country. */
export function cleanAddress(name: string): string {
  const text = name.replace(/\s+/g, " ").trim();
  // Without commas the text stays as written; only a trailing country goes.
  if (!text.includes(",")) {
    const words = text.split(" ");
    while (words.length > 1 && isCountry(words[words.length - 1])) words.pop();
    return words.join(" ");
  }
  const segments = splitSegments(text).filter((segment) => !isCountry(segment));
  return segments.join(", ") || text;
}

/** "41.0154991,29.1787586": what the gateway puts in waypoints for a pin. */
export const isCoordinatePair = (text: string) =>
  /^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/.test(text);

/** The words a plan uses for "wherever the phone is" as its origin. */
const GENERIC_ORIGINS = new Set([
  "konumunuz",
  "konumum",
  "konumun",
  "konum",
  "mevcut konum",
  "mevcut konumunuz",
  "mevcut konumum",
  "şu anki konum",
  "current location",
  "your location",
  "my location",
]);
export const isGenericOrigin = (name: string) => GENERIC_ORIGINS.has(fold(name));

const readString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : undefined;

/** A name worth showing: text, and not a dropped pin's "lat,lng". */
const readName = (value: unknown): string | undefined => {
  const text = readString(value);
  return text && !isCoordinatePair(text) ? text : undefined;
};

/**
 * The origin as a route row, a map pin or Oturumlar names it: "Konumunuz"
 * for the plan's generic word (whichever one it used), else its short
 * title ("Alemdağ Cd. No:940") with the full address beside it. Null for a
 * pin's coordinates or no name, so the caller can say "Başlangıç".
 */
export function originTitle(name: unknown): DestinationTitle | null {
  const full = readName(name);
  if (!full) return null;
  if (isGenericOrigin(full)) return { title: "Konumunuz", detail: null, address: null };
  const { title, detail } = shortPlaceTitle(full);
  const address = cleanAddress(full);
  return { title, detail, address: fold(address) !== fold(title) ? address : null };
}

/** How long a spoken destination may be to serve as the route's title. */
const SPOKEN_TITLE_MAX = 40;

/**
 * The destination as the driver said it ("çekmeköy metrogarden avm" →
 * "Çekmeköy metrogarden avm"), used as the route's title when the agent
 * sends no display name: what they asked for reads better than the
 * geocoder's postal address. Null when it is empty, a pin's coordinates or
 * longer than 40 characters (a sentence, not a name).
 */
export function spokenDestinationTitle(query: unknown): string | null {
  const text = readString(query)
    ?.replace(/^["'“”‘’]+/, "")
    .replace(/["'“”‘’.!?]+$/, "")
    .trim();
  if (!text || text.length > SPOKEN_TITLE_MAX || isCoordinatePair(text)) return null;
  // Turkish capitals by hand: "i" → "İ", "ı" → "I".
  const first = text[0] === "i" ? "İ" : text[0] === "ı" ? "I" : text[0].toUpperCase();
  return first + text.slice(1);
}

/** What geocodeDestination reported for the destination the driver named. */
export type GeocodedDestination = {
  /** The destination as the driver said it (tool_start input.query). */
  query: string;
  /** tool_end result.formattedAddress. */
  formattedAddress?: string;
  lat?: number;
  lng?: number;
};

/** A route's destination and the geocoded point this close are the same place. */
const SAME_PLACE_M = 1000;

const metresBetween = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const toRad = Math.PI / 180;
  const x = (lng2 - lng1) * toRad * Math.cos(((lat1 + lat2) / 2) * toRad);
  const y = (lat2 - lat1) * toRad;
  return Math.sqrt(x * x + y * y) * 6371000;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Whether a planned route goes where the last geocodeDestination pointed:
 * the same address, or an arrival point within a kilometre of it (the
 * route service moves the point onto the road network).
 */
export function geocodeMatchesDestination(
  geocode: GeocodedDestination | null | undefined,
  destination: { name?: string | null; lat?: number | null; lng?: number | null },
): boolean {
  if (!geocode) return false;
  const address = readName(geocode.formattedAddress);
  const name = readName(destination.name);
  if (address && name && fold(cleanAddress(address)) === fold(cleanAddress(name))) {
    return true;
  }
  const { lat, lng } = destination;
  if (
    isFiniteNumber(geocode.lat) &&
    isFiniteNumber(geocode.lng) &&
    isFiniteNumber(lat) &&
    isFiniteNumber(lng)
  ) {
    return metresBetween(geocode.lat, geocode.lng, lat, lng) <= SAME_PLACE_M;
  }
  return false;
}

/**
 * The agent's destination_display, read defensively: an object with a title
 * (and optionally detail/subtitle and address), or a bare title string.
 * Undefined when there is no usable title.
 */
export function parseDestinationDisplay(raw: unknown): RouteDestinationDisplay | undefined {
  if (typeof raw === "string") {
    const title = readString(raw);
    return title ? { title } : undefined;
  }
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const title = readString(record.title) ?? readString(record.short_name) ?? readString(record.name);
  if (!title) return undefined;
  const detail = readString(record.detail) ?? readString(record.subtitle);
  const address = readString(record.address) ?? readString(record.full_address);
  return {
    title,
    ...(detail ? { detail } : {}),
    ...(address ? { address } : {}),
  };
}

type DestinationSource = Pick<RoutePlanData, "locations" | "waypoints"> & {
  destination_display?: unknown;
};

/**
 * The title every screen uses for a route's destination (sheet, car-mode
 * header, the reopen capsule, Oturumlar): the agent's destination_display
 * first, else a compact part of the destination's address. `fallbackName`
 * stands in when the plan names no destination (a stored record's column).
 */
export function destinationTitle(
  plan: DestinationSource | null | undefined,
  fallbackName?: string | null,
): DestinationTitle | null {
  const locations = Array.isArray(plan?.locations) ? plan.locations : [];
  const destination =
    locations.find((location) => location?.type === "destination") ??
    locations[locations.length - 1];
  // A dropped pin's "lat,lng" is never a title, wherever it comes from.
  const fullName =
    readName(destination?.name) ??
    readName(fallbackName) ??
    readName(plan?.waypoints?.destination);

  const display = parseDestinationDisplay(plan?.destination_display);
  const short = fullName ? shortPlaceTitle(fullName) : null;
  const title = display?.title ?? short?.title;
  if (!title) return null;

  const detail = display?.detail ?? short?.detail ?? null;
  const addressSource = display?.address ?? fullName;
  const address = addressSource ? cleanAddress(addressSource) : null;
  return {
    title,
    detail: detail && fold(detail) !== fold(title) ? detail : null,
    address: address && fold(address) !== fold(title) ? address : null,
  };
}
