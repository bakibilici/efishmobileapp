/**
 * Asserts the Oturumlar list model: titles, the row summary and its spoken
 * form, day sections, the Turkish search and repeated trips. No test runner
 * is installed, so this runs under tsx:
 *
 *   npx tsx scripts/check-session-model.ts
 */
import assert from "node:assert/strict";

import {
  buildSessionSections,
  foldForSearch,
  type SessionSection,
} from "../components/sessions/sessionModel";
import type { StoredDriveSessionRecord } from "../services/driveSessionHistory";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const METROGARDEN = "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul, Türkiye";

// Local times: the sections and the clock read the phone's own calendar.
const NOW = new Date(2026, 8, 22, 18, 0);
const at = (daysAgo: number, hours = 14, minutes = 5) =>
  new Date(2026, 8, 22 - daysAgo, hours, minutes).getTime();

let seq = 0;
const record = (
  options: {
    destination?: string;
    display?: unknown;
    updatedAt?: number;
    km?: number;
    minutes?: number;
    chargeMinutes?: number;
    stations?: number;
    stops?: string[];
    origin?: string;
  } = {},
): StoredDriveSessionRecord => {
  seq += 1;
  const destination = options.destination ?? METROGARDEN;
  const stations = options.stations ?? 1;
  const stops = options.stops ?? Array.from({ length: stations }, (_, i) => `ZES Durak ${i + 1}`);
  const updatedAt = options.updatedAt ?? at(0);
  return {
    id: seq,
    userId: 1,
    sessionId: `session-${seq}`,
    title: `Konumunuz → ${destination}`,
    originName: options.origin ?? "Konumunuz",
    destinationName: destination,
    state: "CAR_SESSION_ACTIVE",
    startedAt: updatedAt,
    updatedAt,
    endedAt: null,
    // The record's own columns differ from the plan on purpose: the plan wins.
    durationSeconds: 2897,
    distanceKm: 34.8,
    stationCount: stations,
    routeContext: {
      sessionId: `session-${seq}`,
      routePlanData: {
        locations: [
          { type: "origin", name: options.origin ?? "Konumunuz" },
          ...stops.map((name) => ({ type: "station", name })),
          { type: "destination", name: destination },
        ],
        summary: {
          total_travel_length: options.km ?? 34.6,
          total_travel_duration: options.minutes ?? 37,
          ...(options.chargeMinutes != null ? { total_charge_duration: options.chargeMinutes } : {}),
          total_station_count: stations,
        },
        waypoints: { origin: "", destination: "", stops: [] },
        ...(options.display ? { destination_display: options.display } : {}),
      },
    },
  };
};

const build = (rows: StoredDriveSessionRecord[], query = "", activeSessionId: string | null = null) =>
  buildSessionSections(rows, { now: NOW, activeSessionId, query });

const items = (sections: SessionSection[]) => sections.flatMap((section) => section.data);
const titles = (sections: SessionSection[]) => items(sections).map((item) => item.title);

check("Turkish casing folds by hand: İ/i and I/ı", () => {
  assert.equal(foldForSearch("İstanbul"), "istanbul");
  // The accents come off with the casing; the dotless ı carries none and
  // stays itself (the search key below is what reads it as i).
  assert.equal(foldForSearch("Işık"), "ısık");
  assert.equal(foldForSearch("  ÇANKAYA "), "cankaya");

  const rows = [
    record({ destination: "İstanbul Havalimanı", display: { title: "İstanbul Havalimanı" } }),
    record({ destination: "Işık Üniversitesi", display: { title: "Işık Üniversitesi" } }),
  ];
  assert.deepEqual(titles(build(rows, "istanbul")), ["İstanbul Havalimanı"]);
  assert.deepEqual(titles(build(rows, "ışık")), ["Işık Üniversitesi"]);
  assert.deepEqual(titles(build(rows, "IŞIK")), ["Işık Üniversitesi"]);
  // International names are written with a plain I: "istanbul" finds them too.
  const hilton = [record({ destination: "Hilton Istanbul Bosphorus, Harbiye, Cumhuriyet Cd. No:50" })];
  assert.equal(items(build(hilton, "istanbul")).length, 1);
});

