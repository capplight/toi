import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addFamily,
  buildDiff,
  type Family,
  fullReseat,
  moveFamily,
  placeIncremental,
  removeFamily,
  reorderCategories,
  restoreFamily,
  seatUnplaced,
  type SeatingResult,
  type SeatingState,
  seatsOf,
  setRsvp,
  setSeats,
  setupHall,
  tableStats,
  undoChange,
  unlockFamily,
} from "@/domain/seating";
import { deepFreeze, tablesOf, unseatedStateArb } from "./helpers";

export const RUNS = 1000;
const params = { numRuns: RUNS };

/** A seated state: full re-seat of a random state, then random manual moves (locks, possibly forced overflow). */
const seatedStateArb: fc.Arbitrary<SeatingState> = fc
  .tuple(unseatedStateArb, fc.array(fc.tuple(fc.nat(), fc.nat(), fc.boolean()), { maxLength: 6 }))
  .map(([s0, moves]) => {
    let s = fullReseat(s0).state;
    for (const [fi, ti, force] of moves) {
      if (!s.families.length || !s.hall) break;
      const f = s.families[fi % s.families.length]!;
      if (seatsOf(f) === 0) continue;
      s = moveFamily(s, f.id, (ti % s.hall.tables) + 1, { force, by: "m" }).state;
    }
    return s;
  });

const pick = <T>(xs: readonly T[], i: number): T | undefined => (xs.length ? xs[i % xs.length] : undefined);

type Op = { name: string; subject: string | null; run: (s: SeatingState) => SeatingResult };

/** Random operation of plan 7.2 other than full re-seat and undo. */
const opArb = (s: SeatingState): fc.Arbitrary<Op> =>
  fc
    .tuple(
      fc.integer({ min: 0, max: 10 }),
      fc.nat(),
      fc.integer({ min: 1, max: 20 }),
      fc.constantFrom<Family["rsvp"]>("yes", "no", "pending"),
      fc.nat(),
      fc.boolean(),
    )
    .map(([kind, i, n, rsvp, j, force]) => {
      const f = pick(s.families, i);
      const id = f?.id ?? null;
      const cat = pick(s.categories, j)!.id;
      switch (f ? kind : 0) {
        case 0:
          return {
            name: "addFamily",
            subject: "new",
            run: (x: SeatingState) =>
              addFamily(x, {
                id: "new",
                categoryId: cat,
                rsvp: "yes",
                expected: n,
                confirmed: n,
                tableNo: null,
                locked: false,
                lockedBy: null,
                seq: 10_000,
              }),
          };
        case 1:
          return {
            name: "setRsvp",
            subject: id,
            run: (x: SeatingState) => setRsvp(x, id!, rsvp, { confirmed: rsvp === "yes" ? n : null }),
          };
        case 2:
          return {
            name: "setSeats",
            subject: id,
            run: (x: SeatingState) => setSeats(x, id!, f!.rsvp === "yes" ? { confirmed: n } : { expected: n }),
          };
        case 3:
          return { name: "removeFamily", subject: id, run: (x: SeatingState) => removeFamily(x, id!) };
        case 4:
          return {
            name: "restoreFamily",
            subject: id,
            run: (x: SeatingState) => {
              const r = removeFamily(x, id!);
              return restoreFamily(r.state, r.removed);
            },
          };
        case 5:
          return { name: "unlockFamily", subject: id, run: (x: SeatingState) => unlockFamily(x, id!) };
        case 6: {
          const order = [...s.categories]
            .map((c) => c.id)
            .sort((a, b) => ((a.charCodeAt(1) * (j + 7)) % 13) - ((b.charCodeAt(1) * (j + 7)) % 13));
          return { name: "reorderCategories", subject: null, run: (x: SeatingState) => reorderCategories(x, order) };
        }
        case 7:
          return {
            name: "setupHall(bigger)",
            subject: null,
            run: (x: SeatingState) => setupHall(x, { ...x.hall!, tables: x.hall!.tables + (n % 5) }),
          };
        case 8:
          return {
            name: "placeIncremental",
            subject: null,
            run: (x: SeatingState) =>
              placeIncremental(
                x,
                x.families.filter((_, k) => (k + j) % 3 === 0).map((y) => y.id),
              ),
          };
        case 9:
          return { name: "seatUnplaced", subject: null, run: (x: SeatingState) => seatUnplaced(x) };
        default: {
          // Only families that need seats can be moved (0 seats → SeatingError, Д3).
          const m = pick(
            s.families.filter((y) => seatsOf(y) > 0),
            i,
          );
          if (!m) return { name: "seatUnplaced", subject: null, run: (x: SeatingState) => seatUnplaced(x) };
          return {
            name: "moveFamily",
            subject: m.id,
            run: (x: SeatingState) => moveFamily(x, m.id, (j % x.hall!.tables) + 1, { force }),
          };
        }
      }
    });

