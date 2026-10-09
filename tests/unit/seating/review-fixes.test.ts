import { describe, expect, it } from "vitest";
import {
  addFamily,
  buildDiff,
  moveFamily,
  SeatingError,
  type SeatingState,
  seatUnplaced,
  setRsvp,
  setupHall,
  undoChange,
} from "@/domain/seating";
import { cats, fam, tablesOf } from "./helpers";

// Scenarios of docs/phases/Ф7a-review.md, section 4.

describe("Д1: undo of a hall change goes through the hall logic", () => {
  const small: SeatingState = {
    hall: { columns: 2, tables: 2, seatsPerTable: 4 },
    categories: cats("a"),
    families: [fam("f1", "a", 4, { tableNo: 1 }), fam("f2", "a", 4, { tableNo: 2 })],
  };

  it("family seated on a new table after the change is unseated and re-placed (here: unplaced, with a warning)", () => {
    const big = setupHall(small, { columns: 2, tables: 4, seatsPerTable: 4 }).state;
    const diff = buildDiff(small, big);
    const withF3 = addFamily(big, fam("f3", "a", 2)).state;
    expect(tablesOf(withF3).f3).toBe(3);

    const u = undoChange(withF3, diff);
    expect(u.state.hall).toEqual(small.hall);
    expect(tablesOf(u.state)).toEqual({ f1: 1, f2: 2, f3: null });
    expect(u.warnings).toContainEqual({ kind: "unplaced", familyId: "f3" });
    expect(u.deltas).toEqual([{ familyId: "f3", from: 3, to: null, locked: false }]);
  });

  it("a locked family on a vanished table gets lock_dropped and is re-placed where there is room", () => {
    const roomy: SeatingState = { ...small, families: [fam("f1", "a", 2, { tableNo: 1 })] };
    const big = setupHall(roomy, { columns: 2, tables: 4, seatsPerTable: 4 }).state;
    const diff = buildDiff(roomy, big);
    const moved = moveFamily(addFamily(big, fam("f3", "a", 2)).state, "f3", 4, { by: "ana" }).state;

    const u = undoChange(moved, diff);
    expect(u.warnings).toContainEqual({ kind: "lock_dropped", familyId: "f3" });
    expect(u.state.families.find((f) => f.id === "f3")).toMatchObject({ tableNo: 1, locked: false, lockedBy: null });
  });

  it("undo never seats a family that answered «Келмейміз» after the change", () => {
    const s: SeatingState = { ...small, families: [fam("f1", "a", 4, { tableNo: 2, locked: true })] };
    const smaller = setupHall(s, { columns: 2, tables: 1, seatsPerTable: 4 }).state; // f1 → table 1, unlocked
    const diff = buildDiff(s, smaller);
    const declined = setRsvp(smaller, "f1", "no").state;
    const u = undoChange(declined, diff);
    expect(tablesOf(u.state)).toEqual({ f1: null });
    expect(u.warnings).toContainEqual({ kind: "undo_skipped", familyIds: ["f1"], order: false, hall: false });
  });
});

describe("Д2: a larger hall seats «Отырғызылмағандар»; seatUnplaced", () => {
  const crowded = (): SeatingState => ({
    hall: { columns: 2, tables: 2, seatsPerTable: 4 },
    categories: cats("a"),
    families: [fam("f1", "a", 4, { tableNo: 1 }), fam("f2", "a", 4, { tableNo: 2 }), fam("f3", "a", 4)],
  });

  it("«Үстел қосу»: an added table seats the unplaced family, seated ones stay", () => {
    const r = setupHall(crowded(), { columns: 2, tables: 3, seatsPerTable: 4 });
    expect(tablesOf(r.state)).toEqual({ f1: 1, f2: 2, f3: 3 });
    expect(r.deltas).toEqual([{ familyId: "f3", from: null, to: 3, locked: false }]);
  });

  it("larger tables seat the unplaced family too", () => {
    const r = setupHall(crowded(), { columns: 2, tables: 2, seatsPerTable: 8 });
    expect(tablesOf(r.state)).toEqual({ f1: 1, f2: 2, f3: 1 });
  });

  it("seatUnplaced places every unseated family with seats, never moves seated, skips 0-seat families", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 3, seatsPerTable: 4 },
      categories: cats("a"),
      families: [
        fam("f1", "a", 4, { tableNo: 1 }),
        fam("f2", "a", 3),
        fam("f3", "a", 1),
        fam("f4", "a", 2, { rsvp: "no", confirmed: null }),
      ],
    };
    const r = seatUnplaced(s);
    expect(tablesOf(r.state)).toEqual({ f1: 1, f2: 2, f3: 2, f4: null });
    expect(seatUnplaced(r.state).deltas).toEqual([]);
  });
});

describe("Д3: manual move of a family with 0 seats", () => {
  it("throws SeatingError for «Келмейміз»", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 2, seatsPerTable: 4 },
      categories: cats("a"),
      families: [fam("f1", "a", 2, { rsvp: "no", confirmed: null })],
    };
    expect(() => moveFamily(s, "f1", 1)).toThrow(SeatingError);
    expect(() => moveFamily(s, "f1", 1, { force: true })).toThrow(/needs no seats/);
  });
});
