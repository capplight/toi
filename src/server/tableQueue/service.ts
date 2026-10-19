import { and, eq, isNull, ne } from "drizzle-orm";
import { collator } from "@/domain/guests/status";
import { formatEventDate, type WaEvent } from "@/domain/guests/wa";
import type { Locale } from "@/i18n/config";
import { authorize, type Principal } from "../auth/access";
import type { Db } from "../db";
import { activityLog, events, families } from "../schema";

/**
 * Ф8 «Үстел нөмірлерін жіберу» (DESIGN 8.18, plan 6.6): a queue of families with a table, ordered by table number
 * then name. Only the owner and members with the seating right. «Жіберілді» = `table_sent_at` (no «Жіберілді ме?»
 * question — design review 3.2). Families still without a table are not in the queue (`notSeated`, a note).
 */
export type QueueItem = {
  id: string;
  name: string;
  tableNo: number;
  phone: string | null;
  token: string;
  sentAt: string | null;
};

export type TableQueueView = {
  event: { id: string; title: string; showTableNumbers: boolean };
  wa: WaEvent;
  appUrl: string;
  items: QueueItem[];
  notSeated: number;
};

export async function tableQueueView(
  db: Db,
  who: Principal,
  eventId: string,
  opts: { locale: Locale; appUrl: string },
): Promise<TableQueueView> {
  await authorize(db, who, eventId, "seating");
  const [ev] = await db.select().from(events).where(eq(events.id, eventId));
  if (!ev) throw new Error("event not found");
  const rows = await db
    .select()
    .from(families)
    .where(and(eq(families.eventId, eventId), isNull(families.deletedAt), ne(families.rsvp, "no")));
  const c = collator(opts.locale);
  const items = rows
    .filter((f) => f.tableNo !== null)
    .sort((a, b) => a.tableNo! - b.tableNo! || c.compare(a.name, b.name))
    .map((f) => ({
      id: f.id,
      name: f.name,
      tableNo: f.tableNo!,
      phone: f.phone,
      token: f.token,
      sentAt: f.tableSentAt?.toISOString() ?? null,
    }));
  const wa: WaEvent = {
    kind: ev.kind,
    title: ev.title,
    hostsLine: ev.hostsLine,
    startsOn: ev.startsOn,
    startsAt: ev.startsAt,
    venueName: ev.venueName,
    tz: ev.tz,
  };
  return {
    event: { id: ev.id, title: ev.title, showTableNumbers: ev.showTableNumbers },
    wa: { ...wa, dateText: formatEventDate(wa, opts.locale) },
    appUrl: opts.appUrl,
    items,
    notSeated: rows.filter((f) => f.tableNo === null).length,
  };
}

/** «Жіберілді» in the queue: `table_sent_at = now` (the queue resumes from the first family without it). */
export async function markTableSent(db: Db, who: Principal, familyId: string, now = new Date()) {
  const [f] = await db
    .select({ eventId: families.eventId, tableNo: families.tableNo })
    .from(families)
    .where(and(eq(families.id, familyId), isNull(families.deletedAt)));
  if (!f) return { ok: false as const };
  await authorize(db, who, f.eventId, "seating");
  await db
    .update(families)
    // Ф8 review Н3: a send mark is not an edit — no version bump (same as Ф4 markSent)
    .set({ tableSentAt: now, updatedAt: now })
    .where(eq(families.id, familyId));
  await db.insert(activityLog).values({ eventId: f.eventId, familyId, kind: "table_sent", meta: { table: f.tableNo } });
  return { ok: true as const, sentAt: now.toISOString() };
}

/** «Басынан бастау»: clear `table_sent_at` of the event (after seating changed and everyone needs the new number). */
export async function restartTableQueue(db: Db, who: Principal, eventId: string) {
  await authorize(db, who, eventId, "seating");
  await db.update(families).set({ tableSentAt: null }).where(eq(families.eventId, eventId));
  return { ok: true as const };
}

/** Owner switch «Үстел нөмірін көрсету» (settings.showTableNo). */
export async function setShowTableNumbers(db: Db, who: Principal, eventId: string, on: boolean) {
  await authorize(db, who, eventId, "owner");
  await db.update(events).set({ showTableNumbers: on, updatedAt: new Date() }).where(eq(events.id, eventId));
  return { ok: true as const };
}
