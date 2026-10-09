import { describe, expect, it } from "vitest";
import { fullReseat, previewFullReseat, tableStats, totals } from "@/domain/seating";
import { expectedTables, expectedTotals } from "../../fixtures/sample-event";
import { sampleState, tablesOf } from "./helpers";

// design_spec 5.2 «Ожидаемая рассадка (проверка)»: used seats per table 1…16.
const expectedUsed = [5, 11, 12, 12, 12, 12, 14, 11, 12, 12, 12, 13, 12, 12, 11, 0];

describe("golden: full re-seat on design_spec 5.2", () => {
  const result = fullReseat(sampleState());

  it("gives exactly the column «Стол»", () => {
    expect(tablesOf(result.state)).toEqual(expectedTables);
  });

  it("table occupancy matches the expected seating table", () => {
    expect(tableStats(result.state).tables.map((t) => t.used)).toEqual(expectedUsed);
  });

  it("overflow only on locked tables 7 (−2) and 12 (−1); nobody unplaced", () => {
    expect(result.warnings).toEqual([
      { kind: "table_overflow", tableNo: 7, missing: 2 },
      { kind: "table_overflow", tableNo: 12, missing: 1 },
    ]);
  });

  it("totals: 150 confirmed, 23 expected, 173 to seat, 19 free, 15 tables used", () => {
    const t = totals(result.state);
    expect(t).toEqual({ ...expectedTotals, usedTables: 15 });
  });

  it("re-running the full re-seat on its own result moves nobody (preview = 0 moves)", () => {
    expect(previewFullReseat(result.state).moves).toEqual([]);
  });

  it("table 13 lists families in placement order of the spec", () => {
    const t13 = tableStats(result.state).tables[12]!;
    expect(t13.familyIds).toEqual(["f65", "f23", "f25", "f24", "f61", "f62", "f45", "f46"]);
    expect(t13.mainCategoryId).toBe("synyp");
  });
});
