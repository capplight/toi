import { eq } from "drizzle-orm";
import { asLocale, formatDateTime, formatDayMonth } from "@/domain/format";
import { buildPrintPlan, type PrintPlan } from "@/domain/print";
import type { Principal } from "../auth/access";
import type { Db } from "../db";
import { activityLog, events } from "../schema";
import { hallView } from "../seating/view";

/**
 * Print and Excel read model (Ф10 brief §2–3): any member of the event (`requireMember` via `hallView`); the plan is
 * built by the domain from the engine numbers. No phones anywhere (the file goes to the restaurant).
 */
export type PrintView = {
  event: { id: string; title: string; kind: string; startsOn: string; dateLine: string; venue: string | null };
  plan: PrintPlan | null;
  /** «15 қараша, 18:00» — when the page / file was made (event zone). */
  generatedAt: string;
};

export async function printView(db: Db, who: Principal, eventId: string, locale: string, now = new Date()) {
  const l = asLocale(locale);
  const v = await hallView(db, who, eventId, { locale: l, historyLimit: 1 });
  const [ev] = await db
    .select({ startsOn: events.startsOn, startsAt: events.startsAt, venue: events.venueName, tz: events.tz })
    .from(events)
    .where(eq(events.id, eventId));
  const date = formatDayMonth(ev!.startsOn, l, ev!.tz);
  const plan = buildPrintPlan({
    state: v.state,
    families: v.families.map((f) => ({
      id: f.id,
      name: f.name,
      categoryId: f.categoryId,
      rsvp: f.rsvp,
      seats: f.seats,
      listLabel: f.listLabel,
    })),
    categories: v.categories.map((c) => ({ id: c.id, label: c.label, code: c.code, rank: c.rank })),
    locale: l,
  });
  return {
    event: {
      id: eventId,
      title: v.event.title,
      kind: v.event.kind,
      startsOn: ev!.startsOn,
      dateLine: ev!.startsAt ? `${date}, ${ev!.startsAt.slice(0, 5)}` : date,
      venue: ev!.venue,
    },
    plan,
    generatedAt: formatDateTime(now, l, ev!.tz),
  } satisfies PrintView;
}

/** `activity_log` → `export` (plan 6.7): only the fact and the format, no personal data. */
export async function logExport(db: Db, eventId: string, format: "xlsx" | "print") {
  await db.insert(activityLog).values({ eventId, kind: "export", meta: { format } });
}
