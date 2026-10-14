import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { plannedSeats } from "@/domain/guests/status";
import type { Locale } from "@/i18n/config";
import { doorByToken, NotFoundError } from "../auth/access";
import { sha256Hex } from "../crypto";
import type { Db } from "../db";
import { hit } from "../ratelimit";
import { activityLog, categories, doorCheckins, events, families } from "../schema";

/**
 * Door helper (Ф8, plan 6.6 / 8): a snapshot of the event for offline search at the entrance, and «Келді» marks
 * synced from the helper's devices. Access is the event's `door_token` only (no session); an unknown or rotated
 * token is 404. The snapshot never contains phone numbers.
 */
export const DOOR_OPS_PER_HOUR = 600;
export const DOOR_MAX_OPS = 200;

export type DoorFamily = {
  id: string;
  name: string;
  tableNo: number | null;
  /** Seats to expect at the door: confirmed for «yes», expected otherwise (plannedSeats; «no» → expected). */
  seats: number;
  categoryLabel: string;
  categoryCode: string | null;
  rsvp: "pending" | "yes" | "no";
  /** ISO time of «Келді», null when not arrived. */
  arrivedAt: string | null;
};

export type DoorSnapshot = {
  event: { title: string; startsOn: string; startsAt: string | null };
  families: DoorFamily[];
  generatedAt: string;
};

export async function doorSnapshot(db: Db, token: string, opts: { locale: Locale; now?: Date }): Promise<DoorSnapshot> {
  const { eventId } = await doorByToken(db, token);
  const now = opts.now ?? new Date();
  const [ev] = await db
    .select({ title: events.title, startsOn: events.startsOn, startsAt: events.startsAt })
    .from(events)
    .where(eq(events.id, eventId));
  if (!ev) throw new NotFoundError();
  const [cats, rows] = await Promise.all([
    db.select().from(categories).where(eq(categories.eventId, eventId)),
    db
      .select({
        id: families.id,
        name: families.name,
        tableNo: families.tableNo,
        rsvp: families.rsvp,
        expected: families.expectedCount,
        confirmed: families.confirmedCount,
        categoryId: families.categoryId,
        arrivedAt: families.arrivedAt,
      })
      .from(families)
      .where(and(eq(families.eventId, eventId), isNull(families.deletedAt)))
      .orderBy(asc(families.name)),
  ]);
  const cat = new Map(cats.map((c) => [c.id, c]));
  // «Кіреберісте көмекшіміз…» on the guest page appears once the helper's link was opened (invite.table.hint).
  const [opened] = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(eq(activityLog.eventId, eventId), eq(activityLog.kind, "door_opened")))
    .limit(1);
  if (!opened) await db.insert(activityLog).values({ eventId, kind: "door_opened", at: now });
  return {
    event: { title: ev.title, startsOn: ev.startsOn, startsAt: ev.startsAt },
    families: rows.map((f) => {
      const c = cat.get(f.categoryId);
      return {
        id: f.id,
        name: f.name,
        tableNo: f.tableNo,
        seats:
          f.rsvp === "no" ? f.expected : plannedSeats({ rsvp: f.rsvp, expected: f.expected, confirmed: f.confirmed }),
        categoryLabel: c ? (opts.locale === "ru" ? (c.labelRu ?? c.labelKk) : c.labelKk) : "",
        categoryCode: c?.code ?? null,
        rsvp: f.rsvp,
        arrivedAt: f.arrivedAt?.toISOString() ?? null,
      };
    }),
    generatedAt: now.toISOString(),
  };
}

export type DoorOp = { opId: string; familyId: string; arrived: boolean; clientAt: string };
export type CheckinResult =
  | { ok: true; arrivals: { familyId: string; arrivedAt: string }[] }
  | { ok: false; error: "rateLimited" | "invalid" };

/**
 * `POST /api/door/{token}/checkins`: idempotent by `opId` (a repeated op is ignored); for each family the op with
 * the latest `clientAt` wins (ties: received later), so two devices converge. Writes `door_checkins` and
 * `families.arrived_at`. Answers the event's current arrivals. 600 ops per hour per token.
 */
export async function recordCheckins(
  db: Db,
  token: string,
  input: { deviceId: string; ops: DoorOp[] },
  now = new Date(),
): Promise<CheckinResult> {
  const { eventId } = await doorByToken(db, token);
  if (input.ops.length > DOOR_MAX_OPS) return { ok: false, error: "invalid" };
  if (input.ops.length) {
    const limit = await hit(
      db,
      { key: `door:${sha256Hex(token)}`, windowSec: 3600, max: DOOR_OPS_PER_HOUR },
      now,
    );
    if (!limit.ok) return { ok: false, error: "rateLimited" };
    const ids = [...new Set(input.ops.map((o) => o.familyId))];
    const own = await db
      .select({ id: families.id })
      .from(families)
      .where(and(eq(families.eventId, eventId), inArray(families.id, ids), isNull(families.deletedAt)));
    const ok = new Set(own.map((r) => r.id));
    const ops = input.ops.filter((o) => ok.has(o.familyId));
    await db.transaction(async (tx) => {
      if (ops.length)
        await tx
          .insert(doorCheckins)
          .values(
            ops.map((o) => ({
              opId: o.opId,
              eventId,
              familyId: o.familyId,
              arrived: o.arrived,
              clientAt: new Date(o.clientAt),
              receivedAt: now,
              deviceId: input.deviceId,
            })),
          )
          .onConflictDoNothing({ target: doorCheckins.opId });
      for (const familyId of new Set(ops.map((o) => o.familyId))) {
        const [last] = await tx
          .select({ arrived: doorCheckins.arrived, clientAt: doorCheckins.clientAt })
          .from(doorCheckins)
          .where(eq(doorCheckins.familyId, familyId))
          .orderBy(desc(doorCheckins.clientAt), desc(doorCheckins.receivedAt))
          .limit(1);
        await tx
          .update(families)
          .set({ arrivedAt: last?.arrived ? last.clientAt : null })
          .where(eq(families.id, familyId));
      }
    });
  }
  const arrived = await db
    .select({ familyId: families.id, arrivedAt: families.arrivedAt })
    .from(families)
    .where(and(eq(families.eventId, eventId), isNull(families.deletedAt), sql`${families.arrivedAt} is not null`));
  return { ok: true, arrivals: arrived.map((a) => ({ familyId: a.familyId, arrivedAt: a.arrivedAt!.toISOString() })) };
}

/** Whether the helper's link was opened at least once (guest page hint, invite.table.hint). */
export async function doorOpened(db: Db, eventId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(and(eq(activityLog.eventId, eventId), eq(activityLog.kind, "door_opened")))
    .limit(1);
  return Boolean(r);
}
