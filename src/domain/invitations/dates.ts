/**
 * Dates of the guest page (Ф5, DESIGN 8.17): «Жексенбі | 15 | қараша | 18:00» and «Тойға N күн қалды», counted in
 * calendar days of the event time zone (Asia/Almaty). Pure TS (plan 11.1).
 */
export type DateParts = { weekday: string; day: string; month: string; time: string | null };

const fmt = new Map<string, Intl.DateTimeFormat>();
function f(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let x = fmt.get(key);
  if (!x) fmt.set(key, (x = new Intl.DateTimeFormat(locale, opts)));
  return x;
}

/** `startsOn` is a calendar date (YYYY-MM-DD) of the event; noon UTC is the same day in every KZ zone. */
export function eventDateParts(
  startsOn: string,
  startsAt: string | null,
  locale: string,
  tz = "Asia/Almaty",
): DateParts {
  const d = new Date(`${startsOn}T12:00:00Z`);
  const weekday = f(locale, { weekday: "long", timeZone: tz }).format(d);
  const day = f(locale, { day: "numeric", timeZone: tz }).format(d);
  // Month name as used after the day number («15 қараша», «15 ноября»).
  const dm = f(locale, { day: "numeric", month: "long", timeZone: tz }).format(d);
  const month = dm.replace(day, "").replace(/^[\s.]+|[\s.]+$/g, "");
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    day,
    month,
    time: startsAt ? startsAt.slice(0, 5) : null,
  };
}

/** Calendar days from `now` to the event day in the event zone: 0 = today, 1 = tomorrow, < 0 = past. */
export function daysUntil(startsOn: string, now: Date, tz = "Asia/Almaty"): number {
  const today = f("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const a = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10));
  const b = Date.UTC(+startsOn.slice(0, 4), +startsOn.slice(5, 7) - 1, +startsOn.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** RSVP closes at `rsvp_closes_at`, by default at the start of the event day in Almaty (brief Ф5 §2). */
export function rsvpClosesAt(startsOn: string, closesAt: Date | null, tz = "Asia/Almaty"): Date {
  if (closesAt) return closesAt;
  // Start of the event day in the zone: find the UTC instant whose local date is startsOn and local time 00:00.
  const guess = new Date(`${startsOn}T00:00:00Z`);
  const local = f("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(guess);
  const [h, m] = local.split(":").map(Number);
  const offsetMin = (h! * 60 + m!) % (24 * 60);
  return new Date(guess.getTime() - (offsetMin > 12 * 60 ? offsetMin - 24 * 60 : offsetMin) * 60_000);
}

/** «Айбек пен Дана» → two names around «пен» / «и» / «&» (for the large title); otherwise the title as is. */
export function splitTitle(title: string): { a: string; amp: string; b: string } | null {
  const m = title.match(/^(.+?)\s+(пен|мен|бен|и|&)\s+(.+)$/u);
  return m ? { a: m[1]!, amp: m[2]!, b: m[3]! } : null;
}

/** Seal monogram: first letters of the two names, or of the title. */
export function monogram(title: string): [string, string | null] {
  const s = splitTitle(title);
  if (s) return [s.a.trim().charAt(0).toUpperCase(), s.b.trim().charAt(0).toUpperCase()];
  return [title.trim().charAt(0).toUpperCase(), null];
}

/** Weak device → `html.lite` (no 3D flap): ≤ 4 cores and ≤ 2 GB memory when known (DESIGN 6.1, N5). */
export function isLite(input: { reducedMotion: boolean; cores?: number; memoryGb?: number }): boolean {
  if (input.reducedMotion) return true;
  if (input.cores === undefined) return false;
  return input.cores <= 4 && (input.memoryGb === undefined || input.memoryGb <= 2);
}
