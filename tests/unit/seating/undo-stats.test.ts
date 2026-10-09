import { describe, expect, it } from "vitest";
import {
  buildDiff,
  fullReseat,
  invertDiff,
  moveFamily,
  reorderCategories,
  type SeatingState,
  setupHall,
  tableStats,
  totals,
  undoChange,
} from "@/domain/seating";
import { cats, fam, sampleState } from "./helpers";

const golden = () => fullReseat(sampleState()).state;

describe("undo (plan 7.6)", () => {
  it("undo of a move restores before; the inverse diff redoes it", () => {
    const s = golden();
    const moved = moveFamily(s, "f11", 1, { by: "ana" }).state;
    const diff = buildDiff(s, moved);
    expect(diff).toEqual({
      families: [
        {
          id: "f11",
          before: { tableNo: 4, locked: false, lockedBy: null },
          after: { tableNo: 1, locked: true, lockedBy: "ana" },
        },
      ],
    });
    const u = undoChange(moved, diff);
    expect(u.state).toEqual(s);
    expect(u.warnings.some((w) => w.kind === "undo_skipped")).toBe(false);
    expect(undoChange(u.state, invertDiff(diff)).state).toEqual(moved);
    expect(u.applied).toEqual(invertDiff(diff));
  });

  it("families changed after the record are skipped and reported", () => {
    const s = golden();
    const moved = moveFamily(s, "f11", 1).state;
    const diff = buildDiff(s, moved);
    const later = moveFamily(moved, "f11", 16).state;
    const u = undoChange(later, diff);
    expect(u.state).toEqual(later);
    expect(u.warnings).toContainEqual({ kind: "undo_skipped", familyIds: ["f11"], order: false, hall: false });
  });

  it("undo of category order and hall; skipped when they changed again", () => {
    const s = golden();
    const ord = reorderCategories(s, ["oz", "kuda", "nagashy", "dos", "ariptes", "korshi", "synyp", "baska"]).state;
    const d1 = buildDiff(s, ord);
    expect(d1.order?.after.slice(0, 2)).toEqual(["oz", "kuda"]);
    expect(undoChange(ord, d1).state).toEqual(s);

    const big = setupHall(s, { columns: 4, tables: 20, seatsPerTable: 12 }).state;
    const d2 = buildDiff(s, big);
    expect(d2.hall).toEqual({ before: s.hall, after: big.hall });
    expect(undoChange(big, d2).state).toEqual(s);

    const other = setupHall(big, { columns: 4, tables: 18, seatsPerTable: 12 }).state;
    const skipped = undoChange(other, d2);
    expect(skipped.state.hall).toEqual(other.hall);
    expect(skipped.warnings).toContainEqual({ kind: "undo_skipped", familyIds: [], order: false, hall: true });
    const ord2 = reorderCategories(ord, ["kuda", "oz", "nagashy", "dos", "ariptes", "synyp", "korshi", "baska"]).state;
    expect(undoChange(ord2, d1).warnings[0]).toMatchObject({ kind: "undo_skipped", order: true });
  });

  it("a full re-seat is undone as one record", () => {
    const s = sampleState();
    const scrambled: SeatingState = {
      ...golden(),
      categories: cats("baska", "synyp", "korshi", "ariptes", "dos", "nagashy", "oz", "kuda"),
    };
    const re = fullReseat(scrambled).state;
    const diff = buildDiff(scrambled, re);
    expect(diff.families.length).toBeGreaterThan(30);
    expect(undoChange(re, diff).state).toEqual(scrambled);
    expect(s.families.length).toBe(65);
  });

  it("families deleted after the record are skipped", () => {
    const s = golden();
    const moved = moveFamily(s, "f11", 1).state;
    const diff = buildDiff(s, moved);
    const gone = { ...moved, families: moved.families.filter((f) => f.id !== "f11") };
    expect(undoChange(gone, diff).warnings[0]).toMatchObject({ kind: "undo_skipped", familyIds: ["f11"] });
  });
});

describe("tableStats / totals", () => {
  it("main category, free seats and missing seats", () => {
    const st = tableStats(golden());
    expect(st.tables[6]).toMatchObject({ no: 7, used: 14, free: -2, missing: 2, mainCategoryId: "nagashy" });
    expect(st.tables[6]!.familyIds).toEqual(["f31", "f32", "f35"]); // locked, in seq order
    expect(st.tables[15]).toMatchObject({ no: 16, used: 0, mainCategoryId: null, familyIds: [] });
    expect(st.overfull.map((t) => t.no)).toEqual([7, 12]);
    expect(st.proximity.map((t) => t.no).slice(0, 4)).toEqual([2, 3, 1, 4]);
    expect(st.unplaced).toEqual([]);
  });

  it("mixed table: earlier rank wins a tie; table 8 lists oz before nagashy", () => {
    const st = tableStats(golden());
    expect(st.tables[7]!.familyIds).toEqual(["f28", "f08", "f47"]);
    expect(st.tables[7]!.mainCategoryId).toBe("oz"); // oz 6 vs nagashy 5
  });

  it("families on missing tables or without a hall count as unplaced", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 2, seatsPerTable: 4 },
      categories: cats("a"),
      families: [fam("f1", "a", 2, { tableNo: 9 }), fam("f2", "a", 1, { rsvp: "no", confirmed: null })],
    };
    expect(tableStats(s).unplaced).toEqual(["f1"]);
    expect(tableStats({ ...s, hall: null })).toMatchObject({ tables: [], unplaced: ["f1"], usedTables: 0 });
    expect(totals({ ...s, hall: null })).toMatchObject({ capacity: 0, toSeat: 2, free: -2 });
  });
});
