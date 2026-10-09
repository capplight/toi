import { describe, expect, it } from "vitest";
import {
  addFamily,
  fullReseat,
  MAX_FAMILY_SEATS,
  moveFamily,
  removeFamily,
  reorderCategories,
  restoreFamily,
  SeatingError,
  type SeatingState,
  seatsOf,
  setRsvp,
  setSeats,
  setupHall,
  unlockFamily,
} from "@/domain/seating";
import { cats, fam, sampleState, tablesOf } from "./helpers";

const golden = () => fullReseat(sampleState()).state;

/** Every family except `except` keeps its table. */
function othersStay(before: SeatingState, after: SeatingState, except: string[] = []) {
  const a = tablesOf(after);
  for (const f of before.families) if (!except.includes(f.id) && f.id in a) expect(a[f.id], f.id).toBe(f.tableNo);
}

describe("event handlers of plan 7.2 on the sample", () => {
  it("first hall setup: everyone unseated is placed in one batch", () => {
    const s = sampleState();
    const unset: SeatingState = {
      ...s,
      hall: null,
      families: s.families.map((f) => ({ ...f, tableNo: null, locked: false, lockedBy: null })),
    };
    const r = setupHall(unset, s.hall!);
    expect(r.state.families.filter((f) => seatsOf(f) > 0).every((f) => f.tableNo !== null)).toBe(true);
    expect(r.warnings.filter((w) => w.kind === "unplaced")).toEqual([]);
  });

  it("new guest → placed near own category, nobody else moves", () => {
    const s = golden();
    const r = addFamily(s, fam("f99", "dos", 2, { seq: 99 }));
    othersStay(s, r.state);
    expect(r.deltas).toEqual([{ familyId: "f99", from: null, to: 16, locked: false }]);
  });

  it("answer «Келмейміз» frees the chairs; «Келеміз» after it places again", () => {
    const s = golden();
    const no = setRsvp(s, "f10", "no");
    expect(no.deltas).toEqual([{ familyId: "f10", from: 4, to: null, locked: false }]);
    othersStay(s, no.state, ["f10"]);
    const yes = setRsvp(no.state, "f10", "yes", { confirmed: 6 });
    othersStay(no.state, yes.state, ["f10"]);
    expect(yes.state.families.find((f) => f.id === "f10")!.tableNo).toBe(4); // back into the oz zone
  });

  it("seat count down: stays; up with room: stays", () => {
    const s = golden();
    expect(setSeats(s, "f01", { confirmed: 3 }).deltas).toEqual([]);
    expect(setSeats(s, "f01", { confirmed: 7 }).deltas).toEqual([]); // table 2: 11 → 12
  });

  it("seat count up without room: stays, table overflow warning (Р3)", () => {
    const s = golden();
    const r = setSeats(s, "f10", { confirmed: 8 }); // table 4 was 12/12
    expect(r.deltas).toEqual([]);
    expect(r.warnings).toContainEqual({ kind: "table_overflow", tableNo: 4, missing: 2 });
  });

  it("pending → yes with the expected count keeps the table", () => {
    const s = golden();
    const r = setRsvp(s, "f06", "yes");
    expect(r.state.families.find((f) => f.id === "f06")).toMatchObject({ rsvp: "yes", confirmed: 4, tableNo: 3 });
    expect(r.deltas).toEqual([]);
  });

  it("unplaced family whose count dropped gets another placement attempt", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 1, seatsPerTable: 6 },
      categories: cats("a"),
      families: [fam("f1", "a", 3, { tableNo: 1 }), fam("f2", "a", 5)],
    };
    expect(setSeats(s, "f2", { confirmed: 3 }).state.families[1]!.tableNo).toBe(1);
  });

  it("delete frees the chairs; «Қайтару» returns to the same table if still free", () => {
    const s = golden();
    const del = removeFamily(s, "f11");
    expect(del.deltas).toEqual([{ familyId: "f11", from: 4, to: null, locked: false }]);
    expect(del.state.families.some((f) => f.id === "f11")).toBe(false);
    const back = restoreFamily(del.state, del.removed);
    expect(back.state.families.find((f) => f.id === "f11")!.tableNo).toBe(4);
    othersStay(del.state, back.state);
  });

  it("«Қайтару» when the old seats are taken → placeIncremental, lock dropped", () => {
    const s = golden();
    const del = removeFamily(s, "f31"); // locked at 7
    const filled = moveFamily(del.state, "f47", 7, { force: true }).state;
    const back = restoreFamily(filled, del.removed);
    const f31 = back.state.families.find((f) => f.id === "f31")!;
    expect(f31.locked).toBe(false);
    expect(f31.tableNo).not.toBe(7);
    othersStay(filled, back.state);
  });

  it("removing an unseated family has no deltas", () => {
    const s: SeatingState = { hall: null, categories: cats("a"), families: [fam("f1", "a", 2)] };
    expect(removeFamily(s, "f1").deltas).toEqual([]);
  });

  it("manual move: locks the family, nobody else moves; overflow needs force («Бәрібір ауыстыру»)", () => {
    const s = golden();
    const ok = moveFamily(s, "f11", 1, { by: "ana" }); // table 1: 5 + 1 (kuda table — manual is allowed)
    expect(ok.deltas).toEqual([{ familyId: "f11", from: 4, to: 1, locked: true }]);
    expect(ok.state.families.find((f) => f.id === "f11")!.lockedBy).toBe("ana");
    othersStay(s, ok.state, ["f11"]);

    const refused = moveFamily(s, "f10", 3); // table 3 is full
    expect(refused.deltas).toEqual([]);
    expect(refused.state).toBe(s);
    expect(refused.warnings).toEqual([{ kind: "move_overflow", familyId: "f10", tableNo: 3, missing: 6 }]);

    const forced = moveFamily(s, "f10", 3, { force: true });
    expect(forced.warnings).toContainEqual({ kind: "table_overflow", tableNo: 3, missing: 6 });
  });

  it("move within the same table only locks it", () => {
    const s = golden();
    expect(moveFamily(s, "f10", 4).deltas).toEqual([{ familyId: "f10", from: 4, to: 4, locked: true }]);
  });

  it("move errors: unknown table, no hall, unknown family", () => {
    const s = golden();
    expect(() => moveFamily(s, "f10", 17)).toThrow(SeatingError);
    expect(() => moveFamily({ ...s, hall: null }, "f10", 1)).toThrow(/hall/);
    expect(() => moveFamily(s, "nope", 1)).toThrow(/unknown family/);
  });

  it("«Автоматқа қайтару»: lock removed, family stays", () => {
    const s = golden();
    const r = unlockFamily(s, "f31");
    expect(r.deltas).toEqual([{ familyId: "f31", from: 7, to: 7, locked: false }]);
  });

  it("category order change moves nobody; new order is used for future guests", () => {
    const s = golden();
    const r = reorderCategories(s, ["kuda", "nagashy", "oz", "dos", "ariptes", "korshi", "synyp", "baska"]);
    expect(r.deltas).toEqual([]);
    expect(r.state.categories.find((c) => c.id === "nagashy")!.rank).toBe(2);
    expect(() => reorderCategories(s, ["kuda"])).toThrow(SeatingError);
    expect(() => reorderCategories(s, ["kuda", "kuda", "oz", "dos", "ariptes", "korshi", "synyp", "baska"])).toThrow();
  });

  it("bigger hall: nobody moves, new tables empty", () => {
    const s = golden();
    const r = setupHall(s, { columns: 4, tables: 20, seatsPerTable: 12 });
    expect(r.deltas).toEqual([]);
  });

  it("smaller hall: families of removed tables (locks dropped) are re-placed; others stay", () => {
    const s = golden();
    const r = setupHall(s, { columns: 4, tables: 12, seatsPerTable: 12 });
    othersStay(s, r.state, [
      "f15",
      "f16",
      "f17",
      "f19",
      "f64",
      "f23",
      "f24",
      "f25",
      "f44",
      "f45",
      "f46",
      "f50",
      "f51",
      "f52",
      "f53",
      "f54",
      "f55",
      "f56",
      "f58",
      "f59",
      "f60",
      "f61",
      "f62",
      "f65",
    ]);
    // Removed tables 13–15 held 35 seats; 12 tables × 12 = 144 < 173 → some unplaced.
    expect(r.warnings.some((w) => w.kind === "unplaced")).toBe(true);
    expect(r.state.families.every((f) => f.tableNo === null || f.tableNo <= 12)).toBe(true);
  });

  it("smaller hall drops locks on removed tables", () => {
    const s = golden();
    const r = setupHall(s, { columns: 4, tables: 11, seatsPerTable: 12 }); // table 12 (locked) disappears
    expect(r.warnings).toContainEqual({ kind: "lock_dropped", familyId: "f38" });
    expect(r.state.families.find((f) => f.id === "f38")!.locked).toBe(false);
  });

  it("smaller table capacity: nobody moves, overflow warnings", () => {
    const s = golden();
    const r = setupHall(s, { columns: 4, tables: 16, seatsPerTable: 10 });
    expect(r.deltas).toEqual([]);
    expect(r.warnings.filter((w) => w.kind === "table_overflow").length).toBeGreaterThan(5);
  });
});

