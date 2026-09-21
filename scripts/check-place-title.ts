/**
 * Asserts the destination-title helpers behind the route sheet, the car-mode
 * header, the reopen capsule and Oturumlar. No test runner is installed, so
 * this runs under tsx:
 *
 *   npx tsx scripts/check-place-title.ts
 */
import assert from "node:assert/strict";

import { fromOrigin, withAblative } from "../components/route-sheet/routeFormat";
import type { RoutePlanData } from "../services/DriveSessionStore";
import {
  cleanAddress,
  destinationTitle,
  geocodeMatchesDestination,
  isCoordinatePair,
  isGenericOrigin,
  originTitle,
  parseDestinationDisplay,
  shortPlaceTitle,
  spokenDestinationTitle,
} from "../services/placeTitle";

let passed = 0;
const check = (name: string, fn: () => void) => {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
};

const METROGARDEN = "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul, Türkiye";

check("a full Turkish address becomes street + district", () => {
  assert.deepEqual(shortPlaceTitle(METROGARDEN), {
    title: "Alemdağ Cd. No:940",
    detail: "Ümraniye, İstanbul",
  });
  assert.deepEqual(
    shortPlaceTitle("Mimar Sinan Mah., Atatürk Blv. No:12, 06420 Çankaya/Ankara, Türkiye"),
    { title: "Atatürk Blv. No:12", detail: "Çankaya, Ankara" },
  );
  assert.deepEqual(
    shortPlaceTitle("Caferağa, Moda Cd. No:5, 34710 Kadıköy/İstanbul, Türkiye"),
    { title: "Moda Cd. No:5", detail: "Kadıköy, İstanbul" },
  );
});

check("a named place beats the street it stands on", () => {
  assert.deepEqual(
    shortPlaceTitle("Metrogarden AVM, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul, Türkiye"),
    { title: "Metrogarden AVM", detail: "Ümraniye, İstanbul" },
  );
  assert.deepEqual(
    shortPlaceTitle("Esenboğa Havalimanı (ESB), Balıkhisar, 06790 Çubuk/Ankara, Türkiye"),
    { title: "Esenboğa Havalimanı (ESB)", detail: "Çubuk, Ankara" },
  );
});

check("a place's name before its neighbourhood and street is the title", () => {
  assert.deepEqual(
    shortPlaceTitle(
      "Hilton Istanbul Bosphorus, Harbiye, Cumhuriyet Cd. No:50, 34367 Şişli/İstanbul, Türkiye",
    ),
    { title: "Hilton Istanbul Bosphorus", detail: "Şişli, İstanbul" },
  );
  assert.deepEqual(
    shortPlaceTitle("Forum İstanbul, Kocatepe, Paşa Cd., 34045 Bayrampaşa/İstanbul, Türkiye"),
    { title: "Forum İstanbul", detail: "Bayrampaşa, İstanbul" },
  );
  assert.deepEqual(
    shortPlaceTitle("Kadıköy İskelesi, Caferağa, Rıhtım Cd., 34710 Kadıköy/İstanbul, Türkiye"),
    { title: "Kadıköy İskelesi", detail: "Kadıköy, İstanbul" },
  );
  // One plain part before the street is its neighbourhood: the street stays.
  assert.deepEqual(shortPlaceTitle(METROGARDEN), {
    title: "Alemdağ Cd. No:940",
    detail: "Ümraniye, İstanbul",
  });
});

check("more named-place words; a street or neighbourhood named after one is no place", () => {
  assert.equal(
    shortPlaceTitle("Vadi İstanbul Park, Ayazağa, Cendere Cd. No:109, 34485 Sarıyer/İstanbul, Türkiye")
      .title,
    "Vadi İstanbul Park",
  );
  assert.equal(
    shortPlaceTitle("Zorlu Center, Levazım, Koru Sk. No:2, 34340 Beşiktaş/İstanbul, Türkiye").title,
    "Zorlu Center",
  );
  assert.equal(
    shortPlaceTitle("Galata Kulesi, Bereketzade, Galata Kulesi Sk., 34421 Beyoğlu/İstanbul, Türkiye")
      .title,
    "Galata Kulesi",
  );
  assert.equal(
    shortPlaceTitle("Bolu Dağı Tesisleri, D-100, 14100 Bolu Merkez/Bolu, Türkiye").title,
    "Bolu Dağı Tesisleri",
  );
  assert.equal(
    shortPlaceTitle("Hastane Mah., Park Cd. No:3, 34000 Fatih/İstanbul, Türkiye").title,
    "Park Cd. No:3",
  );
});

