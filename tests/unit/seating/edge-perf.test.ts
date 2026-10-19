import { describe, expect, it } from "vitest";
import { type Family, fullReseat, placeIncremental, type SeatingState, setupHall, tableStats } from "@/domain/seating";
import { cats, fam, sampleState, tablesOf } from "./helpers";

describe("edge cases (brief Ф7a)", () => {
  it("18 tables in 4 columns: the sample seats the same and tables 17–18 stay empty", () => {
    const s = { ...sampleState(), hall: { columns: 4 as const, tables: 18, seatsPerTable: 12 } };
    const r = fullReseat(s).state;
    expect(tablesOf(r)).toEqual(tablesOf(fullReseat(sampleState()).state));
    expect(
      tableStats(r)
        .tables.slice(16)
        .map((t) => [t.no, t.column, t.used]),
    ).toEqual([
      [17, 1, 0],
      [18, 2, 0],
    ]);
  });

  it("2 columns: proximity = numbering; құдалар first, next category starts on the next table", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 6, seatsPerTable: 10 },
      categories: cats("kuda", "oz", "dos"),
      families: [
        fam("f1", "kuda", 6),
        fam("f2", "kuda", 2),
        fam("f3", "oz", 7),
        fam("f4", "oz", 5),
        fam("f5", "dos", 3),
      ],
    };
    expect(tablesOf(fullReseat(s).state)).toEqual({ f1: 1, f2: 1, f3: 2, f4: 3, f5: 3 });
  });

  it("empty categories are skipped and do not shift the start", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 4, seatsPerTable: 10 },
      categories: cats("kuda", "empty1", "oz", "empty2", "dos"),
      families: [fam("f1", "kuda", 4), fam("f2", "oz", 8), fam("f3", "dos", 2)],
    };
    expect(tablesOf(fullReseat(s).state)).toEqual({ f1: 1, f2: 2, f3: 2 });
  });

  it("no categories with families and no hall: nothing to do", () => {
    const s: SeatingState = { hall: null, categories: [], families: [] };
    expect(fullReseat(s)).toEqual({ state: s, deltas: [], warnings: [] });
  });

  it("without a hall a full re-seat clears unlocked tables only", () => {
    const s: SeatingState = {
      hall: null,
      categories: cats("a"),
      families: [fam("f1", "a", 2, { tableNo: 3 }), fam("f2", "a", 2, { tableNo: 4, locked: true })],
    };
    expect(tablesOf(fullReseat(s).state)).toEqual({ f1: null, f2: 4 });
  });

  it("full re-seat drops locks on removed tables and on declined families", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 2, seatsPerTable: 10 },
      categories: cats("a"),
      families: [
        fam("f1", "a", 2, { tableNo: 5, locked: true }),
        fam("f2", "a", 2, { tableNo: 1, locked: true, rsvp: "no", confirmed: null }),
      ],
    };
    const r = fullReseat(s);
    expect(r.state.families.map((f) => [f.id, f.tableNo, f.locked])).toEqual([
      ["f1", 1, false],
      ["f2", null, false],
    ]);
    expect(r.warnings).toEqual([{ kind: "lock_dropped", familyId: "f1" }]);
  });

  it("a family bigger than any table stays unplaced (never split)", () => {
    const s: SeatingState = {
      hall: { columns: 2, tables: 4, seatsPerTable: 10 },
      categories: cats("a"),
      families: [fam("f1", "a", 20)],
    };
    expect(fullReseat(s).warnings).toEqual([{ kind: "unplaced", familyId: "f1" }]);
    expect(placeIncremental(s, ["f1"]).warnings).toEqual([{ kind: "unplaced", familyId: "f1" }]);
  });

  it("hall reduced together with locked families: locks on removed tables dropped, re-placed", () => {
    const s = fullReseat(sampleState()).state;
    const r = setupHall(s, { columns: 4, tables: 10, seatsPerTable: 12 });
    const moved = new Set(r.deltas.map((d) => d.familyId));
    for (const id of ["f38", "f39", "f40", "f42", "f43"]) expect(moved.has(id)).toBe(true); // locked on 12
    expect(r.state.families.find((f) => f.id === "f31")).toMatchObject({ tableNo: 7, locked: true }); // 7 still exists
  });
});

/** Deterministic pseudo-random event: 300 families, 8 categories, 60 tables × 16 (960 seats). */
function bigState(): SeatingState {
  let x = 42;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648), x / 2147483648);
  const categories = cats("c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8");
  const families: Family[] = Array.from({ length: 300 }, (_, i) => {
    const seats = 1 + Math.floor(rnd() * 5);
    const r = rnd();
    const rsvp = r < 0.7 ? "yes" : r < 0.93 ? "pending" : "no";
    const locked = rnd() < 0.05;
    return {
      id: `f${i}`,
      categoryId: categories[Math.floor(rnd() * 8)]!.id,
      rsvp,
      expected: seats,
      confirmed: rsvp === "yes" ? seats : null,
      tableNo: locked ? 1 + Math.floor(rnd() * 60) : null,
      locked,
      lockedBy: locked ? "m" : null,
      seq: i,
    };
  });
  return { hall: { columns: 4, tables: 60, seatsPerTable: 16 }, categories, families };
}

function medianMs(fn: () => void, runs = 21): number {
  fn(); // warm-up
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    fn();
    t.push(performance.now() - s);
  }
  return t.sort((a, b) => a - b)[Math.floor(runs / 2)]!;
}

describe("performance: 300 families, 60 tables × 16", () => {
  const s = bigState();

  it("full re-seat < 20 ms", () => {
    const ms = medianMs(() => fullReseat(s));
    console.info(`[perf] fullReseat 300 families / 60 tables: median ${ms.toFixed(2)} ms`);
    expect(fullReseat(s).state.families.filter((f) => f.tableNo !== null).length).toBeGreaterThan(250);
    expect(ms).toBeLessThan(20);
  });

  it("batch placeIncremental (first setup) < 20 ms", () => {
    const unseated = {
      ...s,
      families: s.families.map((f) => ({ ...f, tableNo: null, locked: false, lockedBy: null })),
    };
    const ms = medianMs(() =>
      placeIncremental(
        unseated,
        unseated.families.map((f) => f.id),
      ),
    );
    console.info(`[perf] placeIncremental 300 families / 60 tables: median ${ms.toFixed(2)} ms`);
    expect(ms).toBeLessThan(20);
  });
});
