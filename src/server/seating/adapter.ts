import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Family, SeatingResult, SeatingState, Warning } from "@/domain/seating";
import { buildDiff } from "@/domain/seating/undo";
import type { Db, Tx } from "../db";
import { categories, events, families, seatingChanges } from "../schema";

/**
 * Server adapter of the seating engine (plan 7.1, brief Ф4 2.1). The ONLY way the app changes seats:
 *   transaction → `select … from events where id = $1 for update` (serialises every seating change of the event)
 *   → load state → engine function → write changed families by deltas → `seating_changes` (diff + summary)
 *   → `events.seating_version += 1`.
 */

export type FamilyRow = typeof families.$inferSelect;
export type SeatingAction = (typeof seatingChanges.$inferInsert)["action"];

export type Actor = { kind: "member" | "system" | "guest"; memberId: string | null };

/** Row ↔ engine mapping (one place; unit-tested). `seq` = immutable insertion order (`seat_seq`). */
export function rowToFamily(
  r: Pick<
    FamilyRow,
    | "id"
    | "categoryId"
    | "rsvp"
    | "expectedCount"
    | "confirmedCount"
    | "tableNo"
    | "seatLocked"
    | "lockedByMemberId"
    | "seatSeq"
  >,
): Family {
  return {
    id: r.id,
    categoryId: r.categoryId,
    rsvp: r.rsvp,
    expected: r.expectedCount,
    confirmed: r.confirmedCount,
    tableNo: r.tableNo,
    locked: r.seatLocked,
    lockedBy: r.lockedByMemberId,
    seq: r.seatSeq,
  };
}

/** Seat columns written back from an engine family. */
export function familySeatColumns(f: Family) {
  return { tableNo: f.tableNo, seatLocked: f.locked, lockedByMemberId: f.locked ? (f.lockedBy ?? null) : null };
}

export class NotFound extends Error {
  constructor() {
    super("not found");
    this.name = "NotFound";
  }
}

/** Load the seating state of an event inside a transaction (call after the `for update` lock). */
export async function loadSeatingState(tx: Db | Tx, eventId: string): Promise<SeatingState> {
  const [ev] = await tx
    .select({ columns: events.hallColumns, tables: events.tablesCount, seats: events.seatsPerTable })
    .from(events)
    .where(eq(events.id, eventId));
  if (!ev) throw new NotFound();
  const cats = await tx
    .select({ id: categories.id, rank: categories.seatingRank })
    .from(categories)
    .where(eq(categories.eventId, eventId))
    .orderBy(asc(categories.seatingRank));
  const rows = await tx
    .select()
    .from(families)
    .where(and(eq(families.eventId, eventId), isNull(families.deletedAt)))
    .orderBy(asc(families.seatSeq), asc(families.createdAt));
  return {
    hall: ev.columns && ev.tables ? { columns: ev.columns as 2 | 4, tables: ev.tables, seatsPerTable: ev.seats } : null,
    categories: cats,
    families: rows.map(rowToFamily),
  };
}

const unseated = (f: Family): Family => ({ ...f, tableNo: null, locked: false, lockedBy: null });

/**
 * `buildDiff` only compares families present on both sides. A family added by the step (new guest) is
 * recorded as «unseated → table», a removed one (soft delete) as «table → unseated», so the history
 * (and its undo, plan 7.6) sees every seat change.
 */
export function historyDiff(before: SeatingState, after: SeatingState) {
  const inBefore = new Set(before.families.map((f) => f.id));
  const inAfter = new Set(after.families.map((f) => f.id));
  return buildDiff(
    { ...before, families: [...before.families, ...after.families.filter((f) => !inBefore.has(f.id)).map(unseated)] },
    { ...after, families: [...after.families, ...before.families.filter((f) => !inAfter.has(f.id)).map(unseated)] },
  );
}

export type SeatingStep<T> = (ctx: { tx: Tx; state: SeatingState }) => Promise<{
  /** Engine result (state after + deltas + warnings). */
  result: SeatingResult;
  action: SeatingAction;
  /** For the history text (names, from/to, counts). */
  summary: Record<string, unknown>;
  /** Extra value returned to the caller (e.g. the inserted family). */
  value: T;
}>;

export type SeatingOutcome<T> = {
  seatingVersion: number;
  changes: SeatingResult["deltas"];
  warnings: Warning[];
  historyId?: number;
  value: T;
};

/**
 * Run a seating step for an event. The step may write non-seat columns itself (rsvp, deleted_at, insert);
 * seat columns (table_no, seat_locked, locked_by_member_id) are written here from the engine deltas.
 * A history record and a new seating version are written only when seats actually changed.
 */
export async function withSeating<T>(
  db: Db,
  eventId: string,
  actor: Actor,
  step: SeatingStep<T>,
): Promise<SeatingOutcome<T>> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ id: events.id, version: events.seatingVersion })
      .from(events)
      .where(and(eq(events.id, eventId), isNull(events.deletedAt)))
      .for("update");
    if (!locked) throw new NotFound();
    const before = await loadSeatingState(tx, eventId);
    const { result, action, summary, value } = await step({ tx, state: before });

    const after = new Map(result.state.families.map((f) => [f.id, f]));
    for (const d of result.deltas) {
      const f = after.get(d.familyId);
      if (!f) continue; // removed from the state (soft delete) — its row keeps the last table for «Қайтару»
      await tx.update(families).set(familySeatColumns(f)).where(eq(families.id, f.id));
    }

    if (result.deltas.length === 0)
      return { seatingVersion: locked.version, changes: [], warnings: result.warnings, value };

    const seatingVersion = locked.version + 1;
    await tx
      .update(events)
      .set({ seatingVersion, updatedAt: sql`now()` })
      .where(eq(events.id, eventId));
    const [rec] = await tx
      .insert(seatingChanges)
      .values({
        eventId,
        actorKind: actor.kind,
        actorMemberId: actor.memberId,
        action,
        summary,
        diff: historyDiff(before, result.state),
        seatingVersionAfter: seatingVersion,
      })
      .returning({ id: seatingChanges.id });
    return { seatingVersion, changes: result.deltas, warnings: result.warnings, historyId: rec!.id, value };
  });
}
