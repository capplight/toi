/**
 * Guest status and list totals (plan 5.1, design_spec 4.1). Pure TS (plan 11.1).
 */
export type Rsvp = "pending" | "yes" | "no";
export type GuestStatus = "notSent" | "noAnswer" | "yes" | "no";

export type GuestLike = {
  name: string;
  rsvp: Rsvp;
  expected: number;
  confirmed: number | null;
  sentAt: Date | null;
};

/** yes → «Келеді»; no → «Келмейді»; pending without sent_at → «Жіберілмеген»; pending with sent_at → «Жауап жоқ». */
export function guestStatus(g: Pick<GuestLike, "rsvp" | "sentAt">): GuestStatus {
  if (g.rsvp === "yes") return "yes";
  if (g.rsvp === "no") return "no";
  return g.sentAt ? "noAnswer" : "notSent";
}

/** Seats to plan for: yes → confirmed, pending → expected, no → 0 (plan 5.1). */
export function plannedSeats(g: Pick<GuestLike, "rsvp" | "expected" | "confirmed">): number {
  if (g.rsvp === "no") return 0;
  if (g.rsvp === "yes") return g.confirmed ?? 0;
  return g.expected;
}

export type ListTotals = {
  families: number;
  /** Σ planned seats (for «Барлығы: … · шамамен N орын»). */
  seats: number;
  /** Counter «Келеді»: Σ confirmed seats. */
  yesSeats: number;
  /** Counter «Жауап жоқ»: families sent and not answered. */
  noAnswer: number;
  /** Not sent yet (part of «Жауап жоқ» in summaries, decision А4). */
  notSent: number;
  /** Counter «Келмейді»: families. */
  no: number;
};

export function listTotals(list: readonly GuestLike[]): ListTotals {
  const t: ListTotals = { families: list.length, seats: 0, yesSeats: 0, noAnswer: 0, notSent: 0, no: 0 };
  for (const g of list) {
    t.seats += plannedSeats(g);
    const s = guestStatus(g);
    if (s === "yes") t.yesSeats += g.confirmed ?? 0;
    else if (s === "noAnswer") t.noAnswer += 1;
    else if (s === "notSent") t.notSent += 1;
    else t.no += 1;
  }
  return t;
}

const ORDER: Record<GuestStatus, number> = { notSent: 0, noAnswer: 1, yes: 2, no: 3 };

/**
 * Order inside a category group (design_spec 4.1): what needs action first — «Жіберілмеген», «Жауап жоқ»,
 * «Келеді», «Келмейді»; then alphabetically (Kazakh collation).
 */
const collators = new Map<string, Intl.Collator>();
/** Cached collator: `localeCompare(…, locale)` builds a new one per call (slow when sorting 65+ names). */
export function collator(locale = "kk"): Intl.Collator {
  let c = collators.get(locale);
  if (!c) collators.set(locale, (c = new Intl.Collator(locale)));
  return c;
}

export function compareGuests(a: GuestLike, b: GuestLike, locale = "kk"): number {
  return ORDER[guestStatus(a)] - ORDER[guestStatus(b)] || collator(locale).compare(a.name, b.name);
}

/** Calendar days between two instants in a time zone (for «3 күн бұрын жіберілді»). */
const dayFormats = new Map<string, Intl.DateTimeFormat>();
export function daysAgo(then: Date, now: Date, timeZone = "Asia/Almaty"): number {
  let f = dayFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormats.set(timeZone, f);
  }
  const fmt = f;
  const day = (d: Date) => {
    const p = fmt.format(d);
    return Date.UTC(+p.slice(0, 4), +p.slice(5, 7) - 1, +p.slice(8, 10));
  };
  return Math.max(0, Math.round((day(now) - day(then)) / 86_400_000));
}

/** Case-insensitive substring search on the name (design_spec 4.1). */
export function matchesQuery(name: string, query: string, locale = "kk"): boolean {
  const q = query.trim().toLocaleLowerCase(locale);
  return q === "" || name.toLocaleLowerCase(locale).includes(q);
}
