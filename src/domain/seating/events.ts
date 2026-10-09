import { findFamily, seatsOf, validateFamily, validateHall, validateState } from "./family";
import { placeIncremental } from "./incremental";
import { applyHall } from "./hall";
import { overflowWarnings, tableStats } from "./stats";
import {
  type Category,
  type Family,
  type HallConfig,
  type Rsvp,
  SeatingError,
  type SeatingResult,
  type SeatingState,
  type Warning,
} from "./types";
import { collectDeltas, replaceFamily } from "./util";

/**
 * Event handlers of plan 7.2 («рассаженных не трогаем»). Every handler is pure: it returns a new
 * state + deltas + warnings and never moves a seated family unless the event is about that family
 * (manual move) or the hall lost its table.
 */

function finish(before: SeatingState, after: SeatingState, extra: Warning[] = []): SeatingResult {
  return {
    state: after,
    deltas: collectDeltas(before.families, after.families),
    warnings: [...extra, ...overflowWarnings(after)],
  };
}

/** Merge a placeIncremental result onto an intermediate state, keeping deltas relative to `before`. */
function placeThen(before: SeatingState, mid: SeatingState, ids: string[], extra: Warning[] = []): SeatingResult {
  const placed = placeIncremental(mid, ids);
  const unplaced = placed.warnings.filter((w) => w.kind === "unplaced");
  return finish(before, placed.state, [...extra, ...unplaced]);
}

/**
 * Hall setup / change (plan 7.2 v1.4).
 * - Removed tables: their families (locks dropped, `lock_dropped`) are unseated.
 * - Then every unseated family with seats > 0 → placeIncremental as one batch: first setup,
 *   «Үстел қосу» (more tables), larger tables — also seats «Отырғызылмағандар» (Д2).
 * - Seated families on remaining tables never move; smaller capacity → overflow warnings only.
 */
export function setupHall(state: SeatingState, hall: HallConfig): SeatingResult {
  validateState(state);
  validateHall(hall);
  const r = applyHall(state, hall, "all-unseated");
  return finish(state, r.state, r.warnings);
}

/**
 * «Отырғызылмағандар → отырғызу» (plan 6.5): placeIncremental for every unseated family with seats > 0.
 * Seated families never move.
 */
export function seatUnplaced(state: SeatingState): SeatingResult {
  validateState(state);
  const ids = state.families.filter((f) => f.tableNo === null && seatsOf(f) > 0).map((f) => f.id);
  return placeThen(state, state, ids);
}

/** New guest → placeIncremental([f]). */
export function addFamily(state: SeatingState, family: Family): SeatingResult {
  validateState(state);
  validateFamily(family);
  if (state.families.some((f) => f.id === family.id)) throw new SeatingError(`family ${family.id} already exists`);
  if (!state.categories.some((c) => c.id === family.categoryId)) {
    throw new SeatingError(`family ${family.id} has unknown category ${family.categoryId}`);
  }
  const mid: SeatingState = {
    ...state,
    families: [...state.families, { ...family, tableNo: null, locked: false, lockedBy: null }],
  };
  return placeThen(state, mid, [family.id]);
}

/**
 * Guest answer / answer changed by a member.
 * - «Келмейміз»: table freed (and lock dropped).
 * - «Келеміз» or pending after «Келмейміз» (or while unplaced): placeIncremental.
 * - Otherwise (seat count may change): stays where it is; overflow is a warning (decision Р3).
 */
export function setRsvp(
  state: SeatingState,
  familyId: string,
  rsvp: Rsvp,
  counts: { confirmed?: number | null; expected?: number } = {},
): SeatingResult {
  validateState(state);
  const f = findFamily(state, familyId);
  const next: Family = {
    ...f,
    rsvp,
    expected: counts.expected ?? f.expected,
    confirmed: rsvp === "yes" ? (counts.confirmed ?? f.confirmed ?? f.expected) : (counts.confirmed ?? null),
  };
  validateFamily(next);
  if (rsvp === "no") {
    const unseated = { ...next, tableNo: null, locked: false, lockedBy: null };
    return finish(state, { ...state, families: replaceFamily(state.families, unseated) });
  }
  const mid = { ...state, families: replaceFamily(state.families, next) };
  if (next.tableNo === null) return placeThen(state, mid, [familyId]);
  return finish(state, mid);
}

