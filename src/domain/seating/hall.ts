import { seatsOf } from "./family";
import { placeIncremental } from "./incremental";
import { layoutTables } from "./layout";
import type { HallConfig, SeatingState, Warning } from "./types";

/**
 * Apply a hall configuration (plan 7.2, 7.6 v1.4). Shared by `setupHall` and the undo of a hall change.
 * - Families on tables that do not exist in `hall` are unseated (a lock is dropped with `lock_dropped`).
 * - `mode = "all-unseated"` (setupHall): then every unseated family with seats > 0 is offered to
 *   placeIncremental — first setup, «Үстел қосу», larger tables (Д2).
 * - `mode = "displaced-only"` (undo): only the families displaced here are re-placed, so that an
 *   undo restores the recorded state and adds no unrelated placements (Д1).
 * Seated families on existing tables never move. Overflow warnings are added by the caller.
 */
export function applyHall(
  state: SeatingState,
  hall: HallConfig | null,
  mode: "all-unseated" | "displaced-only",
): { state: SeatingState; warnings: Warning[] } {
  const existing = new Set(hall ? layoutTables(hall).tables.map((t) => t.no) : []);
  const warnings: Warning[] = [];
  const displaced: string[] = [];
  const families = state.families.map((f) => {
    if (f.tableNo === null || existing.has(f.tableNo)) return f;
    if (f.locked) warnings.push({ kind: "lock_dropped", familyId: f.id });
    displaced.push(f.id);
    return { ...f, tableNo: null, locked: false, lockedBy: null };
  });
  const mid: SeatingState = { ...state, hall, families };
  const ids =
    mode === "all-unseated" ? families.filter((f) => f.tableNo === null && seatsOf(f) > 0).map((f) => f.id) : displaced;
  const placed = placeIncremental(mid, ids);
  return { state: placed.state, warnings: [...warnings, ...placed.warnings.filter((w) => w.kind === "unplaced")] };
}
