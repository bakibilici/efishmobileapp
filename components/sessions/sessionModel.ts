/**
 * The Oturumlar list worked out from the stored drive records: each row's
 * title, its one-line summary and VoiceOver label, the day sections, the
 * search, and repeated trips shown once. Only what the list shows changes:
 * storage, export and delete still see every record.
 *
 * Pure (no React Native), so scripts/check-session-model.ts runs it under tsx.
 */
import type { RoutePlanData } from "../../services/DriveSessionStore";
import type { StoredDriveSessionRecord } from "../../services/driveSessionHistory";
import {
  cleanAddress,
  destinationTitle,
  isCoordinatePair,
  parseDestinationDisplay,
} from "../../services/placeTitle";
import {
  withoutProviderNames,
  withoutProviderNamesInTitle,
} from "../../services/providerNames";
import { formatKm, formatMinutes, spoken } from "../route-sheet/routeFormat";

export type SessionListItem = {
  /** The shown record's sessionId. */
  key: string;
  /** The newest record of the item: the one a tap opens. */
  session: StoredDriveSessionRecord;
  title: string;
  /** "14:05 · 34,6 km · 37 dk · 1 durak"; the active row's "Şu an açık" is not in it. */
  meta: string;
  spokenLabel: string;
  hasCharging: boolean;
  isActive: boolean;
  /** How many stored trips the item stands for (1 unless repeats were merged). */
  repeatCount: number;
};

export type SessionSection = { key: string; title: string; data: SessionListItem[] };

const FALLBACK_TITLE = "Kaydedilen rota";

