import { and, eq, inArray } from "drizzle-orm";
import {
  fullReseat,
  moveFamily as engineMove,
  previewFullReseat as enginePreview,
  reorderCategories as engineReorder,
  type SeatingDiff,
  SeatingError,
  type SeatingState,
  seatsOf,
  seatUnplaced as engineSeatUnplaced,
  undoChange,
  unlockFamily as engineUnlock,
} from "@/domain/seating";
import { authorize, ForbiddenError, type Principal } from "../auth/access";
import type { Db, Tx } from "../db";
import { familyEvent } from "../guests/service";
import { eventMembers, events, families, seatingChanges } from "../schema";
import { loadSeatingState, withSeating, writeCategoryRanks, writeHallRows } from "./adapter";

/**
 * Hall actions (plan 6.5, brief Ф7b §2). Every function: `authorize(…, "seating")` → validation → `withSeating`
 * (event lock, engine, families by deltas, history, `seating_version`). Expected outcomes (409, overflow,
 * nothing to undo) come back as values; access errors throw `ForbiddenError`.
 */

class Stale extends Error {}
class Invalid extends Error {}

async function versionNow(tx: Tx, eventId: string): Promise<number> {
  const [ev] = await tx.select({ v: events.seatingVersion }).from(events).where(eq(events.id, eventId));
  return ev?.v ?? 0;
}

const actorOf = (memberId: string) => ({ kind: "member" as const, memberId });

/* ------------------------------------------------------------------ moveFamily */

export type MoveResult =
  | { ok: true; seatingVersion: number; historyId: number | null; from: number | null; to: number }
  /** The table lacks seats: nothing changed; repeat with `force` («Бәрібір ауыстыру»). */
  | { ok: false; overflow: { missing: number } }
  /** 409 (plan 7.5): somebody changed the family meanwhile. */
  | { ok: false; conflict: "moved"; tableNo: number | null; memberLabel: string | null }
  | { ok: false; error: "invalid" };