/** Seat count changed: stays in place (smaller or larger); unseated families get a placement attempt. */
export function setSeats(
  state: SeatingState,
  familyId: string,
  counts: { confirmed?: number | null; expected?: number },
): SeatingResult {
  const f = findFamily(state, familyId);
  return setRsvp(state, familyId, f.rsvp, counts);
}

/** Soft delete: the family leaves the seating state and its chairs are freed. Keep `removed` for «Қайтару». */
export function removeFamily(state: SeatingState, familyId: string): SeatingResult & { removed: Family } {
  validateState(state);
  const removed = findFamily(state, familyId);
  const after: SeatingState = { ...state, families: state.families.filter((f) => f.id !== familyId) };
  const deltas = removed.tableNo === null ? [] : [{ familyId, from: removed.tableNo, to: null, locked: false }];
  return { state: after, deltas, warnings: overflowWarnings(after), removed };
}

/**
 * «Қайтару» after delete: back to the previous table if those seats are still free (lock kept),
 * otherwise placeIncremental (lock dropped).
 */
export function restoreFamily(state: SeatingState, removed: Family): SeatingResult {
  validateState(state);
  validateFamily(removed);
  if (state.families.some((f) => f.id === removed.id)) throw new SeatingError(`family ${removed.id} already exists`);
  if (removed.tableNo !== null && state.hall) {
    const t = tableStats(state).tables.find((x) => x.no === removed.tableNo);
    if (t && t.free >= seatsOf(removed)) {
      return finish(state, { ...state, families: [...state.families, removed] });
    }
  }
  const mid: SeatingState = {
    ...state,
    families: [...state.families, { ...removed, tableNo: null, locked: false, lockedBy: null }],
  };
  return placeThen(state, mid, [removed.id]);
}

/**
 * Manual move: `tableNo = to`, locked. Nobody else moves. If the table would overflow, nothing
 * changes and a `move_overflow` warning is returned — repeat with `force` («Бәрібір ауыстыру»).
 * Manual moves may join the first category's tables (exclusivity binds only the automation).
 */
export function moveFamily(
  state: SeatingState,
  familyId: string,
  to: number,
  opts: { force?: boolean; by?: string | null } = {},
): SeatingResult {
  validateState(state);
  if (!state.hall) throw new SeatingError("hall is not set up");
  const f = findFamily(state, familyId);
  // Families with 0 seats («Келмейміз») never sit at a table (Д3).
  if (seatsOf(f) === 0) throw new SeatingError(`family ${familyId} needs no seats and cannot be moved to a table`);
  const table = tableStats(state).tables.find((t) => t.no === to);
  if (!table) throw new SeatingError(`unknown table ${to}`);
  const freeAfter = table.free + (f.tableNo === to ? seatsOf(f) : 0) - seatsOf(f);
  if (freeAfter < 0 && !opts.force) {
    return { state, deltas: [], warnings: [{ kind: "move_overflow", familyId, tableNo: to, missing: -freeAfter }] };
  }
  const moved: Family = { ...f, tableNo: to, locked: true, lockedBy: opts.by ?? null };
  return finish(state, { ...state, families: replaceFamily(state.families, moved) });
}

/** «Автоматқа қайтару»: lock removed, the family stays on its table (moves only on a full re-seat). */
export function unlockFamily(state: SeatingState, familyId: string): SeatingResult {
  validateState(state);
  const f = findFamily(state, familyId);
  return finish(state, { ...state, families: replaceFamily(state.families, { ...f, locked: false, lockedBy: null }) });
}

/** New category order (ids, first = rank 1). Moves nobody; used for future placements (plan 7.2). */
export function reorderCategories(state: SeatingState, order: readonly string[]): SeatingResult {
  validateState(state);
  const known = new Set(state.categories.map((c) => c.id));
  if (order.length !== known.size || new Set(order).size !== order.length || order.some((id) => !known.has(id))) {
    throw new SeatingError("order must list every category exactly once");
  }
  // Only ranks change; the array keeps its order so that undo restores an identical state.
  const categories: Category[] = state.categories.map((c) => ({ ...c, rank: order.indexOf(c.id) + 1 }));
  return finish(state, { ...state, categories });
}
