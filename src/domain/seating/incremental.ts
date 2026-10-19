import { firstCategoryId, orderedCategories, seatsOf, validateState } from "./family";
import { layoutTables, type Layout } from "./layout";
import { Occupancy } from "./occupancy";
import { overflowWarnings } from "./stats";
import type { Family, SeatingResult, SeatingState, Warning } from "./types";
import { collectDeltas } from "./util";

/** Per category: min and max proximity position of the tables where it sits (its zone). */
class Zones {
  private readonly min = new Map<string, number>();
  private readonly max = new Map<string, number>();
  private readonly posOf: Map<number, number>;

  constructor(
    layout: Layout,
    families: Iterable<Family>,
    private readonly ordered: readonly { id: string }[],
  ) {
    this.posOf = new Map(layout.tables.map((t) => [t.no, t.pos]));
    for (const f of families) if (f.tableNo !== null && seatsOf(f) > 0) this.add(f.categoryId, f.tableNo);
  }

  add(catId: string, tableNo: number): void {
    const p = this.posOf.get(tableNo);
    if (p === undefined) return;
    this.min.set(catId, Math.min(this.min.get(catId) ?? p, p));
    this.max.set(catId, Math.max(this.max.get(catId) ?? p, p));
  }

  /**
   * Start of the candidate scan for category `catId` (plan 7.3):
   * - zone Z(c) = positions of tables where the category already sits;
   * - S = last position of the nearest previous category (by rank) that has a zone,
   *   +1 if that category is the first one (its tables are not shared); none if no previous zone;
   * - start = min(min Z, S) (min Z without S; S without Z; 0 without both).
   * Candidates: ascending from the start (own zone and its holes, then the tables after the zone),
   * then the tables before the start, descending (closer to the төр is better than nowhere).
   */
  start(catId: string): number {
    const idx = this.ordered.findIndex((c) => c.id === catId);
    let S: number | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      const m = this.max.get(this.ordered[i]!.id);
      if (m !== undefined) {
        S = m + (i === 0 ? 1 : 0);
        break;
      }
    }
    const zoneStart = this.min.get(catId) ?? null;
    return zoneStart === null ? (S ?? 0) : S === null ? zoneStart : Math.min(zoneStart, S);
  }
}

/** First position (in candidate order) whose table passes `ok`, or undefined. */
function firstCandidate(start: number, n: number, ok: (pos: number) => boolean): number | undefined {
  const s = Math.min(start, n);
  for (let p = s; p < n; p++) if (ok(p)) return p;
  for (let p = s - 1; p >= 0; p--) if (ok(p)) return p;
  return undefined;
}

/** Candidate positions in order (exposed for UI hints and tests). */
export function candidatePositions(state: SeatingState, catId: string): number[] {
  if (!state.hall) return [];
  const layout = layoutTables(state.hall);
  const zones = new Zones(layout, state.families, orderedCategories(state));
  const out: number[] = [];
  firstCandidate(zones.start(catId), layout.proximity.length, (p) => (out.push(p), false));
  return out;
}

/**
 * `placeIncremental(state, familyIds)` (plan 7.3): seats only the given families that are not seated yet.
 * Already seated families NEVER move. Order: category rank, then seats descending, then `seq`.
 */
export function placeIncremental(state: SeatingState, familyIds: readonly string[]): SeatingResult {
  validateState(state);
  const warnings: Warning[] = [];
  if (!state.hall) return { state, deltas: [], warnings };

  const layout = layoutTables(state.hall);
  const ordered = orderedCategories(state);
  const occ = new Occupancy(layout, firstCategoryId(state));
  for (const f of state.families) if (occ.has(f.tableNo) && seatsOf(f) > 0) occ.add(f.tableNo, f);
  const zones = new Zones(layout, state.families, ordered);
  const current = new Map(state.families.map((f) => [f.id, f]));

  const rank = new Map(ordered.map((c, i) => [c.id, i]));
  const wanted = new Set(familyIds);
  const toPlace = state.families
    .filter((f) => wanted.has(f.id) && f.tableNo === null && seatsOf(f) > 0)
    .sort((a, b) => rank.get(a.categoryId)! - rank.get(b.categoryId)! || seatsOf(b) - seatsOf(a) || a.seq - b.seq);

  const n = layout.proximity.length;
  for (const f of toPlace) {
    const pos = firstCandidate(zones.start(f.categoryId), n, (p) => occ.fits(layout.proximity[p]!.no, f));
    if (pos === undefined) {
      warnings.push({ kind: "unplaced", familyId: f.id });
      continue;
    }
    const tableNo = layout.proximity[pos]!.no;
    occ.add(tableNo, f);
    zones.add(f.categoryId, tableNo);
    current.set(f.id, { ...f, tableNo, locked: false, lockedBy: null });
  }

  const families = state.families.map((f) => current.get(f.id)!);
  const result = { ...state, families };
  warnings.push(...overflowWarnings(result));
  return { state: result, deltas: collectDeltas(state.families, families), warnings };
}

/**
 * Table the engine would choose for this family if it were not seated (for «Бос орынға ауыстыру»,
 * decision Р3). Its own current seats are freed for the calculation; its current table is not offered.
 */
export function suggestTable(state: SeatingState, familyId: string): number | null {
  const f = state.families.find((x) => x.id === familyId);
  if (!f || !state.hall || seatsOf(f) === 0) return null;
  const others = state.families.filter((x) => x.id !== familyId);
  const layout = layoutTables(state.hall);
  const occ = new Occupancy(layout, firstCategoryId(state));
  for (const x of others) if (occ.has(x.tableNo) && seatsOf(x) > 0) occ.add(x.tableNo, x);
  const zones = new Zones(layout, others, orderedCategories(state));
  const pos = firstCandidate(zones.start(f.categoryId), layout.proximity.length, (p) => {
    const no = layout.proximity[p]!.no;
    return no !== f.tableNo && occ.fits(no, f);
  });
  return pos === undefined ? null : layout.proximity[pos]!.no;
}
