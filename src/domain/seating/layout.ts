import type { HallConfig } from "./types";

export type TableInfo = {
  /** Number people see: left → right, top → bottom (design_spec 3.13). */
  no: number;
  /** 0 = nearest to the төр. */
  level: number;
  /** 0-based column. */
  column: number;
  capacity: number;
  /** Position in the proximity order (what the automation uses). */
  pos: number;
};

export type Layout = {
  /** By table number. */
  tables: TableInfo[];
  /** Proximity order: level by level, central columns first (4 columns: 2, 3, 1, 4). */
  proximity: TableInfo[];
  levels: number;
};

/**
 * Port of `layoutTables` (prototype/index.html). An incomplete last level uses the central
 * columns in proximity order (e.g. 18 tables in 4 columns → tables 17, 18 in columns 2, 3).
 */
export function layoutTables(hall: HallConfig): Layout {
  const C = hall.columns;
  const N = hall.tables;
  const levels = Math.ceil(N / C);
  const colOrder = C === 4 ? [1, 2, 0, 3] : [0, 1];

  const tables: TableInfo[] = [];
  let no = 1;
  for (let level = 0; level < levels; level++) {
    const inLevel = Math.min(C, N - level * C);
    const cols = colOrder.slice(0, inLevel).sort((a, b) => a - b);
    for (const column of cols) tables.push({ no: no++, level, column, capacity: hall.seatsPerTable, pos: -1 });
  }

  const proximity: TableInfo[] = [];
  for (let level = 0; level < levels; level++) {
    for (const column of colOrder) {
      const t = tables.find((x) => x.level === level && x.column === column);
      if (t) proximity.push(t);
    }
  }
  proximity.forEach((t, i) => {
    t.pos = i;
  });
  return { tables, proximity, levels };
}