// Section headers come in capitals already: toUpperCase turns "i" into "I".
const MONTH_HEADERS = [
  "OCAK",
  "ŞUBAT",
  "MART",
  "NİSAN",
  "MAYIS",
  "HAZİRAN",
  "TEMMUZ",
  "AĞUSTOS",
  "EYLÜL",
  "EKİM",
  "KASIM",
  "ARALIK",
];
const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];
const MONTH_SHORT = [
  "Oca",
  "Şub",
  "Mar",
  "Nis",
  "May",
  "Haz",
  "Tem",
  "Ağu",
  "Eyl",
  "Eki",
  "Kas",
  "Ara",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A "lat,lng" anywhere in a text (isCoordinatePair wants the whole text to be one). */
const COORDINATES = /-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+/;

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const positive = (value: unknown): number | null =>
  isNumber(value) && value > 0 ? value : null;

/**
 * Case-folds Turkish by hand, as placeTitle does: "İ"/"I" become "i"/"ı"
 * whatever the runtime's locale data ("İstanbul" and "istanbul" fold alike).
 */
export function foldForSearch(text: string): string {
  return text.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase().trim();
}

/**
 * What a query and a field are compared as: folded, and with the dotless ı
 * read as i, so "istanbul" also finds the "Istanbul" that international
 * place names are written with.
 */
const searchKey = (text: string) => foldForSearch(text).replace(/ı/g, "i");

const planOf = (session: StoredDriveSessionRecord): RoutePlanData | undefined => {
  const plan = session.routeContext?.routePlanData;
  return plan && typeof plan === "object" ? (plan as RoutePlanData) : undefined;
};

const locationsOf = (plan: RoutePlanData | undefined) =>
  Array.isArray(plan?.locations) ? plan.locations : [];

const namedText = (text: unknown): string | null =>
  typeof text === "string" && text.trim() && !isCoordinatePair(text) ? text : null;

const addressKey = (address: string) => foldForSearch(cleanAddress(address));

/**
 * The agent's short names by the address they stand for, from the records
 * that have one ("Sur Yapı Metrogarden AVM" for "Necip Fazıl, Alemdağ Cd.
 * No:940, …"). Records saved before the agent sent names only have the
 * geocoder's address: the same place is then called what a later trip
 * called it, not "Alemdağ Cd. No:940". Newest first, so the latest name wins.
 */
const titlesByAddress = (rows: StoredDriveSessionRecord[]) => {
  const titles = new Map<string, string>();
  for (const row of rows) {
    const display = parseDestinationDisplay(planOf(row)?.destination_display);
    if (!display?.address) continue;
    const title = withoutProviderNames(display.title);
    const key = addressKey(display.address);
    if (title && !titles.has(key)) titles.set(key, title);
  }
  return titles;
};

/**
 * The route sheet's and the car-mode header's title for the destination
 * (from the stored plan, else the record's destination column), then the
 * stored name, then the record's own title. A stored record keeps the names
 * as they were saved, so the providers' are taken out here.
 */
const resolveTitle = (row: StoredDriveSessionRecord, titles: Map<string, string>) => {
  const plan = planOf(row);
  if (!parseDestinationDisplay(plan?.destination_display)) {
    const destination = locationsOf(plan).find((location) => location?.type === "destination");
    for (const name of [row.destinationName, destination?.name]) {
      const address = namedText(name);
      const known = address ? titles.get(addressKey(address)) : undefined;
      if (known) return known;
    }
  }
  const destination = withoutProviderNamesInTitle(destinationTitle(plan, row.destinationName));
  if (destination) return destination.title;
  const stored = namedText(row.destinationName);
  const storedTitle = stored ? withoutProviderNames(stored) : "";
  if (storedTitle) return storedTitle;
  // An older record's "Konumunuz → 41.01,29.17": a pin's coordinates are never a title.
  const ownTitle = withoutProviderNames(row.title);
  return ownTitle && !COORDINATES.test(ownTitle) ? ownTitle : FALLBACK_TITLE;
};

/** Everything a search looks through, folded; one field per line so a query cannot span two. */
const searchTextOf = (row: StoredDriveSessionRecord, title: string) => {
  const plan = planOf(row);
  const display = parseDestinationDisplay(plan?.destination_display);
  const stored = namedText(row.destinationName);
  const fields: unknown[] = [
    title,
    display?.address ?? (stored ? cleanAddress(stored) : null),
    display?.detail,
    row.originName,
    // Charging stops by name: the route's stops hold only coordinates.
    ...locationsOf(plan).map((location) => location?.name),
  ];
  return fields
    .filter((field): field is string => typeof field === "string" && !!field.trim())
    .map((field) => searchKey(withoutProviderNames(field)))
    .join("\n");
};

type Bucket = { key: string; title: string; recent: "bugün" | "dün" | null };

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** Local calendar days, as iOS lists group by date: BUGÜN, DÜN, ÖNCEKİ 7/30 GÜN, then months. */
const bucketOf = (time: number, now: Date): Bucket => {
  const then = new Date(time);
  // Rounded: a day with a daylight-saving change is 23 or 25 hours long.
  const days = Math.round((startOfDay(now) - startOfDay(then)) / DAY_MS);
  if (days <= 0) return { key: "today", title: "BUGÜN", recent: "bugün" };
  if (days === 1) return { key: "yesterday", title: "DÜN", recent: "dün" };
  if (days <= 7) return { key: "week", title: "ÖNCEKİ 7 GÜN", recent: null };
  if (days <= 30) return { key: "month", title: "ÖNCEKİ 30 GÜN", recent: null };
  const year = then.getFullYear();
  const month = MONTH_HEADERS[then.getMonth()];
  return {
    key: `${year}-${then.getMonth()}`,
    title: year === now.getFullYear() ? month : `${month} ${year}`,
    recent: null,
  };
};

const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

/** "14:05", padded by hand: toLocaleTimeString depends on the runtime's locale data. */
const clock = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** When a trip was, as the row shows it: "14:05" today and yesterday, else "12 Eyl". */
const shownWhen = (date: Date, bucket: Bucket) =>
  bucket.recent ? clock(date) : `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;

/** The same for VoiceOver: "bugün 14:05", "12 Eylül", "12 Aralık 2025". */
const spokenWhen = (date: Date, bucket: Bucket, now: Date) => {
  if (bucket.recent) return `${bucket.recent} ${clock(date)}`;
  const day = `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
  return date.getFullYear() === now.getFullYear() ? day : `${day} ${date.getFullYear()}`;
};

type ResolvedRow = {
  session: StoredDriveSessionRecord;
  title: string;
  km: number | null;
  minutes: number | null;
  stations: number;
  isActive: boolean;
};

