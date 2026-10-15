import { describe, expect, it } from "vitest";
import { seatsOf, fullReseat } from "@/domain/seating";
import { buildPrintPlan, exportFileName, tableRanges } from "@/domain/print";
import { sampleEvent, sampleFamilies } from "../fixtures/sample-event";
import { sampleState } from "./seating/helpers";

/** Ф10 brief §5: print data on the design_spec 5.2 fixture — tables, mixed tables, by category, alphabet, unplaced. */
function plan(tables = 16) {
  const state = fullReseat({ ...sampleState(), hall: { ...sampleEvent.hall, tables } }).state;
  return buildPrintPlan({
    state,
    families: sampleFamilies.map((f) => ({
      id: f.id,
      name: f.name,
      categoryId: f.categoryId,
      rsvp: f.rsvp,
      seats: seatsOf(f),
      listLabel: f.memberId,
    })),
    categories: sampleEvent.categories.map((c) => ({ id: c.id, label: c.name, code: c.id, rank: c.rank })),
    locale: "kk",
  })!;
}

describe("print plan (Ф10)", () => {
  it("tables: numbers from tableStats, «Келмейміз» not printed, pending marked, overflow kept", () => {
    const p = plan();
    expect(p.tables).toHaveLength(16);
    expect(p.tables.map((t) => t.used)).toEqual([5, 11, 12, 12, 12, 12, 14, 11, 12, 12, 12, 13, 12, 12, 11, 0]);
    expect(p.tables[6]).toMatchObject({ no: 7, missing: 2 });
    const printed = p.tables.flatMap((t) => t.families);
    expect(printed.every((f) => f.seats > 0)).toBe(true);
    expect(printed.some((f) => f.pending)).toBe(true);
    expect(p.totals).toMatchObject({ toSeat: 173, capacity: 192 });
    expect(p.unplaced).toEqual([]);
  });

  it("mixed tables («Аралас үстел») have more than one category; table 1 (Құдалар only) is not mixed", () => {
    const p = plan();
    expect(p.tables[0]!.mixed).toBe(false);
    const mixed = p.tables.filter((t) => t.mixed);
    expect(mixed.length).toBeGreaterThan(0);
    for (const t of mixed) expect(new Set(t.families.map((f) => f.categoryId)).size).toBeGreaterThan(1);
  });

  it("by category in seating order with ranges; by name in Kazakh order; unplaced in a smaller hall", () => {
    const p = plan();
    expect(p.byCategory[0]).toMatchObject({ categoryId: "kuda", seats: 28, tables: "1–3" });
    expect(p.byCategory.reduce((s, c) => s + c.seats, 0)).toBe(173);
    const names = p.alpha.map((f) => f.name);
    expect(names).toEqual([...names].sort(new Intl.Collator("kk").compare));
    expect(p.alpha).toHaveLength(p.tables.flatMap((t) => t.families).length);
    const small = plan(12);
    expect(small.unplaced.length).toBeGreaterThan(0);
    expect(small.unplaced.every((f) => f.tableNo === null)).toBe(true);
  });

  it("no hall → null; ranges and Latin file names", () => {
    expect(
      buildPrintPlan({ state: { ...sampleState(), hall: null }, families: [], categories: [], locale: "ru" }),
    ).toBeNull();
    expect(tableRanges([7, 1, 2, 3, 10, 11])).toBe("1–3, 7, 10–11");
    expect(exportFileName("Айбек пен Дана", "2026-11-15")).toBe("toi-aibek-dana-2026-11-15.xlsx");
    expect(exportFileName("Ұлжан & Әлихан", "2026-12-01")).toBe("toi-ulzhan-alikhan-2026-12-01.xlsx");
    expect(exportFileName("!!!", "2026-12-01")).toBe("toi-event-2026-12-01.xlsx");
  });
});