check("a query typed without Turkish letters still finds the place", () => {
  // The reported misses: "Umraniye" found no trip to Ümraniye and "Parkturk"
  // no "Parktürk Şişhane DC" on the map (both searches fold the same way).
  assert.equal(foldForSearch("Parktürk"), "parkturk");
  assert.equal(foldForSearch("Ümraniye"), "umraniye");
  // The circumflex goes, the dotless ı stays (searchKey reads that as i).
  assert.equal(foldForSearch("Kâğıthane"), "kagıthane");
  assert.equal(foldForSearch("ŞİŞHANE"), "sishane");
  // Folding is idempotent: a folded name folds to itself.
  assert.equal(foldForSearch(foldForSearch("Göztepe Çarşısı")), foldForSearch("Göztepe Çarşısı"));

  const rows = [
    record({ destination: "Ümraniye, İstanbul", display: { title: "Ümraniye" } }),
    record({ destination: "Göztepe, İstanbul", display: { title: "Göztepe" } }),
    record({ destination: "Kâğıthane, İstanbul", display: { title: "Kâğıthane" } }),
  ];
  assert.deepEqual(titles(build(rows, "umraniye")), ["Ümraniye"]);
  assert.deepEqual(titles(build(rows, "ümraniye")), ["Ümraniye"]);
  assert.deepEqual(titles(build(rows, "GOZTEPE")), ["Göztepe"]);
  assert.deepEqual(titles(build(rows, "kagithane")), ["Kâğıthane"]);
});

check("an older record takes the name a later trip to the same address was given", () => {
  // Row 18: the agent named the place. Row 7: only the geocoder's address.
  const row18 = record({
    destination: "Sur Yapı Metrogarden Avm",
    display: { title: "Sur Yapı Metrogarden AVM", address: METROGARDEN },
    updatedAt: at(0, 0, 30),
  });
  const row7 = record({ destination: METROGARDEN, updatedAt: at(1, 23, 37) });
  assert.deepEqual(titles(build([row18, row7])), [
    "Sur Yapı Metrogarden AVM",
    "Sur Yapı Metrogarden AVM",
  ]);
  // Without the later trip it keeps the address's short title.
  assert.deepEqual(titles(build([row7])), ["Alemdağ Cd. No:940"]);
  // A pin's coordinates never become a title, not even from an older record's own title.
  const pin = record({ destination: "41.0154991,29.1787586" });
  assert.deepEqual(titles(build([pin])), ["Kaydedilen rota"]);
});

check("a search finds a trip by one of its charging stops", () => {
  const rows = [
    record({ destination: "Kızılay, Ankara", stops: ["ZES Bolu Dağı Tesisleri"] }),
    record({ destination: "Kadıköy, İstanbul", stops: ["Trugo Gebze"] }),
  ];
  assert.deepEqual(titles(build(rows, "bolu dağı")), ["Kızılay, Ankara"]);
  assert.deepEqual(titles(build(rows, "Ümraniye")), []);
  // The origin and the address are searched too; the providers' names are not.
  assert.equal(items(build([record()], "ümraniye")).length, 1);
  assert.equal(items(build([record({ stops: ["Electrip Kadıköy"] })], "electrip")).length, 0);
});

check("the row summary: time, distance, duration, stops; no '0 durak'", () => {
  const [item] = items(build([record({ display: { title: "Sur Yapı Metrogarden AVM" } })]));
  assert.equal(item.meta, "14:05 · 34,6 km · 37 dk · 1 durak");
  assert.equal(item.hasCharging, true);

  // Charging counts toward the trip, as in the route sheet's subtitle: 37 + 11.
  const [charged] = items(build([record({ chargeMinutes: 11 })]));
  assert.equal(charged.meta, "14:05 · 34,6 km · 48 dk · 1 durak");

  const [direct] = items(build([record({ stations: 0, km: 12.25, minutes: 95 })]));
  assert.equal(direct.meta, "14:05 · 12,3 km · 1 sa 35 dk");
  assert.equal(direct.hasCharging, false);

  // Older than yesterday: the date, not the time.
  const [older] = items(build([record({ updatedAt: at(10) })]));
  assert.equal(older.meta, "12 Eyl · 34,6 km · 37 dk · 1 durak");
});

