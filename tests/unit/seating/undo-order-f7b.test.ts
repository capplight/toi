import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildDiff, reorderCategories, type SeatingState, undoChange } from "@/domain/seating";
import { cats, fam } from "./helpers";

/**
 * Ф7b brief §2 (Ф4 review «что осталось»): undoing an order change keeps categories that are not in `before`
 * (added later, e.g. «Жаңа санат»): they go after the restored ones, in their previous relative order, never rank 0.
 */
const order = (s: SeatingState) => [...s.categories].sort((a, b) => a.rank - b.rank).map((c) => c.id);

function withNewCategory(s: SeatingState, id: string, at: number): SeatingState {
  const ids = order(s);
  ids.splice(at, 0, id);
  return { ...s, categories: [...s.categories, { id, rank: 0 }].map((c) => ({ ...c, rank: ids.indexOf(c.id) + 1 })) };
}

describe("undoChange — order with categories added later (Ф7b)", () => {
  const base: SeatingState = {
    hall: { columns: 4, tables: 4, seatsPerTable: 12 },
    categories: cats("a", "b", "c"),
    families: [fam("f1", "a", 4, { tableNo: 1 }), fam("f2", "b", 3, { tableNo: 2 })],
  };

  it("restores the old order and keeps the new category after the restored ones (not first)", () => {
    const moved = reorderCategories(base, ["b", "a", "c"]).state;
    const diff = buildDiff(base, moved);
    const added = withNewCategory(moved, "d", 1); // b, d, a, c
    const undone = undoChange(added, diff);
    expect(order(undone.state)).toEqual(["a", "b", "c", "d"]);
    expect(undone.state.categories.map((c) => c.rank).sort()).toEqual([1, 2, 3, 4]);
    expect(undone.warnings.filter((w) => w.kind === "undo_skipped")).toEqual([]);
    expect(undone.deltas).toEqual([]);
  });

  it("the createCategory record itself (id missing in `before`) never gives the new category rank 0", () => {
    const added = withNewCategory(base, "d", 0); // d, a, b, c
    const diff = buildDiff(base, added);
    const undone = undoChange(added, diff);
    expect(order(undone.state)).toEqual(["a", "b", "c", "d"]);
    expect(Math.min(...undone.state.categories.map((c) => c.rank))).toBe(1);
  });

  it("an order changed after the record is still skipped", () => {
    const moved = reorderCategories(base, ["b", "a", "c"]).state;
    const diff = buildDiff(base, moved);
    const again = reorderCategories(moved, ["c", "b", "a"]).state;
    const undone = undoChange(again, diff);
    expect(order(undone.state)).toEqual(["c", "b", "a"]);
    expect(undone.warnings).toContainEqual({ kind: "undo_skipped", familyIds: [], order: true, hall: false });
  });

  it("property: reorder → add k categories anywhere → undo = old order + new ones in their relative order", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 7 }).chain((n) =>
          fc.tuple(
            fc.constant(n),
            fc.shuffledSubarray(
              Array.from({ length: n }, (_, i) => `c${i}`),
              { minLength: n, maxLength: n },
            ),
            fc.array(fc.nat(), { maxLength: 4 }),
          ),
        ),
        ([n, perm, inserts]) => {
          const s0: SeatingState = {
            hall: null,
            categories: cats(...Array.from({ length: n }, (_, i) => `c${i}`)),
            families: [],
          };
          const s1 = reorderCategories(s0, perm).state;
          const diff = buildDiff(s0, s1);
          let s2 = s1;
          inserts.forEach((p, k) => (s2 = withNewCategory(s2, `new${k}`, p % (s2.categories.length + 1))));
          const newOrder = order(s2).filter((id) => id.startsWith("new"));
          const undone = undoChange(s2, diff);
          // same order → no `order` in the diff → nothing to restore
          expect(order(undone.state)).toEqual(diff.order ? [...order(s0), ...newOrder] : order(s2));
          const ranks = undone.state.categories.map((c) => c.rank).sort((a, b) => a - b);
          expect(ranks).toEqual(ranks.map((_, i) => i + 1));
        },
      ),
      { numRuns: 1000 },
    );
  });
});
