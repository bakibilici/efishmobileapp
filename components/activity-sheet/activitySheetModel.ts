/**
 * What the "Hareket Durumu" sheet (app/activity-sheet.tsx) shows, worked out
 * from the stores it reads: how long a state has held, the day's steps split
 * into what the sensor counted and what charging added, today's drives, the
 * words used for a permission, and the plain explanation of how AKBA decides.
 *
 * Every number here comes from a store; nothing is estimated and nothing is
 * filled in when a store has no answer — the screen says "bilinmiyor" instead.
 *
 * Pure (no React Native), so scripts/check-activity-sheet.ts runs it under tsx.
 */
import type { StoredDriveSessionRecord } from "../../services/driveSessionHistory";
import { formatKm, formatMinutes } from "../route-sheet/routeFormat";
import { buildSessionSections } from "../sessions/sessionModel";

/** What the sheet prints where a value is missing. */
export const EM_DASH = "—";

// ─── The state and how long it has held ──────────────────────────────────────

/**
 * "4 dk", "1 sa 12 dk", "1 dakikadan az"; null when the app never saw this
 * state start (it was already running when the screen opened), which the row
 * then says in words rather than inventing a start time.
 */
export function formatHoldDuration(ms: number | null): string | null {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return null;
  if (ms < 60_000) return "1 dakikadan az";
  return formatMinutes(ms / 60_000);
}

/** "54 km/sa"; null when there is no reading yet (toDisplayKmh gives -1). */
export function formatSpeed(displayKmh: number): string | null {
  if (!Number.isFinite(displayKmh) || displayKmh < 0) return null;
  return `${Math.round(displayKmh)} km/sa`;
}

// ─── Counts ──────────────────────────────────────────────────────────────────

/**
 * A count as the capsule that opens this sheet prints it: "1.430", Turkish
 * thousands separators. The same figure is read twice, one tap apart, so the
 * two must agree.
 *
 * Grouped by hand rather than through toLocaleString, for the reason
 * clockText pads by hand: the runtime's locale data is not ours to depend on,
 * and a number that regrouped itself on a differently configured phone would
 * be exactly the disagreement this exists to prevent.
 */