export async function moveFamily(
  db: Db,
  who: Principal,
  input: { familyId: string; toTableNo: number; force: boolean; familyVersion: number; reason?: "suggested" },
): Promise<MoveResult> {
  const current = await familyEvent(db, input.familyId);
  const m = await authorize(db, who, current.eventId, "seating");
  if (current.deletedAt) return { ok: false, error: "invalid" };
  class Moved extends Error {
    constructor(readonly row: typeof families.$inferSelect) {
      super("moved");
    }
  }
  try {
    const out = await withSeating(db, current.eventId, actorOf(m.memberId), async ({ tx, state }) => {
      const [row] = await tx.select().from(families).where(eq(families.id, input.familyId));
      if (!row || row.deletedAt) throw new Invalid();
      if (row.version !== input.familyVersion) throw new Moved(row);
      let result;
      try {
        result = engineMove(state, row.id, input.toTableNo, { force: input.force, by: m.memberId });
      } catch (e) {
        if (e instanceof SeatingError) throw new Invalid();
        throw e;
      }
      const overflow = result.warnings.find((w) => w.kind === "move_overflow");
      if (overflow || result.deltas.length === 0) {
        return {
          result,
          action: "move" as const,
          summary: {},
          value: overflow ? { overflow: overflow.missing } : null,
          noop: true,
        };
      }
      await tx
        .update(families)
        .set({ version: row.version + 1, updatedAt: new Date() })
        .where(eq(families.id, row.id));
      return {
        result,
        action: "move" as const,
        summary: {
          names: [row.name],
          familyId: row.id,
          from: row.tableNo,
          to: input.toTableNo,
          ...(input.reason ? { reason: input.reason } : {}),
        },
        value: null,
      };
    });
    if (out.value && "overflow" in out.value) return { ok: false, overflow: { missing: out.value.overflow } };
    return {
      ok: true,
      seatingVersion: out.seatingVersion,
      historyId: out.historyId ?? null,
      from: current.tableNo,
      to: input.toTableNo,
    };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: "invalid" };
    if (e instanceof Moved) {
      const by = e.row.lockedByMemberId;
      const [mem] = by
        ? await db.select({ label: eventMembers.label }).from(eventMembers).where(eq(eventMembers.id, by))
        : [];
      return { ok: false, conflict: "moved", tableNo: e.row.tableNo, memberLabel: mem?.label ?? null };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ unlockFamily */

/** «Қолмен қоюды алу»: the family stays at its table but becomes automatic (plan 7.2). */
export async function unlockFamily(db: Db, who: Principal, input: { familyId: string }) {
  const current = await familyEvent(db, input.familyId);
  const m = await authorize(db, who, current.eventId, "seating");
  if (current.deletedAt) return { ok: false as const, error: "invalid" as const };
  const out = await withSeating(db, current.eventId, actorOf(m.memberId), async ({ tx, state }) => {
    const result = engineUnlock(state, current.id);
    if (result.deltas.length === 0) return { result, action: "unlock" as const, summary: {}, value: null, noop: true };
    await tx
      .update(families)
      .set({ version: current.version + 1, updatedAt: new Date() })
      .where(eq(families.id, current.id));
    return {
      result,
      action: "unlock" as const,
      summary: { names: [current.name], familyId: current.id, tableNo: current.tableNo },
      value: null,
    };
  });
  return { ok: true as const, seatingVersion: out.seatingVersion, historyId: out.historyId ?? null };
}

/* ------------------------------------------------------------------ reorderCategories */

/** H5 ↑ / ↓: only the order changes — nobody moves (decision Р4). `seatingVersion` → 409 if stale. */
export async function reorderCategories(
  db: Db,
  who: Principal,
  input: { eventId: string; order: string[]; seatingVersion: number; movedCategoryId?: string },
) {
  const m = await authorize(db, who, input.eventId, "seating");
  try {
    const out = await withSeating(db, input.eventId, actorOf(m.memberId), async ({ tx, state }) => {
      if ((await versionNow(tx, input.eventId)) !== input.seatingVersion) throw new Stale();
      let result;
      try {
        result = engineReorder(state, input.order);
      } catch (e) {
        if (e instanceof SeatingError) throw new Invalid();
        throw e;
      }
      const pos = (s: SeatingState, id: string) =>
        [...s.categories].sort((a, b) => a.rank - b.rank).findIndex((c) => c.id === id) + 1;
      const changed = state.categories.filter((c) => pos(state, c.id) !== pos(result.state, c.id));
      if (changed.length === 0) return { result, action: "reorder" as const, summary: {}, value: null, noop: true };
      await writeCategoryRanks(tx, result.state);
      const movedId =
        input.movedCategoryId && changed.some((c) => c.id === input.movedCategoryId)
          ? input.movedCategoryId
          : changed.reduce((a, b) =>
              Math.abs(pos(state, b.id) - pos(result.state, b.id)) >
              Math.abs(pos(state, a.id) - pos(result.state, a.id))
                ? b
                : a,
            ).id;
      return {
        result,
        action: "reorder" as const,
        summary: { categoryId: movedId, from: pos(state, movedId), to: pos(result.state, movedId) },
        value: null,
      };
    });
    return { ok: true as const, seatingVersion: out.seatingVersion, historyId: out.historyId ?? null };
  } catch (e) {
    if (e instanceof Stale) return { ok: false as const, conflict: "version" as const };
    if (e instanceof Invalid) return { ok: false as const, error: "invalid" as const };
    throw e;
  }
}

/* ------------------------------------------------------------------ full re-seat */

export type FullReseatPreview = {
  seatingVersion: number;
  moves: { familyId: string; name: string; from: number | null; to: number | null }[];
  /** Locked families with seats at a table — they stay («Қолмен қойылған M отбасы орнында қалады»). */
  locked: number;
  unplaced: number;
};

async function preview(tx: Db | Tx, eventId: string): Promise<FullReseatPreview> {
  const state = await loadSeatingState(tx, eventId);
  const p = enginePreview(state);
  const ids = p.moves.map((x) => x.familyId);
  const names = ids.length
    ? await tx.select({ id: families.id, name: families.name }).from(families).where(inArray(families.id, ids))
    : [];
  const name = new Map(names.map((r) => [r.id, r.name]));
  const [ev] = await tx.select({ v: events.seatingVersion }).from(events).where(eq(events.id, eventId));
  return {
    seatingVersion: ev?.v ?? 0,
    moves: p.moves.map((x) => ({ familyId: x.familyId, name: name.get(x.familyId) ?? "", from: x.from, to: x.to })),
    locked: state.families.filter((f) => f.locked && f.tableNo !== null && seatsOf(f) > 0).length,
    unplaced: p.unplaced.length,
  };
}

/** `previewFullReseat` (plan 6.5): what «Толық қайта отырғызу» would do — nothing is written. */
export async function previewFullReseat(db: Db, who: Principal, input: { eventId: string }) {
  await authorize(db, who, input.eventId, "seating");
  return preview(db, input.eventId);
}

/**
 * `applyFullReseat`: one history record, undone as a whole. A stale `seatingVersion` → 409 with a fresh preview
 * (the person confirms what they see, plan 7.5).
 */
export async function applyFullReseat(db: Db, who: Principal, input: { eventId: string; seatingVersion: number }) {
  const m = await authorize(db, who, input.eventId, "seating");
  try {
    const out = await withSeating(db, input.eventId, actorOf(m.memberId), async ({ tx, state }) => {
      if ((await versionNow(tx, input.eventId)) !== input.seatingVersion) throw new Stale();
      const result = fullReseat(state);
      if (result.deltas.length === 0)
        return { result, action: "full_reseat" as const, summary: {}, value: 0, noop: true };
      return {
        result,
        action: "full_reseat" as const,
        summary: { count: result.deltas.length },
        value: result.deltas.length,
      };
    });
    return {
      ok: true as const,
      count: out.value,
      seatingVersion: out.seatingVersion,
      historyId: out.historyId ?? null,
    };
  } catch (e) {
    if (e instanceof Stale)
      return { ok: false as const, conflict: "version" as const, preview: await preview(db, input.eventId) };
    throw e;
  }
}

/* ------------------------------------------------------------------ seatUnplaced */

/** «Бос орындарға отырғызу»: `placeIncremental` over every unplaced family with seats (plan 6.5). */
export async function seatUnplaced(db: Db, who: Principal, input: { eventId: string }) {
  const m = await authorize(db, who, input.eventId, "seating");
  const out = await withSeating(db, input.eventId, actorOf(m.memberId), async ({ state }) => {
    const result = engineSeatUnplaced(state);
    if (result.deltas.length === 0) return { result, action: "auto_place" as const, summary: {}, value: 0, noop: true };
    return {
      result,
      action: "auto_place" as const,
      summary: { reason: "seatUnplaced", count: result.deltas.length },
      value: result.deltas.length,
    };
  });
  const left = (await loadSeatingState(db, input.eventId)).families.filter(
    (f) => f.tableNo === null && seatsOf(f) > 0,
  ).length;
  return {
    ok: true as const,
    seated: out.value,
    left,
    seatingVersion: out.seatingVersion,
    historyId: out.historyId ?? null,
  };
}

/* ------------------------------------------------------------------ history: undo */

type ChangeRow = typeof seatingChanges.$inferSelect;

/** History reasons that are list operations, not seating: shown without «Қайтару» (`hall.history.noUndo`). */
const LIST_REASONS = new Set(["categoryAdded", "added", "deleted", "restored", "seats", "answerReverted"]);

export type UndoKind = "seating" | "answer" | "guest" | "none";

/**
 * Which «Қайтару» a record gets (brief Ф7b §2, plan 7.6):
 * - guest answers → none, `hall.history.guestNoUndo`;
 * - an answer by phone → `revertAnswer` (Ф4 П2), only for its author;
 * - list operations (new category, guest added / deleted / restored, seat count edit) → none;
 * - an empty diff or the very first hall setup (nothing to go back to) → none;
 * - everything else (move, unlock, order, hall, full re-seat, «Бос орындарға отырғызу», undo itself) → seating undo.
 */
export function undoKind(
  h: Pick<ChangeRow, "actorKind" | "actorMemberId" | "action" | "summary" | "diff">,
  me: string,
): UndoKind {
  if (h.actorKind === "guest") return "guest";
  const s = (h.summary ?? {}) as { reason?: string; by?: string };
  if (h.action === "answer" && s.by === "member") return h.actorMemberId === me ? "answer" : "none";
  if (s.reason && LIST_REASONS.has(s.reason)) return "none";
  const d = (h.diff ?? { families: [] }) as SeatingDiff;
  if (d.hall && d.hall.before === null) return "none";
  if (!(d.families?.length > 0) && !d.order && !d.hall) return "none";
  return "seating";
}

export type UndoResult =
  | { ok: true; seatingVersion: number; historyId: number | null; skipped: number }
  /** Everything changed after the record: nothing restored. */
  | { ok: false; reason: "changed"; skipped: number }
  | { ok: false; reason: "alreadyReverted" | "notUndoable" };

/**
 * `undoSeatingChange(changeId)` (plan 7.6): `undoChange` of the engine (families still in `after` go back to
 * `before`, others are skipped — `hall.history.partialUndo`); order and hall written back; a new `undo` record with
 * `revert_of`, the original gets `reverted_by`. The undo record can be undone too.
 */
export async function undoSeatingChange(db: Db, who: Principal, input: { changeId: number }): Promise<UndoResult> {
  const [h] = await db.select().from(seatingChanges).where(eq(seatingChanges.id, input.changeId));
  if (!h) throw new ForbiddenError();
  const m = await authorize(db, who, h.eventId, "seating");
  if (h.revertedBy !== null) return { ok: false, reason: "alreadyReverted" };
  if (undoKind(h, m.memberId) !== "seating") return { ok: false, reason: "notUndoable" };
  class Already extends Error {}
  try {
    const out = await withSeating(db, h.eventId, actorOf(m.memberId), async ({ tx, state }) => {
      const [again] = await tx
        .select({ revertedBy: seatingChanges.revertedBy })
        .from(seatingChanges)
        .where(and(eq(seatingChanges.id, h.id), eq(seatingChanges.eventId, h.eventId)));
      if (!again || again.revertedBy !== null) throw new Already();
      const diff = h.diff as SeatingDiff;
      const result = undoChange(state, { ...diff, families: diff.families ?? [] });
      const skip = result.warnings.find((w) => w.kind === "undo_skipped");
      const skipped = skip && skip.kind === "undo_skipped" ? skip.familyIds.length : 0;
      const a = result.applied;
      if (a.families.length === 0 && !a.order && !a.hall) {
        return { result, action: "undo" as const, summary: {}, value: { skipped, applied: false }, noop: true };
      }
      if (a.hall && result.state.hall) await writeHallRows(tx, h.eventId, result.state.hall);
      if (a.order) await writeCategoryRanks(tx, result.state);
      return {
        result,
        action: "undo" as const,
        summary: {
          reason: "undo",
          undoOf: h.id,
          of: { action: h.action, summary: h.summary },
          count: a.families.length,
          skipped,
        },
        value: { skipped, applied: true },
        revertOf: h.id,
      };
    });
    if (!out.value.applied) return { ok: false, reason: "changed", skipped: out.value.skipped };
    return {
      ok: true,
      seatingVersion: out.seatingVersion,
      historyId: out.historyId ?? null,
      skipped: out.value.skipped,
    };
  } catch (e) {
    if (e instanceof Already) return { ok: false, reason: "alreadyReverted" };
    throw e;
  }
}
