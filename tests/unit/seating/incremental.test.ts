import { describe, expect, it } from "vitest";
import { fullReseat, placeIncremental, suggestTable, type SeatingState } from "@/domain/seating";
import { candidatePositions } from "@/domain/seating/incremental";
import { cats, fam, sampleState, tablesOf } from "./helpers";

// 4 columns × 8 tables of 10: proximity 2, 3, 1, 4, 6, 7, 5, 8.
const hall = { columns: 4 as const, tables: 8, seatsPerTable: 10 };

describe("placeIncremental (plan 7.3)", () => {
  it("first setup (no locks): same result as the full re-seat 6.1 on the sample", () => {
    const s = sampleState();
    const unlocked: SeatingState = {
      ...s,
      families: s.families.map((f) => ({ ...f, tableNo: null, locked: false, lockedBy: null })),
    };
    const inc = placeIncremental(
      unlocked,
      unlocked.families.map((f) => f.id),
    );
    expect(tablesOf(inc.state)).toEqual(tablesOf(fullReseat(unlocked).state));
  });

  it("a new family joins its category zone (fills a hole inside the zone first)", () => {
    const s: SeatingState = {
      hall,
      categories: cats("kuda", "oz"),
      families: [
        fam("f1", "kuda", 10, { tableNo: 2 }),
        fam("f2", "oz", 8, { tableNo: 3 }), // pos 1
        fam("f3", "oz", 10, { tableNo: 1 }), // pos 2
        fam("f4", "oz", 2),
      ],
    };
    const r = placeIncremental(s, ["f4"]);
    expect(r.deltas).toEqual([{ familyId: "f4", from: null, to: 3, locked: false }]);
  });

  it("then the tables after the zone", () => {
    const s: SeatingState = {
      hall,
      categories: cats("kuda", "oz"),
      families: [fam("f1", "kuda", 10, { tableNo: 2 }), fam("f2", "oz", 9, { tableNo: 3 }), fam("f3", "oz", 5)],
    };
    expect(placeIncremental(s, ["f3"]).state.families[2]!.tableNo).toBe(1); // pos 2
  });

  it("empty zone: starts after the previous category; after the first category — the next table (not shared)", () => {
    const s: SeatingState = {
      hall,
      categories: cats("kuda", "oz", "dos"),
      families: [fam("f1", "kuda", 3, { tableNo: 2 }), fam("f2", "oz", 3), fam("f3", "dos", 3)],
    };
    const r = placeIncremental(s, ["f2"]);
    expect(r.state.families[1]!.tableNo).toBe(3); // pos 1, not table 2 of құдалар
    const r2 = placeIncremental(r.state, ["f3"]);
    expect(r2.state.families[2]!.tableNo).toBe(3); // shares the boundary table with oz
  });

  it("skips categories without a zone when looking for the start", () => {
    const s: SeatingState = {
      hall,
      categories: cats("kuda", "oz", "dos", "ariptes"),
      families: [fam("f1", "oz", 8, { tableNo: 6 }), fam("f2", "ariptes", 2)], // oz at pos 4
    };
    expect(placeIncremental(s, ["f2"]).state.families[1]!.tableNo).toBe(6); // start = pos 4, fits
  });

  it("falls back to tables before the start, nearest first", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 4, seatsPerTable: 4 },
      categories: cats("a", "b"),
      families: [fam("f1", "b", 4, { tableNo: 3 }), fam("f2", "b", 4, { tableNo: 4 }), fam("f3", "b", 2)],
    };
    // zone pos 2..3 full → before: pos 1 (table 2) then pos 0.
    expect(placeIncremental(s, ["f3"]).state.families[2]!.tableNo).toBe(2);
  });

  it("no table with enough free seats → unplaced (family is never split)", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 2, seatsPerTable: 4 },
      categories: cats("a"),
      families: [fam("f1", "a", 3, { tableNo: 1 }), fam("f2", "a", 3, { tableNo: 2 }), fam("f3", "a", 2)],
    };
    const r = placeIncremental(s, ["f3"]);
    expect(r.state.families[2]!.tableNo).toBeNull();
    expect(r.warnings).toEqual([{ kind: "unplaced", familyId: "f3" }]);
  });

  it("first category's tables are exclusive both ways", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 2, seatsPerTable: 10 },
      categories: cats("kuda", "oz"),
      families: [
        fam("f1", "kuda", 2, { tableNo: 1 }),
        fam("f2", "oz", 2, { tableNo: 2 }),
        fam("f3", "oz", 2),
        fam("f4", "kuda", 2),
        fam("f5", "kuda", 9),
      ],
    };
    const r = placeIncremental(s, ["f3", "f4", "f5"]);
    expect(tablesOf(r.state)).toMatchObject({ f3: 2, f4: 1, f5: null });
  });

  it("ignores families that are already seated, declined or unknown", () => {
    const s: SeatingState = {
      hall,
      categories: cats("a"),
      families: [fam("f1", "a", 2, { tableNo: 5 }), fam("f2", "a", 2, { rsvp: "no", confirmed: null })],
    };
    const r = placeIncremental(s, ["f1", "f2", "nope"]);
    expect(r.deltas).toEqual([]);
    expect(r.state).toEqual(s);
  });

  it("without a hall nothing is placed", () => {
    const s: SeatingState = { hall: null, categories: cats("a"), families: [fam("f1", "a", 2)] };
    expect(placeIncremental(s, ["f1"]).deltas).toEqual([]);
  });

  it("batch order: rank, then seats descending, then seq", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 2, seatsPerTable: 6 },
      categories: cats("kuda", "a", "b"), // no құдалар families: a and b may share
      families: [fam("f1", "b", 2), fam("f2", "a", 2), fam("f3", "a", 5)],
    };
    // a first (f3 5 seats before f2), then b starts at a's last table.
    expect(placeIncremental(s, ["f1", "f2", "f3"]).deltas.map((d) => [d.familyId, d.to])).toEqual([
      ["f1", 2],
      ["f2", 2],
      ["f3", 1],
    ]);
  });

  it("a non-first category never joins the first category's table, even as a last resort", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 2, seatsPerTable: 6 },
      categories: cats("a", "b"),
      families: [fam("f1", "b", 2), fam("f2", "a", 2), fam("f3", "a", 5)],
    };
    expect(tablesOf(placeIncremental(s, ["f1", "f2", "f3"]).state)).toEqual({ f1: null, f2: 2, f3: 1 });
  });
});