check("the plan's totals first, then the record's columns", () => {
  const noPlan = record();
  noPlan.routeContext = { sessionId: noPlan.sessionId };
  const [item] = items(build([noPlan]));
  assert.equal(item.meta, "14:05 · 34,8 km · 48 dk · 1 durak");
});

check("the same trip twice in a day shows once, as '2 kez'", () => {
  const rows = [
    record({ display: { title: "Sur Yapı Metrogarden AVM" }, updatedAt: at(0, 16, 40) }),
    record({ display: { title: "Sur Yapı Metrogarden AVM" }, updatedAt: at(0, 9, 10) }),
    // Another length is another route.
    record({ display: { title: "Sur Yapı Metrogarden AVM" }, km: 41.2, updatedAt: at(0, 8) }),
  ];
  const list = items(build(rows));
  assert.equal(list.length, 2);
  assert.equal(list[0].meta, "2 kez · 34,6 km · 37 dk · 1 durak");
  assert.equal(list[0].repeatCount, 2);
  assert.equal(list[0].key, rows[0].sessionId);
  assert.equal(list[1].repeatCount, 1);

  // Other days are other sections: never merged across them.
  const acrossDays = [record({ updatedAt: at(0) }), record({ updatedAt: at(1) })];
  assert.equal(items(build(acrossDays)).length, 2);

  // The open session stands alone, and only it is marked open.
  const open = build(rows.slice(0, 2), "", rows[1].sessionId);
  assert.deepEqual(
    items(open).map((item) => [item.isActive, item.repeatCount]),
    [
      [false, 1],
      [true, 1],
    ],
  );
});

check("sections: BUGÜN, DÜN, ÖNCEKİ 7 GÜN, ÖNCEKİ 30 GÜN, then months", () => {
  const ages = [0, 1, 2, 7, 8, 30, 31, 60];
  const rows = ages.map((days, index) =>
    record({ destination: `Yer ${index}`, display: { title: `Yer ${index}` }, updatedAt: at(days) }),
  );
  rows.push(
    record({
      destination: "Eski",
      display: { title: "Eski" },
      updatedAt: new Date(2025, 11, 3, 10, 0).getTime(),
    }),
  );
  const sections = build(rows);
  assert.deepEqual(
    sections.map((section) => [section.title, section.data.map((item) => item.title)]),
    [
      ["BUGÜN", ["Yer 0"]],
      ["DÜN", ["Yer 1"]],
      ["ÖNCEKİ 7 GÜN", ["Yer 2", "Yer 3"]],
      ["ÖNCEKİ 30 GÜN", ["Yer 4", "Yer 5"]],
      ["AĞUSTOS", ["Yer 6"]],
      ["TEMMUZ", ["Yer 7"]],
      ["ARALIK 2025", ["Eski"]],
    ],
  );
  // Just after midnight, a trip late last night is DÜN.
  const midnight = buildSessionSections([record({ updatedAt: at(1, 23, 59) })], {
    now: new Date(2026, 8, 22, 0, 1),
    activeSessionId: null,
    query: "",
  });
  assert.equal(midnight[0].title, "DÜN");
  assert.equal(items(midnight)[0].meta.startsWith("23:59 · "), true);
});

check("the VoiceOver label spells the units out", () => {
  const [today] = items(build([record({ display: { title: "Sur Yapı Metrogarden AVM" } })]));
  assert.equal(
    today.spokenLabel,
    "Sur Yapı Metrogarden AVM, 34,6 kilometre, 37 dakika, 1 şarj durağı, bugün 14:05",
  );
  const [older] = items(
    build([record({ display: { title: "Kızılay" }, stations: 2, updatedAt: at(10), minutes: 95 })]),
  );
  assert.equal(older.spokenLabel, "Kızılay, 34,6 kilometre, 1 saat 35 dakika, 2 şarj durağı, 12 Eylül");
  const twice = [record({ updatedAt: at(1, 9, 0) }), record({ updatedAt: at(1, 8, 0) })];
  const [merged] = items(build(twice, "", null));
  assert.equal(merged.spokenLabel.endsWith("2 kez, en son dün 09:00"), true);
  const [open] = items(build([twice[0]], "", twice[0].sessionId));
  assert.equal(open.spokenLabel.startsWith("Alemdağ Cd. No:940, şu an açık, "), true);
});

console.log(`\n${passed} checks passed`);