describe("validation and seat limit 20 (Д4/13)", () => {
  const base = (): SeatingState => ({
    hall: { columns: 2, tables: 2, seatsPerTable: 20 },
    categories: cats("a"),
    families: [],
  });

  it("accepts 20 seats and seats a family of 20 at a table of 20", () => {
    const r = addFamily(base(), fam("f1", "a", MAX_FAMILY_SEATS));
    expect(r.state.families[0]!.tableNo).toBe(1);
  });

  it("rejects 0, 21 and fractional counts", () => {
    expect(() => addFamily(base(), fam("f1", "a", 21))).toThrow(/1…20/);
    expect(() => addFamily(base(), fam("f1", "a", 0))).toThrow(SeatingError);
    expect(() => addFamily(base(), fam("f1", "a", 2.5))).toThrow(SeatingError);
    expect(() => setSeats({ ...base(), families: [fam("f1", "a", 2)] }, "f1", { confirmed: 21 })).toThrow();
    expect(() => addFamily(base(), { ...fam("f1", "a", 2), confirmed: null })).toThrow(/required/);
    expect(() => addFamily(base(), { ...fam("f1", "a", 2), rsvp: "pending", confirmed: 30 })).toThrow();
  });

  it("rejects duplicates, unknown categories and broken halls", () => {
    const s = { ...base(), families: [fam("f1", "a", 2)] };
    expect(() => addFamily(s, fam("f1", "a", 2))).toThrow(/already exists/);
    expect(() => addFamily(base(), fam("f2", "zzz", 2))).toThrow(/unknown category/);
    expect(() => restoreFamily(s, fam("f1", "a", 2))).toThrow(/already exists/);
    expect(() => setupHall(base(), { columns: 3 as 4, tables: 4, seatsPerTable: 10 })).toThrow(/columns/);
    expect(() => setupHall(base(), { columns: 2, tables: 0, seatsPerTable: 10 })).toThrow(/tables/);
    expect(() => setupHall(base(), { columns: 2, tables: 2, seatsPerTable: 0 })).toThrow(/seatsPerTable/);
    expect(() => fullReseat({ ...base(), categories: [...cats("a"), { id: "a", rank: 2 }] })).toThrow(
      /duplicate category/,
    );
    expect(() =>
      fullReseat({
        ...base(),
        categories: [
          { id: "a", rank: 1 },
          { id: "b", rank: 1 },
        ],
      }),
    ).toThrow(/rank/);
    expect(() => fullReseat({ ...base(), families: [fam("f1", "a", 2), fam("f1", "a", 2)] })).toThrow(
      /duplicate family/,
    );
  });
});
