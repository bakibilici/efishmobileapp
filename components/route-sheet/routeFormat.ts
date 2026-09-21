import type { RoutePlanLocation } from "../../services/DriveSessionStore";
import { isGenericOrigin, shortPlaceTitle } from "../../services/placeTitle";
import type { SheetPalette } from "./sheetPalette";

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** "4 sa 5 dk", "45 dk", "2 sa"; null when there is no duration. */
export const formatMinutes = (minutes?: number | null): string | null => {
  if (!isNumber(minutes) || minutes <= 0) return null;
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} dk`;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
};

/** "350 km", "42,5 km"; null when there is no distance. */
export const formatKm = (km?: number | null): string | null => {
  if (!isNumber(km) || km <= 0) return null;
  const rounded = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${String(rounded).replace(".", ",")} km`;
};

/** Turkish style: "%82". */
export const formatPercent = (value: number) => `%${Math.round(value)}`;

/** Battery level colour: green from 30 %, orange from 15 %, red below. */
export const levelColor = (level: number, palette: SheetPalette) =>
  level >= 30 ? palette.green : level >= 15 ? palette.orange : palette.red;

const BACK_VOWELS = "aıou";
const FRONT_VOWELS = "eiöü";
const HARD_CONSONANTS = "çfhkpsşt";

/**
 * Place words that end in the possessive of a compound ("Esenboğa
 * Havalimanı", "Acıbadem Hastanesi"): the case ending needs the buffer n,
 * "Havalimanı'ndan", "Hastanesi'nden".
 */
const POSSESSIVE_COMPOUND_HEADS = new Set([
  "havalimanı",
  "havaalanı",
  "meydanı",
  "hastanesi",
  "terminali",
  "garı",
  "otogarı",
  "istasyonu",
  "iskelesi",
  "limanı",
  "müzesi",
  "tesisleri",
  "tesisi",
  "kulesi",
  "üniversitesi",
  "kampüsü",
  "fakültesi",
  "stadyumu",
  "stadı",
  "parkı",
  "camii",
  "caddesi",
  "sokağı",
  "bulvarı",
  "yolu",
  "mahallesi",
  "merkezi",
  "köprüsü",
  "çarşısı",
  "pazarı",
  "sarayı",
  "kalesi",
  "plajı",
  "adası",
  "köyü",
  "belediyesi",
  "sitesi",
  "oteli",
  "bölgesi",
]);

/**
 * Loanwords whose Turkish reading, and so their vowel harmony, cannot be
 * told from the spelling ("Center" is read "sentır"): the caller says
 * "… çıkışlı" instead of guessing.
 */
const UNCLEAR_HARMONY_WORDS = new Set([
  "center",
  "centre",
  "mall",
  "park",
  "outlet",
  "tower",
  "towers",
  "hotel",
  "square",
  "city",
  "garden",
  "gardens",
  "point",
  "life",
  "residence",
  "residences",
  "village",
  "resort",
  "suites",
]);

/**
 * "Kadıköy, İstanbul" → "Kadıköy, İstanbul'dan", "Beşiktaş" → "Beşiktaş'tan",
 * "Esenboğa Havalimanı" → "Esenboğa Havalimanı'ndan", "Mevcut konum" →
 * "Mevcut konumdan". Null when the last word does not end in a letter, is
 * all capitals, or is a loanword with unclear harmony ("Zorlu Center"), so
 * the caller can phrase it another way.
 */
export const withAblative = (name: string): string | null => {
  const trimmed = name.trim();
  const lastWord = trimmed.split(/[\s,]+/).pop() ?? "";
  // All capitals is an abbreviation read letter by letter ("AVM'den") or an
  // ASCII "I" that may be "İ": neither can be told, so let the caller rephrase.
  if (lastWord === lastWord.toUpperCase()) return null;
  // Turkish casing by hand: the JS runtime lower-cases without the tr locale.
  const lower = lastWord.replace(/I/g, "ı").replace(/İ/g, "i").toLowerCase();
  const lastChar = lower.slice(-1);
  if (!lastChar || !/[a-zçğıöşü]/.test(lastChar)) return null;
  // English spelling ("Mall", "Tower", w/q/x): no reliable harmony.
  if (UNCLEAR_HARMONY_WORDS.has(lower) || /[wqx]/.test(lower)) return null;

  let vowel: "a" | "e" | null = null;
  for (let index = lower.length - 1; index >= 0; index -= 1) {
    if (BACK_VOWELS.includes(lower[index])) {
      vowel = "a";
      break;
    }
    if (FRONT_VOWELS.includes(lower[index])) {
      vowel = "e";
      break;
    }
  }
  if (!vowel) return null;

  const isProperNoun = lastWord[0] !== lastWord[0].toLowerCase();
  const apostrophe = isProperNoun ? "'" : "";
  // "Havalimanı'ndan": after a compound's possessive the ending takes an n.
  if (POSSESSIVE_COMPOUND_HEADS.has(lower)) {
    return `${trimmed}${apostrophe}nd${vowel}n`;
  }
  const consonant = HARD_CONSONANTS.includes(lastChar) ? "t" : "d";
  return `${trimmed}${apostrophe}${consonant}${vowel}n`;
};

