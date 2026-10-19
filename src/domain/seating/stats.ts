import { orderedCategories, seatsOf } from "./family";
import { layoutTables, type TableInfo } from "./layout";
import type { Family, SeatingState, Warning } from "./types";

export type TableStat = TableInfo & {
  used: number;
  /** capacity − used; negative = overflow. */
  free: number;
  /** Seats missing at this table («N орын жетпейді»), 0 when it fits. */
  missing: number;
  /** Families at the table: locked first (by seq), then by category rank, seats desc, seq. */
  familyIds: string[];
  /** Category with most seats at the table (ties → earlier rank), null if empty. */
  mainCategoryId: string | null;
};

export type HallStats = {
  tables: TableStat[];
  /** Tables in proximity order (same objects as `tables`). */
  proximity: TableStat[];
  levels: number;
  overfull: TableStat[];
  /** Families that need seats but have no (existing) table («Отырғызылмағандар»). */
  unplaced: string[];
  /** Tables with used > 0 (restaurant line «N адам → M үстел»). */
  usedTables: number;
};

/** Port of `tableStats` (prototype). */
export function tableStats(state: SeatingState): HallStats {
  const cats = orderedCategories(state);
  const rank = new Map(cats.map((c, i) => [c.id, i]));
  if (!state.hall) {
    return {
      tables: [],
      proximity: [],
      levels: 0,
      overfull: [],
      unplaced: state.families.filter((f) => seatsOf(f) > 0).map((f) => f.id),
      usedTables: 0,
    };
  }
  const layout = layoutTables(state.hall);
  const byNo = new Map<number, { info: TableInfo; fams: Family[] }>();
  for (const t of layout.tables) byNo.set(t.no, { info: t, fams: [] });
  const unplaced: string[] = [];
  for (const f of state.families) {
    if (seatsOf(f) === 0) continue;
    const slot = f.tableNo === null ? undefined : byNo.get(f.tableNo);
    if (slot) slot.fams.push(f);
    else unplaced.push(f.id);
  }

  const stats = new Map<number, TableStat>();
  for (const { info, fams } of byNo.values()) {
    fams.sort(
      (a, b) =>
        Number(b.locked) - Number(a.locked) ||
        (a.locked && b.locked ? a.seq - b.seq : 0) ||
        (rank.get(a.categoryId) ?? 0) - (rank.get(b.categoryId) ?? 0) ||
        seatsOf(b) - seatsOf(a) ||
        a.seq - b.seq,
    );
    const used = fams.reduce((s, f) => s + seatsOf(f), 0);
    const perCat = new Map<string, number>();
    for (const f of fams) perCat.set(f.categoryId, (perCat.get(f.categoryId) ?? 0) + seatsOf(f));
    let mainCategoryId: string | null = null;
    let best = 0;
    for (const c of cats) {
      const v = perCat.get(c.id) ?? 0;
      if (v > best) {
        best = v;
        mainCategoryId = c.id;
      }
    }
    stats.set(info.no, {
      ...info,
      used,
      free: info.capacity - used,
      missing: Math.max(0, used - info.capacity),
      familyIds: fams.map((f) => f.id),
      mainCategoryId,
    });
  }
  const tables = layout.tables.map((t) => stats.get(t.no)!);
  return {
    tables,
    proximity: layout.proximity.map((t) => stats.get(t.no)!),
    levels: layout.levels,
    overfull: tables.filter((t) => t.missing > 0),
    unplaced,
    usedTables: tables.filter((t) => t.used > 0).length,
  };
}

export function overflowWarnings(state: SeatingState): Warning[] {
  return tableStats(state).overfull.map((t) => ({ kind: "table_overflow", tableNo: t.no, missing: t.missing }));
}

export type Totals = {
  /** Σ confirmed of «yes». */
  confirmed: number;
  /** Σ expected of families without an answer. */
  expected: number;
  /** Seats to plan for = confirmed + expected (restaurant «Мейрамханаға N»). */
  toSeat: number;
  capacity: number;
  /** capacity − toSeat; negative → «N орын жетпейді». */
  free: number;
  /** Tables with anyone seated (restaurant «→ M үстел»). */
  usedTables: number;
};

/** Port of `totals` (prototype) + used tables (design_spec 6.2). */
export function totals(state: SeatingState): Totals {
  let confirmed = 0;
  let expected = 0;
  for (const f of state.families) {
    if (f.rsvp === "yes") confirmed += f.confirmed ?? 0;
    else if (f.rsvp === "pending") expected += f.expected;
  }
  const capacity = state.hall ? state.hall.tables * state.hall.seatsPerTable : 0;
  const toSeat = confirmed + expected;
  return { confirmed, expected, toSeat, capacity, free: capacity - toSeat, usedTables: tableStats(state).usedTables };
}
