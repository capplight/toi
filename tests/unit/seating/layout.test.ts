import { describe, expect, it } from "vitest";
import { layoutTables } from "@/domain/seating";

const prox = (columns: 2 | 4, tables: number) =>
  layoutTables({ columns, tables, seatsPerTable: 12 }).proximity.map((t) => t.no);

describe("layoutTables (design_spec 3.13)", () => {
  it("4 columns × 16: proximity 2, 3, 1, 4, 6, 7, 5, 8, …", () => {
    expect(prox(4, 16)).toEqual([2, 3, 1, 4, 6, 7, 5, 8, 10, 11, 9, 12, 14, 15, 13, 16]);
  });

  it("numbering is left → right, top → bottom", () => {
    const l = layoutTables({ columns: 4, tables: 8, seatsPerTable: 10 });
    expect(l.tables.map((t) => [t.no, t.level, t.column])).toEqual([
      [1, 0, 0],
      [2, 0, 1],
      [3, 0, 2],
      [4, 0, 3],
      [5, 1, 0],
      [6, 1, 1],
      [7, 1, 2],
      [8, 1, 3],
    ]);
    expect(l.tables.every((t) => t.capacity === 10)).toBe(true);
    expect(l.levels).toBe(2);
  });

  it("18 tables in 4 columns: incomplete last level uses the central columns", () => {
    const l = layoutTables({ columns: 4, tables: 18, seatsPerTable: 12 });
    expect(l.levels).toBe(5);
    expect(l.tables.slice(16).map((t) => [t.no, t.level, t.column])).toEqual([
      [17, 4, 1],
      [18, 4, 2],
    ]);
    expect(prox(4, 18).slice(16)).toEqual([17, 18]);
  });

  it("19 tables: last level has columns 1, 2, 3 (proximity 18, 19, 17)", () => {
    expect(prox(4, 19).slice(16)).toEqual([18, 19, 17]);
  });

  it("2 columns: proximity = numbering", () => {
    expect(prox(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(layoutTables({ columns: 2, tables: 5, seatsPerTable: 8 }).levels).toBe(3);
  });

  it("positions are 0…n−1 in proximity order", () => {
    const l = layoutTables({ columns: 4, tables: 60, seatsPerTable: 16 });
    expect(l.proximity.map((t) => t.pos)).toEqual([...Array(60).keys()]);
    expect(new Set(l.tables.map((t) => t.no)).size).toBe(60);
  });
});