/**
 * The origin as "from …": "Kadıköy, İstanbul'dan", a long address by its
 * short title ("Alemdağ Cd. No:940 çıkışlı"), and the plan's generic
 * "Konumunuz" as "Konumunuzdan" (it is no proper noun: "Konumunuz'dan" was
 * wrong; and the app speaks to the driver as "siz"). Null without an origin.
 */
export const fromOrigin = (origin?: string | null): string | null => {
  const name = origin?.trim();
  if (!name) return null;
  if (isGenericOrigin(name)) return "Konumunuzdan";
  const { title } = shortPlaceTitle(name);
  return withAblative(title) ?? `${title} çıkışlı`;
};

export type Leg = { duration: number; distance: number };

/**
 * legs[i] is the drive that ends at locations[i + 1]. Which location carries
 * a leg's numbers is read off the plan: when the lengths after the origin add
 * up to the route total each stop carries the drive into it, when the ones
 * before the destination do each stop carries the drive out of it. Anything
 * else keeps the older reading (this stop's numbers, else the next one's).
 */
export const computeLegs = (
  locations: RoutePlanLocation[],
  totalLength: number,
): Leg[] => {
  const lengthOf = (location: RoutePlanLocation) =>
    isNumber(location.travel_length) ? location.travel_length : 0;
  const durationOf = (location: RoutePlanLocation) =>
    isNumber(location.travel_duration) ? location.travel_duration : 0;

  const intoSum = locations.slice(1).reduce((sum, l) => sum + lengthOf(l), 0);
  const outOfSum = locations.slice(0, -1).reduce((sum, l) => sum + lengthOf(l), 0);
  const matchesTotal = (sum: number) =>
    totalLength > 0 && Math.abs(sum - totalLength) <= Math.max(1, totalLength * 0.02);
  const mode =
    matchesTotal(intoSum) && !matchesTotal(outOfSum)
      ? "into"
      : matchesTotal(outOfSum) && !matchesTotal(intoSum)
        ? "outOf"
        : "either";

  const legs: Leg[] = [];
  for (let index = 0; index < locations.length - 1; index += 1) {
    const from = locations[index];
    const to = locations[index + 1];
    if (mode === "into") {
      legs.push({ duration: durationOf(to), distance: lengthOf(to) });
    } else if (mode === "outOf") {
      legs.push({ duration: durationOf(from), distance: lengthOf(from) });
    } else {
      legs.push({
        duration: durationOf(from) || durationOf(to),
        distance: lengthOf(from) || lengthOf(to),
      });
    }
  }
  return legs;
};

const levelOf = (value: unknown): number | null =>
  isNumber(value) ? Math.max(0, Math.min(100, value)) : null;

/** Charge on leaving the origin. */
export const startLevel = (locations: RoutePlanLocation[]) =>
  levelOf(locations[0]?.battery_status?.from) ??
  levelOf(locations[0]?.battery_status?.to);

/** Charge on reaching the destination. */
export const arrivalLevel = (locations: RoutePlanLocation[]) => {
  const last = locations[locations.length - 1];
  return levelOf(last?.battery_status?.to) ?? levelOf(last?.battery_status?.from);
};

export type BatteryPoint = {
  at: number;
  level: number;
  /** "arrive" is a stop's low point before charging, "depart" the top of its jump. */
  kind: "start" | "arrive" | "depart" | "end";
};

/**
 * The battery level along the route: start, then each stop's arrival and
 * departure at the same distance, then the arrival. Null when any level is
 * missing, so the caller can fall back to a plain bar.
 */
