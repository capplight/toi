import { firstCategoryId, orderedCategories, seatsOf, validateState } from "./family";
import { layoutTables } from "./layout";
import { Occupancy } from "./occupancy";
import { overflowWarnings } from "./stats";
import type { Family, SeatDelta, SeatingResult, SeatingState, Warning } from "./types";
import { collectDeltas } from "./util";

/** Stable sort by seats descending, ties by `seq` (data order). */
export function bySeatsDesc(a: Family, b: Family): number {
  return seatsOf(b) - seatsOf(a) || a.seq - b.seq;
}

/**
 * «Толық қайта отырғызу» — algorithm 6.1 (`autoSeat` from the prototype, ported one-to-one):
 * - locked families stay (lock dropped if their table no longer exists or they need 0 seats);
 * - all other families are re-seated category by category in rank order;
 * - start: 0 for the first category; then the last table of the previous category
 *   (shared boundary table), or the next one if the previous category is the first (exclusive);
 * - first table from the start with enough free seats (families are never split);
 * - no table → unplaced.
 * Added to the prototype: the exclusivity rule is also checked against locked families (plan 7.3, invariant 7.4.4).
 */
export function fullReseat(state: SeatingState): SeatingResult {
  validateState(state);
  const warnings: Warning[] = [];

  if (!state.hall) {
    const families = state.families.map((f) => (f.locked ? f : { ...f, tableNo: null }));
    return { state: { ...state, families }, deltas: collectDeltas(state.families, families), warnings };
  }

  const layout = layoutTables(state.hall);
  const first = firstCategoryId(state);
  const occ = new Occupancy(layout, first);
  const next = new Map<string, Family>();

  // Steps 1–2: locked families keep their table.
  for (const f of [...state.families].filter((x) => x.locked).sort((a, b) => a.seq - b.seq)) {
    if (!occ.has(f.tableNo) || seatsOf(f) === 0) {
      next.set(f.id, { ...f, locked: false, lockedBy: null, tableNo: null });
      if (seatsOf(f) > 0) warnings.push({ kind: "lock_dropped", familyId: f.id });
      continue;
    }
    occ.add(f.tableNo, f);
    next.set(f.id, f);
  }
  for (const f of state.families) if (!f.locked) next.set(f.id, { ...f, tableNo: null });

  // Step 4.
  const ordered = orderedCategories(state);
  let started = false;
  let prevLast = 0;
  let prevCat: string | null = null;
  for (const cat of ordered) {
    // Lock state after steps 1–2 (a dropped lock makes the family re-placeable, as in the prototype).
    const list = state.families
      .map((f) => next.get(f.id)!)
      .filter((f) => f.categoryId === cat.id && !f.locked && seatsOf(f) > 0)
      .sort(bySeatsDesc);
    if (list.length === 0) continue; // step 5
    const start = started ? (prevCat === ordered[0]!.id ? prevLast + 1 : prevLast) : 0;
    let last = start;
    for (const f of list) {
      let placed = false;
      for (let p = start; p < layout.proximity.length; p++) {
        const t = layout.proximity[p]!;
        if (occ.fits(t.no, f)) {
          occ.add(t.no, f);
          next.set(f.id, { ...f, tableNo: t.no });
          if (p > last) last = p;
          placed = true;
          break;
        }
      }
      if (!placed) warnings.push({ kind: "unplaced", familyId: f.id });
    }
    prevLast = last;
    prevCat = cat.id;
    started = true;
  }

  const families = state.families.map((f) => next.get(f.id)!);
  const result: SeatingState = { ...state, families };
  warnings.push(...overflowWarnings(result));
  return { state: result, deltas: collectDeltas(state.families, families), warnings };
}

export type FullReseatPreview = {
  /** Families that would change table or lock («12 отбасы ауысады»). */
  moves: SeatDelta[];
  unplaced: string[];
  /** The state that `applyFullReseat` would produce — compare with the server answer before confirming. */
  result: SeatingResult;
};

/** Preview without applying: the list of moves to show before the confirmation (plan 7.2). */
export function previewFullReseat(state: SeatingState): FullReseatPreview {
  const result = fullReseat(state);
  return {
    moves: result.deltas,
    unplaced: result.warnings.flatMap((w) => (w.kind === "unplaced" ? [w.familyId] : [])),
    result,
  };
}
