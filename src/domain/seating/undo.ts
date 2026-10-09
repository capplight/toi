import { overflowWarnings } from "./stats";
import type { Category, Family, HallConfig, SeatingResult, SeatingState, Warning } from "./types";
import { collectDeltas } from "./util";

export type SeatState = { tableNo: number | null; locked: boolean; lockedBy: string | null };

/** `seating_changes.diff` (plan 5.2). `order` and `hall` only for those actions. */
export type SeatingDiff = {
  families: { id: string; before: SeatState; after: SeatState }[];
  order?: { before: string[]; after: string[] };
  hall?: { before: HallConfig | null; after: HallConfig | null };
};

const seatState = (f: Family): SeatState => ({ tableNo: f.tableNo, locked: f.locked, lockedBy: f.lockedBy ?? null });
const sameSeat = (a: SeatState, b: SeatState) =>
  a.tableNo === b.tableNo && a.locked === b.locked && a.lockedBy === b.lockedBy;
const orderIds = (cats: readonly Category[]) => [...cats].sort((a, b) => a.rank - b.rank).map((c) => c.id);
const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);
const sameHall = (a: HallConfig | null, b: HallConfig | null) =>
  a === b || (!!a && !!b && a.columns === b.columns && a.tables === b.tables && a.seatsPerTable === b.seatsPerTable);

/** Build the diff of one change: families present in both states whose seat state changed (+ order/hall if changed). */
export function buildDiff(before: SeatingState, after: SeatingState): SeatingDiff {
  const prev = new Map(before.families.map((f) => [f.id, f]));
  const families: SeatingDiff["families"] = [];
  for (const f of after.families) {
    const b = prev.get(f.id);
    if (b && !sameSeat(seatState(b), seatState(f)))
      families.push({ id: f.id, before: seatState(b), after: seatState(f) });
  }
  const diff: SeatingDiff = { families };
  const ob = orderIds(before.categories);
  const oa = orderIds(after.categories);
  if (!sameOrder(ob, oa)) diff.order = { before: ob, after: oa };
  if (!sameHall(before.hall, after.hall)) diff.hall = { before: before.hall, after: after.hall };
  return diff;
}

/** Inverse diff (the new `undo` record — it can be undone too). */
export function invertDiff(diff: SeatingDiff): SeatingDiff {
  const out: SeatingDiff = { families: diff.families.map((f) => ({ id: f.id, before: f.after, after: f.before })) };
  if (diff.order) out.order = { before: diff.order.after, after: diff.order.before };
  if (diff.hall) out.hall = { before: diff.hall.after, after: diff.hall.before };
  return out;
}

/**
 * Undo (plan 7.6): a family is restored only if its current state still equals `after`;
 * otherwise it is skipped and reported («N отбасы кейін басқа өзгерді…»). Same for order and hall.
 */
export function undoChange(state: SeatingState, diff: SeatingDiff): SeatingResult & { applied: SeatingDiff } {
  const skipped: string[] = [];
  const restore = new Map<string, SeatState>();
  const current = new Map(state.families.map((f) => [f.id, f]));
  for (const d of diff.families) {
    const f = current.get(d.id);
    if (f && sameSeat(seatState(f), d.after)) restore.set(d.id, d.before);
    else skipped.push(d.id);
  }

  let categories = state.categories;
  let orderSkipped = false;
  if (diff.order) {
    if (sameOrder(orderIds(state.categories), diff.order.after)) {
      const before = diff.order.before;
      categories = state.categories.map((c) => ({ ...c, rank: before.indexOf(c.id) + 1 }));
    } else orderSkipped = true;
  }
  let hall = state.hall;
  let hallSkipped = false;
  if (diff.hall) {
    if (sameHall(state.hall, diff.hall.after)) hall = diff.hall.before;
    else hallSkipped = true;
  }

  const families = state.families.map((f) => {
    const r = restore.get(f.id);
    return r ? { ...f, tableNo: r.tableNo, locked: r.locked, lockedBy: r.lockedBy } : f;
  });
  const after: SeatingState = { hall, categories, families };
  const warnings: Warning[] = [];
  if (skipped.length || orderSkipped || hallSkipped) {
    warnings.push({ kind: "undo_skipped", familyIds: skipped, order: orderSkipped, hall: hallSkipped });
  }
  warnings.push(...overflowWarnings(after));
  return {
    state: after,
    deltas: collectDeltas(state.families, families),
    warnings,
    applied: buildDiff(state, after),
  };
}