export const batteryTrajectory = (
  locations: RoutePlanLocation[],
  legs: Leg[],
): { points: BatteryPoint[]; total: number } | null => {
  const start = startLevel(locations);
  const end = arrivalLevel(locations);
  if (start == null || end == null) return null;

  // Distances along the route; even spacing when the plan has none.
  const hasDistances = legs.length > 0 && legs.every((leg) => leg.distance > 0);
  const positions = [0];
  legs.forEach((leg, index) => {
    positions.push(positions[index] + (hasDistances ? leg.distance : 1));
  });

  const points: BatteryPoint[] = [{ at: 0, level: start, kind: "start" }];
  for (let index = 1; index < locations.length - 1; index += 1) {
    const location = locations[index];
    if (location.type !== "station") continue;
    const arrive = levelOf(location.battery_status?.from);
    const depart = levelOf(location.battery_status?.to);
    if (arrive == null || depart == null) return null;
    points.push({ at: positions[index], level: arrive, kind: "arrive" });
    points.push({ at: positions[index], level: depart, kind: "depart" });
  }
  const total = positions[positions.length - 1] || 1;
  points.push({ at: total, level: end, kind: "end" });
  return { points, total };
};

/** "DC 180 kW", "DC" or "180 kW"; null when the station says neither. */
export const stationPower = (location: RoutePlanLocation): string | null => {
  const power =
    isNumber(location.max_power) && location.max_power > 0
      ? `${Math.round(location.max_power)} kW`
      : null;
  return [location.cp_type?.trim(), power].filter(Boolean).join(" ") || null;
};

export const connectorCounts = (location: RoutePlanLocation): string | null => {
  const counts = [
    [location.hpc_count, "HPC"],
    [location.dc_count, "DC"],
    [location.ac_count, "AC"],
  ] as const;
  const parts = counts
    .filter(([count]) => isNumber(count) && count > 0)
    .map(([count, kind]) => `${count} ${kind}`);
  return parts.length ? parts.join(" · ") : null;
};

/** "%24 → %80"; null unless both levels are known. */
export const chargeRange = (location: RoutePlanLocation): string | null => {
  const from = levelOf(location.battery_status?.from);
  const to = levelOf(location.battery_status?.to);
  if (from == null || to == null) return null;
  return `${formatPercent(from)} → ${formatPercent(to)}`;
};

/** Case-folds Turkish by hand, so "I"/"İ" match "ı"/"i" whatever the runtime's locale data. */
const foldTurkish = (text: string) =>
  text.replace(/I/g, "ı").replace(/İ/g, "i").toLocaleLowerCase("tr-TR");

/**
 * "180 kW · 4 DC · 2 AC", then the brand when the name does not already say
 * it. The connector counts name the plug types, so the power drops cp_type;
 * without counts it keeps it ("DC 180 kW").
 */
export const stationHardware = (location: RoutePlanLocation): string | null => {
  const counts = connectorCounts(location);
  const kilowatts =
    isNumber(location.max_power) && location.max_power > 0
      ? `${Math.round(location.max_power)} kW`
      : null;
  const power = counts ? kilowatts : stationPower(location);
  const brand = location.brand?.trim();
  const showBrand =
    !!brand && !foldTurkish(location.name ?? "").includes(foldTurkish(brand));
  return [power, counts, showBrand ? brand : null].filter(Boolean).join(" · ") || null;
};

/** "31 dk şarj · %24 → %80", with whichever parts the stop has. */
export const stationChargeLine = (location: RoutePlanLocation): string | null => {
  const charge = formatMinutes(location.charge_duration);
  return (
    [charge ? `${charge} şarj` : null, chargeRange(location)].filter(Boolean).join(" · ") ||
    null
  );
};

/**
 * VoiceOver copy for the sheet's abbreviations: "1 sa 35 dk" → "1 saat 35
 * dakika", "%24" → "yüzde 24", "180 kW" → "180 kilovat", " · " → ", ".
 */
export const spoken = (text: string): string =>
  text
    .replace(/(\d+) sa\b/g, "$1 saat")
    .replace(/(\d+) dk\b/g, "$1 dakika")
    .replace(/(\d+(?:,\d+)?) km\b/g, "$1 kilometre")
    .replace(/(\d+) m\b/g, "$1 metre")
    .replace(/(\d+) kW\b/g, "$1 kilovat")
    .replace(/%(\d+)/g, "yüzde $1")
    .replace(/ · /g, ", ");

/** "31 dakika şarj, varışta yüzde 24, çıkışta yüzde 80" for a charging stop. */
export const spokenStationCharge = (location: RoutePlanLocation): string | null => {
  const charge = formatMinutes(location.charge_duration);
  const from = levelOf(location.battery_status?.from);
  const to = levelOf(location.battery_status?.to);
  const parts = [
    charge ? spoken(`${charge} şarj`) : null,
    from != null ? `varışta yüzde ${Math.round(from)}` : null,
    to != null ? `çıkışta yüzde ${Math.round(to)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
};