check("an address without commas gets the same street/district split", () => {
  assert.deepEqual(
    shortPlaceTitle("Alemdağ Cd. No:940 34773 Ümraniye/İstanbul Türkiye"),
    { title: "Alemdağ Cd. No:940", detail: "Ümraniye, İstanbul" },
  );
  assert.deepEqual(
    shortPlaceTitle("Barbaros Mah. Atatürk Cd. No: 5 34746 Ataşehir/İstanbul"),
    { title: "Atatürk Cd. No: 5", detail: "Ataşehir, İstanbul" },
  );
  assert.deepEqual(
    shortPlaceTitle("Metrogarden AVM Alemdağ Cd. No:940 Ümraniye/İstanbul"),
    { title: "Metrogarden AVM", detail: "Ümraniye, İstanbul" },
  );
  // "Park" names the street here, not a place.
  assert.deepEqual(shortPlaceTitle("Moda Park Sk. No:12 34710 Kadıköy/İstanbul"), {
    title: "Moda Park Sk. No:12",
    detail: "Kadıköy, İstanbul",
  });
  // Long but plain: nothing to cut.
  assert.deepEqual(shortPlaceTitle("Sabiha Gökçen Uluslararası Havalimanı"), {
    title: "Sabiha Gökçen Uluslararası Havalimanı",
    detail: null,
  });
  assert.equal(
    cleanAddress("Alemdağ Cd. No:940 34773 Ümraniye/İstanbul Türkiye"),
    "Alemdağ Cd. No:940 34773 Ümraniye/İstanbul",
  );
});

check("no street: the neighbourhood, else the first part", () => {
  assert.deepEqual(shortPlaceTitle("Barbaros Mah., 34746 Ataşehir/İstanbul, Türkiye"), {
    title: "Barbaros Mah.",
    detail: "Ataşehir, İstanbul",
  });
  assert.deepEqual(shortPlaceTitle("Necip Fazıl, 34773 Ümraniye/İstanbul, Türkiye"), {
    title: "Necip Fazıl",
    detail: "Ümraniye, İstanbul",
  });
  assert.deepEqual(shortPlaceTitle("34000 İstanbul/İstanbul, Türkiye"), {
    title: "İstanbul",
    detail: null,
  });
});

check("without a postcode, plain names after the street are the detail", () => {
  assert.deepEqual(shortPlaceTitle("Bağdat Cd. No:10, Kadıköy, İstanbul, Türkiye"), {
    title: "Bağdat Cd. No:10",
    detail: "Kadıköy, İstanbul",
  });
  assert.deepEqual(
    shortPlaceTitle("Kavaklıdere, Tunalı Hilmi Cd., No:88, 06680 Çankaya/Ankara"),
    { title: "Tunalı Hilmi Cd. No:88", detail: "Çankaya, Ankara" },
  );
});

check("short names stay as they are", () => {
  for (const name of [
    "Kızılay, Ankara",
    "Kadıköy, İstanbul",
    "Konumunuz",
    "Çekmeköy Metrogarden AVM",
    "ZES Bolu Dağı Tesisleri",
  ]) {
    assert.deepEqual(shortPlaceTitle(name), { title: name, detail: null });
  }
  // The country alone is dropped even from a short name.
  assert.deepEqual(shortPlaceTitle("Ankara, Türkiye"), { title: "Ankara", detail: null });
});

check("the address line drops only the country", () => {
  assert.equal(cleanAddress(METROGARDEN), "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul");
  assert.equal(cleanAddress("Kızılay, Ankara"), "Kızılay, Ankara");
});

