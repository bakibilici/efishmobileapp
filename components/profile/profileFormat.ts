/**
 * Turkish text for Hesabım. Written by hand instead of through Intl or
 * toLocaleUpperCase: the dotted and dotless i must come out right whatever
 * locale data the JS engine carries.
 */

const MONTHS = [
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

/** Upper case in Turkish: i → İ and ı → I, which toUpperCase alone gets wrong. */
export function turkishUpper(text: string): string {
  return text.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/** The first character of a name, surrogate pairs kept whole. */
function firstLetter(name: string): string {
  return Array.from(name.trim())[0] ?? "";
}

/** "Emir furkan", "Bilici" → "EB"; "ilker", "ışık" → "İI". */
export function initialsOf(firstName: string, lastName: string): string {
  return turkishUpper(firstLetter(firstName) + firstLetter(lastName));
}

/** 14 Mart 2026, in the phone's own time zone. */
export function formatLongDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** 14:05, padded by hand. */
export function formatClock(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A mobile number as it is typed, grouped like the placeholder
 * (5XX XXX XX XX). Past ten digits the grouping stops and every digit stays,
 * so a number typed with a leading 0 reads as too long instead of being cut
 * into a different, valid-looking one.
 */
export function formatPhoneInput(text: string): string {
  const digits = text.replace(/\D/g, "");
  if (digits.length > 10) return digits;
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)]
    .filter((part) => part.length > 0)
    .join(" ");
}