describe("suggestTable («Бос орынға ауыстыру», Р3)", () => {
  it("offers another table with room, never the current one", () => {
    const s: SeatingState = {
      hall,
      categories: cats("a"),
      families: [fam("f1", "a", 9, { tableNo: 2 }), fam("f2", "a", 4, { tableNo: 2 })],
    };
    expect(suggestTable(s, "f2")).toBe(3);
  });
  it("null when nothing fits, unknown family or no hall", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 1, seatsPerTable: 4 },
      categories: cats("a"),
      families: [fam("f1", "a", 4, { tableNo: 1 })],
    };
    expect(suggestTable(s, "f1")).toBeNull();
    expect(suggestTable(s, "x")).toBeNull();
    expect(suggestTable({ ...s, hall: null }, "f1")).toBeNull();
  });
});

describe("candidatePositions", () => {
  it("ascending from the start, then descending before it; empty without a hall", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 5, seatsPerTable: 4 },
      categories: cats("a", "b"),
      families: [fam("f1", "a", 2, { tableNo: 2 }), fam("f2", "b", 2, { tableNo: 4 })],
    };
    expect(candidatePositions(s, "b")).toEqual([2, 3, 4, 1, 0]); // S = pos 1 + 1 (a is first), Z = {3}
    expect(candidatePositions({ ...s, hall: null }, "b")).toEqual([]);
  });
});