const plan = (
  destination: string,
  // Raw, as the agent may send it: not yet read into RouteDestinationDisplay.
  extra: { destination_display?: unknown } = {},
) =>
  ({
    locations: [
      { type: "origin", name: "Konumunuz" },
      { type: "destination", name: destination },
    ],
    waypoints: { origin: "41.0082,28.9784", destination: "41.0154991,29.1787586", stops: [] },
    ...extra,
  }) as unknown as RoutePlanData;

check("destinationTitle: the agent's display title first", () => {
  assert.deepEqual(
    destinationTitle(plan(METROGARDEN, { destination_display: { title: "Metrogarden AVM" } })),
    {
      title: "Metrogarden AVM",
      detail: "Ümraniye, İstanbul",
      address: "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul",
    },
  );
  assert.deepEqual(
    destinationTitle(
      plan(METROGARDEN, {
        destination_display: { title: "Metrogarden AVM", subtitle: "Çekmeköy, İstanbul" },
      }),
    )?.detail,
    "Çekmeköy, İstanbul",
  );
});

check("destinationTitle: the address helper without one; no address line for short names", () => {
  assert.deepEqual(destinationTitle(plan(METROGARDEN)), {
    title: "Alemdağ Cd. No:940",
    detail: "Ümraniye, İstanbul",
    address: "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul",
  });
  assert.deepEqual(destinationTitle(plan("Kızılay, Ankara")), {
    title: "Kızılay, Ankara",
    detail: null,
    address: null,
  });
});

check("destinationTitle: coordinates never become a title, wherever they come from", () => {
  const noName = {
    locations: [],
    waypoints: { origin: "", destination: "41.0154991,29.1787586", stops: [] },
  } as unknown as RoutePlanData;
  assert.equal(destinationTitle(noName), null);
  assert.equal(destinationTitle(noName, "Kızılay, Ankara")?.title, "Kızılay, Ankara");
  // A stored record's destination column, and a pin's destination location.
  assert.equal(destinationTitle(noName, "41.0154991,29.1787586"), null);
  assert.equal(destinationTitle(plan("41.0154991, 29.1787586")), null);
  const named = { ...noName, waypoints: { ...noName.waypoints, destination: "Kızılay" } };
  assert.equal(destinationTitle(named)?.title, "Kızılay");
  assert.equal(isCoordinatePair("41.0154991,29.1787586"), true);
  assert.equal(isCoordinatePair("Kızılay, Ankara"), false);
});

check("parseDestinationDisplay reads only a usable title", () => {
  assert.equal(parseDestinationDisplay(undefined), undefined);
  assert.equal(parseDestinationDisplay({ title: "  " }), undefined);
  assert.deepEqual(parseDestinationDisplay("Metrogarden AVM"), { title: "Metrogarden AVM" });
  assert.deepEqual(
    parseDestinationDisplay({ title: " Metrogarden  AVM ", detail: "Ümraniye", address: "X" }),
    { title: "Metrogarden AVM", detail: "Ümraniye", address: "X" },
  );
});

check("the generic origin reads as 'Konumunuzdan'", () => {
  assert.equal(isGenericOrigin("Konumunuz"), true);
  assert.equal(isGenericOrigin("Mevcut konum"), true);
  assert.equal(isGenericOrigin("Kadıköy"), false);
  assert.equal(fromOrigin("Konumunuz"), "Konumunuzdan");
  assert.equal(fromOrigin("Mevcut konum"), "Konumunuzdan");
  assert.equal(fromOrigin("Kadıköy, İstanbul"), "Kadıköy, İstanbul'dan");
  assert.equal(fromOrigin(METROGARDEN), "Alemdağ Cd. No:940 çıkışlı");
  assert.equal(fromOrigin("  "), null);
});

