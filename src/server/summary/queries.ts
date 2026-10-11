import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { listTotals, plannedSeats } from "@/domain/guests/status";
import { totals } from "@/domain/seating";
import type { Locale } from "@/i18n/config";
import { formatEventDate } from "@/domain/guests/wa";
import { authorize, type Principal } from "../auth/access";
import type { Db } from "../db";
import { listKind } from "../guests/queries";
import { messagesByLocale } from "@/i18n/messages";
import { categories, eventMembers, events, families, users } from "../schema";
import { loadSeatingState } from "../seating/adapter";

/**
 * «Қорытынды» read model (Ф6, plan 6.2, DESIGN 8.19). Every number comes from a domain function:
 * `totals` (restaurant line, seats), `listTotals` (tiles, А4: «Жауап жоқ» includes not sent), `plannedSeats`
 * (by category and by list). Access: any member; the funnel only for the owner; the budget card only with the
 * budget right (owner or `can_manage_budget`).
 */
export type SummaryView = {
  event: { id: string; title: string; kind: string; dateLine: string; venue: string | null };
  /** No families at all → `summary.empty`. */
  empty: boolean;
  /** «Мейрамханаға: N адам → M үстел»; `tables` is null without a hall (then only «N адам» + hint). */
  restaurant: { people: number; tables: number | null };
  tiles: {
    yes: { families: number; seats: number };
    /** А4: sent-and-not-answered + not sent; seats are expected seats («~»). */
    pending: { families: number; seats: number; notSent: number };
    no: { families: number };
  };
  /** Seats to plan for per category, in seating-rank order; categories without seats are left out. */
  byCategory: { id: string; code: string | null; label: string; seats: number }[];
  /** Owner only (null for other members). `answered` includes answers taken by phone. */
  funnel: { total: number; sent: number; opened: number; answered: number } | null;
  byList: { memberId: string; title: string; families: number; seats: number; isMe: boolean }[];
  budget: boolean;
  /** For polling (plan 7.5): grows on every seating change and guest answer (Ф4 П1). */
  version: number;
};

export async function summaryView(
  db: Db,
  who: Principal,
  eventId: string,
  opts: { locale: Locale },
): Promise<SummaryView> {
  const m = await authorize(db, who, eventId, "member");
  const owner = m.role === "owner";
  const [ev] = await db.select().from(events).where(eq(events.id, eventId));
  if (!ev) throw new Error("event not found");
  const [state, rows, cats, members] = await Promise.all([
    loadSeatingState(db, eventId),
    db
      .select()
      .from(families)
      .where(and(eq(families.eventId, eventId), isNull(families.deletedAt))),
    db.select().from(categories).where(eq(categories.eventId, eventId)).orderBy(asc(categories.seatingRank)),
    db
      .select({
        id: eventMembers.id,
        label: eventMembers.label,
        memberKind: eventMembers.memberKind,
        name: eventMembers.displayName,
        userName: users.name,
      })
      .from(eventMembers)
      .leftJoin(users, eq(users.id, eventMembers.userId))
      .where(and(eq(eventMembers.eventId, eventId), isNull(eventMembers.removedAt)))
      .orderBy(desc(sql`${eventMembers.role} = 'owner'`), asc(eventMembers.invitedAt), asc(eventMembers.id)),
  ]);

  const t = totals(state);
  const like = rows.map((f) => ({
    name: f.name,
    rsvp: f.rsvp,
    expected: f.expectedCount,
    confirmed: f.confirmedCount,
    sentAt: f.sentAt,
  }));
  const lt = listTotals(like);
  const seatsOf = (f: (typeof rows)[number]) =>
    plannedSeats({ rsvp: f.rsvp, expected: f.expectedCount, confirmed: f.confirmedCount });

  const perCat = new Map<string, number>();
  for (const f of rows) perCat.set(f.categoryId, (perCat.get(f.categoryId) ?? 0) + seatsOf(f));

  const roles = messagesByLocale[opts.locale].roles;
  const date = formatEventDate({ startsOn: ev.startsOn, tz: ev.tz }, opts.locale);

  return {
    event: {
      id: ev.id,
      title: ev.title,
      kind: ev.kind,
      dateLine: ev.startsAt ? `${date}, ${ev.startsAt.slice(0, 5)}` : date,
      venue: ev.venueName,
    },
    empty: rows.length === 0,
    restaurant: { people: t.toSeat, tables: state.hall ? t.usedTables : null },
    tiles: {
      yes: { families: lt.families - lt.noAnswer - lt.notSent - lt.no, seats: t.confirmed },
      pending: { families: lt.noAnswer + lt.notSent, seats: t.expected, notSent: lt.notSent },
      no: { families: lt.no },
    },
    byCategory: cats
      .map((c) => ({
        id: c.id,
        code: c.code,
        label: opts.locale === "ru" ? (c.labelRu ?? c.labelKk) : c.labelKk,
        seats: perCat.get(c.id) ?? 0,
      }))
      .filter((c) => c.seats > 0),
    funnel: owner
      ? {
          total: rows.length,
          sent: rows.filter((f) => f.sentAt).length,
          opened: rows.filter((f) => f.firstOpenedAt).length,
          answered: rows.filter((f) => f.respondedAt).length,
        }
      : null,
    byList: members.map((r) => {
      const own = rows.filter((f) => f.addedByMemberId === r.id);
      const kind = listKind(r);
      const label = kind === "custom" ? r.label : roles[kind];
      const name = r.name ?? r.userName; // as on the members screen (Ф3)
      return {
        memberId: r.id,
        title: name ? `${label} · ${name}` : label,
        families: own.length,
        seats: own.reduce((s, f) => s + seatsOf(f), 0),
        isMe: r.id === m.memberId,
      };
    }),
    budget: owner || m.canManageBudget,
    version: ev.seatingVersion,
  };
}

/** Polling (plan 7.5): the current `seating_version` for a member of the event. */
export async function seatingVersion(db: Db, who: Principal, eventId: string): Promise<number> {
  await authorize(db, who, eventId, "member");
  const [ev] = await db.select({ v: events.seatingVersion }).from(events).where(eq(events.id, eventId));
  return ev?.v ?? 0;
}