/**
 * The plan's own totals first, as the route sheet shows them, then the
 * record's columns (a route without a plan, or an older record).
 */
const resolveRow = (
  session: StoredDriveSessionRecord,
  title: string,
  activeSessionId: string | null,
): ResolvedRow => {
  const summary = planOf(session)?.summary;
  const km = positive(summary?.total_travel_length) ?? positive(session.distanceKm);
  const seconds = positive(session.durationSeconds);
  // The whole trip, charging included, as the route sheet's subtitle has it.
  const driving = positive(summary?.total_travel_duration);
  const minutes =
    driving != null
      ? driving + (positive(summary?.total_charge_duration) ?? 0)
      : seconds != null
        ? seconds / 60
        : null;
  const planStations = summary?.total_station_count;
  const stations = isNumber(planStations)
    ? planStations
    : isNumber(session.stationCount)
      ? session.stationCount
      : 0;
  return {
    session,
    title,
    km,
    minutes,
    stations: Math.max(0, Math.round(stations)),
    isActive: activeSessionId != null && session.sessionId === activeSessionId,
  };
};

const buildItem = (group: ResolvedRow[], bucket: Bucket, now: Date): SessionListItem => {
  const newest = group[0];
  const { session, title, km, minutes, stations, isActive } = newest;
  const date = new Date(session.updatedAt);
  const repeatCount = group.length;
  const distance = formatKm(km);
  const duration = formatMinutes(minutes);

  const meta = [
    repeatCount > 1 ? `${repeatCount} kez` : shownWhen(date, bucket),
    distance,
    duration,
    // The route sheet's own word; never "0 durak".
    stations > 0 ? `${stations} durak` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const when = spokenWhen(date, bucket, now);
  const spokenLabel = [
    title,
    isActive ? "şu an açık" : null,
    distance ? spoken(distance) : null,
    duration ? spoken(duration) : null,
    stations > 0 ? `${stations} şarj durağı` : null,
    repeatCount > 1 ? `${repeatCount} kez, en son ${when}` : when,
  ]
    .filter(Boolean)
    .join(", ");

  return {
    key: session.sessionId,
    session,
    title,
    meta,
    spokenLabel,
    hasCharging: stations > 0,
    isActive,
    repeatCount,
  };
};

/** Same destination, same distance to 100 m, same number of stops: the same trip again. */
const tripKey = (row: ResolvedRow) =>
  [foldForSearch(row.title), row.km != null ? Math.round(row.km * 10) : "", row.stations].join("|");

/**
 * The list's sections, newest first. With a query, only the records it
 * finds (title, address, district, origin, stop names). Within a section a
 * trip made again shows once, as its newest record with "2 kez"; the open
 * session is never merged, so it always shows as open.
 */
export function buildSessionSections(
  rows: StoredDriveSessionRecord[],
  opts: { now: Date; activeSessionId: string | null; query: string },
): SessionSection[] {
  const { now, activeSessionId } = opts;
  const sorted = [...rows].sort((a, b) => b.updatedAt - a.updatedAt);
  const titles = titlesByAddress(sorted);
  const query = searchKey(opts.query);

  const sections = new Map<string, { bucket: Bucket; groups: Map<string, ResolvedRow[]> }>();
  for (const session of sorted) {
    const title = resolveTitle(session, titles);
    if (query && !searchTextOf(session, title).includes(query)) continue;

    const row = resolveRow(session, title, activeSessionId);
    const bucket = bucketOf(session.updatedAt, now);
    let section = sections.get(bucket.key);
    if (!section) {
      section = { bucket, groups: new Map() };
      sections.set(bucket.key, section);
    }
    const key = row.isActive ? `active|${session.sessionId}` : tripKey(row);
    const group = section.groups.get(key);
    if (group) group.push(row);
    else section.groups.set(key, [row]);
  }

  return [...sections.values()].map(({ bucket, groups }) => ({
    key: bucket.key,
    title: bucket.title,
    data: [...groups.values()].map((group) => buildItem(group, bucket, now)),
  }));
}