check("ablative: possessive compounds take the n, unclear loanwords say 'çıkışlı'", () => {
  assert.equal(withAblative("Esenboğa Havalimanı"), "Esenboğa Havalimanı'ndan");
  assert.equal(withAblative("Taksim Meydanı"), "Taksim Meydanı'ndan");
  assert.equal(withAblative("Acıbadem Hastanesi"), "Acıbadem Hastanesi'nden");
  assert.equal(withAblative("Esenler Otogarı"), "Esenler Otogarı'ndan");
  assert.equal(withAblative("Haydarpaşa Garı"), "Haydarpaşa Garı'ndan");
  assert.equal(withAblative("Kadıköy İskelesi"), "Kadıköy İskelesi'nden");
  assert.equal(withAblative("Aşti Terminali"), "Aşti Terminali'nden");
  assert.equal(withAblative("Boğaziçi Üniversitesi"), "Boğaziçi Üniversitesi'nden");
  // Ordinary names keep the plain ending.
  assert.equal(withAblative("Beşiktaş"), "Beşiktaş'tan");
  assert.equal(withAblative("Şişli"), "Şişli'den");
  assert.equal(withAblative("Kızılay, Ankara"), "Kızılay, Ankara'dan");
  // Loanwords whose harmony cannot be read off the spelling.
  assert.equal(withAblative("Zorlu Center"), null);
  assert.equal(withAblative("İstinye Park"), null);
  assert.equal(withAblative("Mall of İstanbul"), "Mall of İstanbul'dan");
  assert.equal(withAblative("Emaar Square Mall"), null);
  assert.equal(withAblative("Skyland Tower"), null);
  assert.equal(fromOrigin("Zorlu Center, Levazım, Koru Sk. No:2, 34340 Beşiktaş/İstanbul, Türkiye"), "Zorlu Center çıkışlı");
  assert.equal(
    fromOrigin("Esenboğa Havalimanı, Balıkhisar, 06790 Çubuk/Ankara, Türkiye"),
    "Esenboğa Havalimanı'ndan",
  );
});

check("originTitle: 'Konumunuz' for the generic word, the short title otherwise, null for a pin", () => {
  assert.deepEqual(originTitle("Mevcut konum"), { title: "Konumunuz", detail: null, address: null });
  assert.deepEqual(originTitle(METROGARDEN), {
    title: "Alemdağ Cd. No:940",
    detail: "Ümraniye, İstanbul",
    address: "Necip Fazıl, Alemdağ Cd. No:940, 34773 Ümraniye/İstanbul",
  });
  assert.deepEqual(originTitle("Kadıköy, İstanbul"), {
    title: "Kadıköy, İstanbul",
    detail: null,
    address: null,
  });
  assert.equal(originTitle("41.0082,28.9784"), null);
  assert.equal(originTitle(""), null);
});

check("the spoken destination as a title: trimmed, capitalised, at most 40 characters", () => {
  assert.equal(spokenDestinationTitle("  çekmeköy metrogarden avm "), "Çekmeköy metrogarden avm");
  assert.equal(spokenDestinationTitle("istinye park"), "İstinye park");
  assert.equal(spokenDestinationTitle("ıhlamur köşkü"), "Ihlamur köşkü");
  assert.equal(spokenDestinationTitle("Anıtkabir."), "Anıtkabir");
  assert.equal(spokenDestinationTitle("41.0082,28.9784"), null);
  assert.equal(spokenDestinationTitle(""), null);
  assert.equal(spokenDestinationTitle(undefined), null);
  assert.equal(
    spokenDestinationTitle("Ankara'da Kızılay'daki büyük alışveriş merkezinin otoparkı"),
    null,
  );
});

check("a geocoded destination matches the plan by address or by a nearby arrival point", () => {
  const geocode = {
    query: "Metrogarden AVM",
    formattedAddress: METROGARDEN,
    lat: 41.0155,
    lng: 29.1788,
  };
  assert.equal(geocodeMatchesDestination(geocode, { name: METROGARDEN }), true);
  assert.equal(
    geocodeMatchesDestination(geocode, { name: "Sur Yapı Metrogarden AVM", lat: 41.0162, lng: 29.1795 }),
    true,
  );
  assert.equal(
    geocodeMatchesDestination(geocode, { name: "Kızılay, Ankara", lat: 39.9208, lng: 32.8541 }),
    false,
  );
  assert.equal(geocodeMatchesDestination(null, { name: METROGARDEN }), false);
});

console.log(`\n${passed} checks passed`);