const stateAndOp = seatedStateArb.chain((s) => opArb(s).map((op) => [s, op] as const));

describe(`seating invariants 7.4 (fast-check, ${RUNS} runs each)`, () => {
  it("1. no operation except full re-seat / undo / the family's own move changes another seated family's table", () => {
    fc.assert(
      fc.property(stateAndOp, ([s, op]) => {
        const after = tablesOf(op.run(s).state);
        for (const f of s.families) {
          if (f.id === op.subject || f.tableNo === null || !(f.id in after)) continue;
          expect(after[f.id], `${op.name}: ${f.id}`).toBe(f.tableNo);
        }
      }),
      params,
    );
  });

  it("1b. a smaller hall moves only families from removed tables", () => {
    fc.assert(
      fc.property(seatedStateArb, fc.integer({ min: 1, max: 24 }), (s, t) => {
        const tables = Math.min(t, s.hall!.tables);
        const after = tablesOf(setupHall(s, { ...s.hall!, tables }).state);
        for (const f of s.families) if (f.tableNo !== null && f.tableNo <= tables) expect(after[f.id]).toBe(f.tableNo);
      }),
      params,
    );
  });

  it("2. automation never creates overflow (tables it adds seats to stay within capacity)", () => {
    fc.assert(
      fc.property(stateAndOp, ([s, op]) => {
        if (op.name === "moveFamily" || op.name === "setSeats" || op.name === "setRsvp" || op.name === "restoreFamily")
          return; // overflow allowed only via these (Р3, «Бәрібір ауыстыру», old seats)
        const before = new Map(tableStats(s).tables.map((t) => [t.no, t.used]));
        for (const t of tableStats(op.run(s).state).tables) {
          if (t.used > (before.get(t.no) ?? 0))
            expect(t.used, `${op.name} table ${t.no}`).toBeLessThanOrEqual(t.capacity);
        }
      }),
      params,
    );
  });

  it("2b. full re-seat: an overfull table holds only locked families", () => {
    fc.assert(
      fc.property(seatedStateArb, (s) => {
        const r = fullReseat(s).state;
        const byId = new Map(r.families.map((f) => [f.id, f]));
        for (const t of tableStats(r).overfull) for (const id of t.familyIds) expect(byId.get(id)!.locked).toBe(true);
      }),
      params,
    );
  });

  it("3. a family is never split: every needed seat is either at one existing table or unplaced", () => {
    fc.assert(
      fc.property(stateAndOp, ([s, op]) => {
        const r = op.run(s).state;
        const st = tableStats(r);
        const seated = st.tables.reduce((a, t) => a + t.used, 0);
        const unplaced = st.unplaced.reduce((a, id) => a + seatsOf(r.families.find((f) => f.id === id)!), 0);
        expect(seated + unplaced).toBe(r.families.reduce((a, f) => a + seatsOf(f), 0));
      }),
      params,
    );
  });

  it("4. the first category's tables are not shared by the automation (full re-seat)", () => {
    fc.assert(
      fc.property(seatedStateArb, (s) => {
        const r = fullReseat(s).state;
        const first = [...r.categories].sort((a, b) => a.rank - b.rank)[0]!.id;
        const byId = new Map(r.families.map((f) => [f.id, f]));
        for (const t of tableStats(r).tables) {
          const fams = t.familyIds.map((id) => byId.get(id)!);
          const autoFirst = fams.some((f) => !f.locked && f.categoryId === first);
          const autoOther = fams.some((f) => !f.locked && f.categoryId !== first);
          if (autoFirst) expect(fams.every((f) => f.categoryId === first)).toBe(true);
          if (autoOther) expect(fams.every((f) => f.categoryId !== first)).toBe(true);
        }
      }),
      params,
    );
  });

  it("4b. incremental placement keeps the same exclusivity for every family it places", () => {
    fc.assert(
      fc.property(stateAndOp, ([s0, op]) => {
        if (op.name !== "placeIncremental" && op.name !== "addFamily") return;
        const s = {
          ...s0,
          families: s0.families.map((f, k) => (k % 2 ? { ...f, tableNo: f.locked ? f.tableNo : null } : f)),
        };
        const r = op.run(s);
        const first = [...r.state.categories].sort((a, b) => a.rank - b.rank)[0]!.id;
        const st = tableStats(r.state);
        const byId = new Map(r.state.families.map((f) => [f.id, f]));
        for (const d of r.deltas) {
          if (d.from !== null || d.to === null) continue;
          const me = byId.get(d.familyId)!;
          const mates = st.tables.find((t) => t.no === d.to)!.familyIds.map((id) => byId.get(id)!);
          for (const m of mates) expect(m.categoryId === first).toBe(me.categoryId === first);
        }
      }),
      params,
    );
  });

  it("6. undo(apply(x)) == x for move, order, hall and full re-seat", () => {
    const opsArb = fc.tuple(seatedStateArb, fc.integer({ min: 0, max: 3 }), fc.nat(), fc.integer({ min: 1, max: 30 }));
    fc.assert(
      fc.property(opsArb, ([s, kind, i, n]) => {
        let after: SeatingState;
        const movable = s.families.filter((f) => seatsOf(f) > 0);
        if (kind === 0 && movable.length) {
          after = moveFamily(s, movable[i % movable.length]!.id, (i % s.hall!.tables) + 1, { force: true }).state;
        } else if (kind === 1) {
          after = reorderCategories(
            s,
            [...s.categories].reverse().map((c) => c.id),
          ).state;
        } else if (kind === 2) {
          after = setupHall(s, { columns: n % 2 ? 2 : 4, tables: n, seatsPerTable: 4 + (i % 12) }).state;
        } else {
          after = fullReseat(s).state;
        }
        const u = undoChange(after, buildDiff(s, after));
        expect(u.state).toEqual(s);
        expect(u.warnings.some((w) => w.kind === "undo_skipped")).toBe(false);
      }),
      params,
    );
  });

  /** Every seated family sits at an existing table and needs seats (Д1, Д3). */
  function assertSeatsValid(r: SeatingState, label: string) {
    const tables = r.hall ? r.hall.tables : 0;
    for (const f of r.families) {
      if (f.tableNo === null) continue;
      expect(f.tableNo >= 1 && f.tableNo <= tables, `${label}: ${f.id}@${f.tableNo} of ${tables}`).toBe(true);
      expect(seatsOf(f), `${label}: ${f.id} seated with 0 seats`).toBeGreaterThan(0);
    }
  }

  it("8. after any operation no family sits at a non-existent table, none with 0 seats sits at all", () => {
    fc.assert(
      fc.property(stateAndOp, ([s, op]) => {
        assertSeatsValid(op.run(s).state, op.name);
      }),
      params,
    );
  });

  it("8b. undo of a hall change after an intermediate operation: no family left at a missing table (Д1)", () => {
    const arb = seatedStateArb.chain((s) =>
      fc.tuple(fc.integer({ min: 1, max: 24 }), fc.integer({ min: 4, max: 16 })).chain(([tables, seats]) => {
        const changed = setupHall(s, { ...s.hall!, tables, seatsPerTable: seats }).state;
        return opArb(changed).map((op) => ({ s, changed, op }));
      }),
    );
    fc.assert(
      fc.property(arb, ({ s, changed, op }) => {
        const diff = buildDiff(s, changed);
        const mid = op.run(changed).state;
        const u = undoChange(mid, diff);
        assertSeatsValid(u.state, `undo hall after ${op.name}`);
        // Families seated on tables that still exist and were not part of the diff do not move.
        const touched = new Set(diff.families.map((d) => d.id));
        const after = tablesOf(u.state);
        for (const f of mid.families) {
          if (touched.has(f.id) || f.tableNo === null || !u.state.hall || f.tableNo > u.state.hall.tables) continue;
          expect(after[f.id], f.id).toBe(f.tableNo);
        }
      }),
      params,
    );
  });

  it("7. deterministic and pure: same input → same output, input never mutated", () => {
    fc.assert(
      fc.property(stateAndOp, ([s, op]) => {
        const frozen = deepFreeze(structuredClone(s));
        expect(op.run(frozen)).toEqual(op.run(structuredClone(s)));
        expect(fullReseat(frozen)).toEqual(fullReseat(structuredClone(s)));
      }),
      params,
    );
  });

  it("first setup: batch placeIncremental equals the full re-seat 6.1 whenever everyone fits", () => {
    fc.assert(
      fc.property(unseatedStateArb, (s) => {
        const full = fullReseat(s);
        fc.pre(!full.warnings.some((w) => w.kind === "unplaced"));
        const inc = placeIncremental(
          s,
          s.families.map((f) => f.id),
        );
        expect(tablesOf(inc.state)).toEqual(tablesOf(full.state));
      }),
      params,
    );
  });
});
