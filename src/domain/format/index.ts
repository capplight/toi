/**
 * Shared formatters (Ф10 brief §4, Ф9 review deviation 2): money and dates for kk / ru with names from the constants
 * below. `Intl` is never asked for Kazakh: browsers often have no Kazakh locale data («М10», «3,000,000»), and the
 * server and the client must print the same text. `Intl.DateTimeFormat("en-GB" | "en-CA")` is used only to read the
 * numeric parts of a moment in a time zone. Time zone — a parameter, `Asia/Almaty` by default.
 */

export type Locale = "kk" | "ru";
export const DEFAULT_TZ = "Asia/Almaty";

/** Month names: kk nominative (after the day number «15 қараша»), ru genitive («15 ноября»). */
const MONTHS: Record<Locale, { long: string[]; short: string[] }> = {
  kk: {
    long: [
      "қаңтар",
      "ақпан",
      "наурыз",
      "сәуір",
      "мамыр",
      "маусым",
      "шілде",
      "тамыз",
      "қыркүйек",
      "қазан",
      "қараша",
      "желтоқсан",
    ],
    short: ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"],
  },
  ru: {
    long: [
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ],
    short: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  },
};

/** Weekdays, Sunday first (as `Date.getUTCDay`). */
const WEEKDAYS: Record<Locale, string[]> = {
  kk: ["жексенбі", "дүйсенбі", "сейсенбі", "сәрсенбі", "бейсенбі", "жұма", "сенбі"],
  ru: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
};

export const asLocale = (l: string | null | undefined): Locale => (l === "ru" ? "ru" : "kk");

/* ------------------------------------------------------------------ money */

/** «6 000 000 ₸»: groups of three digits joined by no-break spaces, a no-break space before ₸ (kk and ru alike). */
export function formatMoney(n: number): string {
  const sign = n < 0 ? "−" : "";
  const grouped = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} ₸`;
}

/* ------------------------------------------------------------------ calendar parts in a zone */

export type Parts = { y: number; m: number; d: number; hh: number; mm: number; weekday: number };

const partsFormats = new Map<string, Intl.DateTimeFormat>();
function partsFormat(tz: string): Intl.DateTimeFormat {
  let f = partsFormats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    partsFormats.set(tz, f);
  }
  return f;
}

/** A calendar date «YYYY-MM-DD» is taken as is (no zone); an instant is read in `tz`. */
export function partsOf(at: Date | string, tz = DEFAULT_TZ): Parts {
  if (typeof at === "string" && /^\d{4}-\d{2}-\d{2}$/.test(at)) {
    const [y, m, d] = at.split("-").map(Number) as [number, number, number];
    return { y, m, d, hh: 0, mm: 0, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
  }
  const date = typeof at === "string" ? new Date(at) : at;
  const p = partsFormat(tz).formatToParts(date);
  const v = (k: string) => Number(p.find((x) => x.type === k)?.value ?? 0);
  const y = v("year");
  const m = v("month");
  const d = v("day");
  return { y, m, d, hh: v("hour") % 24, mm: v("minute"), weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** «YYYY-MM-DD» of a moment in a zone (the event's «today»). */
export function dayKey(at: Date | string, tz = DEFAULT_TZ): string {
  const p = partsOf(at, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/* ------------------------------------------------------------------ texts */

/** «15 қараша» / «15 ноября». */
export function formatDayMonth(at: Date | string, locale: Locale, tz = DEFAULT_TZ): string {
  const p = partsOf(at, tz);
  return `${p.d} ${MONTHS[locale].long[p.m - 1]}`;
}

/** «15 қараша 2026» / «15 ноября 2026». */
export function formatDate(at: Date | string, locale: Locale, tz = DEFAULT_TZ): string {
  const p = partsOf(at, tz);
  return `${p.d} ${MONTHS[locale].long[p.m - 1]} ${p.y}`;
}

/** «15 қараша, 18:00» / «15 ноября, 18:00». */
export function formatDateTime(at: Date | string, locale: Locale, tz = DEFAULT_TZ): string {
  const p = partsOf(at, tz);
  return `${p.d} ${MONTHS[locale].long[p.m - 1]}, ${pad(p.hh)}:${pad(p.mm)}`;
}

/** «18:00». */
export function formatTime(at: Date | string, tz = DEFAULT_TZ): string {
  const p = partsOf(at, tz);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

/** «15.11» — compact (lists, «Анасы өзгертті · 12.11»). */
export function formatNumericDay(at: Date | string, tz = DEFAULT_TZ): string {
  const p = partsOf(at, tz);
  return `${pad(p.d)}.${pad(p.m)}`;
}

/** «12.11, 14:05» (members screen). */
export function formatNumericDateTime(at: Date | string, tz = DEFAULT_TZ): string {
  const p = partsOf(at, tz);
  return `${pad(p.d)}.${pad(p.m)}, ${pad(p.hh)}:${pad(p.mm)}`;
}

/** Date plate «10 / қаз» (upcoming payments). */
export function datePlate(at: Date | string, locale: Locale, tz = DEFAULT_TZ): { day: string; mon: string } {
  const p = partsOf(at, tz);
  return { day: pad(p.d), mon: MONTHS[locale].short[p.m - 1]! };
}

/** «Жексенбі» / «Воскресенье». */
export function formatWeekday(at: Date | string, locale: Locale, tz = DEFAULT_TZ): string {
  const w = WEEKDAYS[locale][partsOf(at, tz).weekday]!;
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Month name after the day number («қараша» / «ноября»). */
export function monthName(at: Date | string, locale: Locale, tz = DEFAULT_TZ): string {
  return MONTHS[locale].long[partsOf(at, tz).m - 1]!;
}

/* ------------------------------------------------------------------ relative days */

const dayNumber = (key: string) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86_400_000;

/** Calendar days from `then` to `now` in a zone: 0 = today, 1 = yesterday; never negative. */
export function daysAgo(then: Date | string, now: Date, tz = DEFAULT_TZ): number {
  return Math.max(0, Math.round(dayNumber(dayKey(now, tz)) - dayNumber(dayKey(then, tz))));
}

/** Calendar days from `now` to `day` («YYYY-MM-DD»): 0 = today, 1 = tomorrow, < 0 = past. */
export function daysUntil(day: string, now: Date, tz = DEFAULT_TZ): number {
  return Math.round(dayNumber(day) - dayNumber(dayKey(now, tz)));
}

/**
 * «бүгін / кеше / N күн бұрын»: which message to show (the texts live in content/messages, e.g. `common.time.*`).
 */
export function relativeDay(
  then: Date | string,
  now: Date,
  tz = DEFAULT_TZ,
): { kind: "today" | "yesterday" | "days"; days: number } {
  const days = daysAgo(then, now, tz);
  return { kind: days === 0 ? "today" : days === 1 ? "yesterday" : "days", days };
}