export function formatCount(value: number): string {
  if (!Number.isFinite(value)) return EM_DASH;
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ─── Today's steps ───────────────────────────────────────────────────────────

export type StepSnapshotLike = {
  rawSteps: number;
  effectiveSteps: number;
  isCharging: boolean;
};

export type StepBreakdown = {
  /** What the capsule shows: the sensor's steps with the charging bonus in them. */
  total: number;
  /** What the pedometer actually counted. */
  raw: number;
  /** The difference the ×2 multiplier added; 0 when the phone never charged today. */
  bonus: number;
  isCharging: boolean;
  /** No step has been recorded today: the group stays, with zeros. */
  isEmpty: boolean;
};

/**
 * The day's steps as three honest numbers. `bonus` is not a separate counter:
 * it is exactly what `effectiveSteps` holds above `rawSteps`, which is what
 * the ×2 multiplier (StepCalculator) added while the phone was charging.
 */
export function stepBreakdown(snapshot: StepSnapshotLike): StepBreakdown {
  const raw = Math.max(0, Math.round(snapshot.rawSteps));
  const total = Math.max(raw, Math.round(snapshot.effectiveSteps));
  return {
    total,
    raw,
    bonus: total - raw,
    isCharging: snapshot.isCharging,
    isEmpty: total === 0,
  };
}

// ─── Today's drives ──────────────────────────────────────────────────────────

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/** Local midnight: the sheet's "bugün" is the phone's own calendar day. */
export function startOfDay(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

const pad = (value: number) => (value < 10 ? `0${value}` : String(value));

/** "14:20", the phone's clock. */
export function clockText(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * One record's distance, as Oturumlar reads it: the plan's own total where
 * the record kept the plan, else the column written when the drive ended.
 * Null when neither is there, so a missing distance is never counted as 0.
 */
export function driveDistanceKm(record: StoredDriveSessionRecord): number | null {
  const summary = record.routeContext?.routePlanData?.summary;
  const planned = summary?.total_travel_length;
  if (isNumber(planned) && planned > 0) return planned;
  if (isNumber(record.distanceKm) && record.distanceKm > 0) return record.distanceKm;
  return null;
}

/** The records that started today, newest first. */
export function todayDrives(
  records: readonly StoredDriveSessionRecord[],
  now: Date,
): StoredDriveSessionRecord[] {
  const midnight = startOfDay(now);
  return records
    .filter((record) => record.startedAt >= midnight)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export type DriveSummary = {
  count: number;
  /** "34,6 km", or "—" when no record of the day carries a distance. */
  distanceText: string;
  /** The day's newest drive, named as Oturumlar names it. */
  last: { title: string; timeText: string } | null;
};

/**
 * Today's drives in the three lines the sheet shows. The title comes from
 * the Oturumlar model, so the same trip is called the same thing in both
 * places; the sheet never turns into a second Oturumlar (nothing is tappable).
 */
export function driveSummary(
  records: readonly StoredDriveSessionRecord[],
  now: Date,
): DriveSummary {
  const rows = todayDrives(records, now);
  if (!rows.length) return { count: 0, distanceText: EM_DASH, last: null };

  const distances = rows
    .map(driveDistanceKm)
    .filter((km): km is number => km != null);
  const total = distances.reduce((sum, km) => sum + km, 0);

  const sections = buildSessionSections(rows, { now, activeSessionId: null, query: "" });
  const newest = sections[0]?.data[0];

  return {
    count: rows.length,
    distanceText: (distances.length ? formatKm(total) : null) ?? EM_DASH,
    last: newest
      ? { title: newest.title, timeText: clockText(newest.session.startedAt) }
      : null,
  };
}

// ─── Permissions ─────────────────────────────────────────────────────────────

/** Expo's three answers, plus the case where the platform could not be asked. */
export type PermissionKind = "granted" | "denied" | "undetermined" | "unknown";

export type PermissionResponseLike = {
  granted?: boolean;
  status?: string;
} | null;

/** Expo's PermissionResponse, read without depending on the native module. */
export function permissionKind(response: PermissionResponseLike): PermissionKind {
  if (!response) return "unknown";
  if (response.granted) return "granted";
  if (response.status === "denied") return "denied";
  if (response.status === "undetermined") return "undetermined";
  if (response.status === "granted") return "granted";
  return "unknown";
}

export function permissionLabel(kind: PermissionKind): string {
  switch (kind) {
    case "granted":
      return "İzin verildi";
    case "denied":
      return "İzin verilmedi";
    case "undetermined":
      return "Sorulmadı";
    default:
      return "Bilinmiyor";
  }
}

/**
 * Which rows offer a trip to Ayarlar.
 *
 * Only the ones iOS actually has a switch for. A permission the app has
 * never asked for is not listed on its Settings page at all, so offering
 * "Ayarlar" for "undetermined" would send the driver to a page with nothing
 * to turn on — the row says what happens instead (permissionFooter).
 * "unknown" keeps the escape hatch: the read failed, so the page may well
 * carry the switch.
 */
export const opensSettings = (kind: PermissionKind) =>
  kind === "denied" || kind === "unknown";

/** The İZİNLER group's footer; gains a sentence when a permission was never asked. */
export function permissionFooter(...kinds: readonly PermissionKind[]): string {
  const base =
    "Adımlar Hareket ve Fitness iznine, hız ile sürüş algısı Konum iznine bağlıdır. " +
    "İzin verilmediğinde AKBA yalnızca elindeki veriyle çalışır.";
  const unasked = kinds.some((kind) => kind === "undetermined");
  return unasked
    ? `${base} Henüz sorulmamış bir izni AKBA, ilk ihtiyaç duyduğunda sizden isteyecektir.`
    : base;
}

// ─── How AKBA decides ────────────────────────────────────────────────────────

/**
 * The detection in plain Turkish, for the person reading the screen. Every
 * number in it is the one the code uses: the classifier's thresholds
 * (services/sensors/ActivityClassifier.ts: 1,2 and 2,2 adım/sn, 1,67 and
 * 4,17 m/sn, i.e. 6 and 15 km/sa), the five-second window
 * (services/sensors/ActivityPipeline.ts) and the state machine's waits
 * (services/ActivityStateMachine.ts 5 sn, services/ActivityService.ts 45 sn).
 * scripts/check-activity-sheet.ts reads those files and fails if a number
 * here stops matching them.
 */
export const DETECTION_EXPLANATION =
  "AKBA beş saniyede bir, son beş saniyenin adım ve hız verisine bakar. " +
  "Saniyede en az 1,2 adım yürüyüş sayılır; saniyede en az 2,2 adım ve saatte 6 km'nin üzerinde hız birlikte görülürse koşu sayılır. " +
  "Saatte 15 km'yi aşan hız diğer her şeyin önüne geçer ve araç olarak değerlendirilir. " +
  "Adım da hız da yoksa ve telefon sabit duruyorsa beklemede olduğunuz kabul edilir. " +
  "Bir durumun geçerli sayılması için beş saniye boyunca sürmesi gerekir; araçtan beklemeye geçiş ise kırk beş saniye bekler, böylece kırmızı ışıkta sürüş bitmiş sayılmaz. " +
  "Telefon şarja takılıyken durum, diğer her şeyin önünde şarj olarak görünür.";

/** The thresholds the explanation states, as the check script compares them. */
export const DETECTION_NUMBERS = {
  windowSeconds: 5,
  walkingStepsPerSecond: 1.2,
  runningStepsPerSecond: 2.2,
  runningSpeedMs: 1.67,
  carSpeedMs: 4.17,
  debounceMs: 5000,
  carToIdleDelayMs: 45000,
} as const;
