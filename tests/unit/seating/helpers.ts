import fc from "fast-check";
import type { Category, Family, HallConfig, SeatingState } from "@/domain/seating";
import { sampleEvent, sampleFamilies } from "../../fixtures/sample-event";

/** Seating state of design_spec 5.2: locks on tables 7 and 12, everyone else unseated. */
export function sampleState(): SeatingState {
  return {
    hall: { ...sampleEvent.hall },
    categories: sampleEvent.categories.map((c) => ({ id: c.id, rank: c.rank })),
    families: sampleFamilies.map((f) => ({
      id: f.id,
      categoryId: f.categoryId,
      rsvp: f.rsvp,
      expected: f.expected,
      confirmed: f.confirmed,
      tableNo: f.tableNo,
      locked: f.locked,
      lockedBy: f.lockedBy,
      seq: f.seq,
    })),
  };
}

export const tablesOf = (s: SeatingState) => Object.fromEntries(s.families.map((f) => [f.id, f.tableNo]));

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export function fam(id: string, categoryId: string, seats: number, extra: Partial<Family> = {}): Family {
  return {
    id,
    categoryId,
    rsvp: "yes",
    expected: seats,
    confirmed: seats,
    tableNo: null,
    locked: false,
    lockedBy: null,
    seq: Number(id.replace(/\D/g, "")) || 0,
    ...extra,
  };
}

export function cats(...ids: string[]): Category[] {
  return ids.map((id, i) => ({ id, rank: i + 1 }));
}

// ---------- fast-check arbitraries ----------

export const hallArb: fc.Arbitrary<HallConfig> = fc.record({
  columns: fc.constantFrom(2 as const, 4 as const),
  tables: fc.integer({ min: 1, max: 24 }),
  seatsPerTable: fc.integer({ min: 4, max: 16 }),
});

/** Random unseated state (no hall placements yet). */
export const unseatedStateArb: fc.Arbitrary<SeatingState> = fc
  .record({
    hall: hallArb,
    catCount: fc.integer({ min: 1, max: 6 }),
    fams: fc.array(
      fc.record({
        cat: fc.nat(5),
        rsvp: fc.constantFrom("yes", "pending", "pending", "yes", "no"),
        seats: fc.integer({ min: 1, max: 20 }),
        small: fc.integer({ min: 1, max: 6 }),
        useSmall: fc.boolean(),
      }),
      { maxLength: 70 },
    ),
  })
  .map(({ hall, catCount, fams }) => {
    const categories = Array.from({ length: catCount }, (_, i) => ({ id: `c${i}`, rank: i + 1 }));
    const families: Family[] = fams.map((f, i) => {
      const seats = f.useSmall ? f.small : f.seats;
      const rsvp = f.rsvp as Family["rsvp"];
      return {
        id: `f${i}`,
        categoryId: `c${f.cat % catCount}`,
        rsvp,
        expected: seats,
        confirmed: rsvp === "yes" ? seats : null,
        tableNo: null,
        locked: false,
        lockedBy: null,
        seq: i,
      };
    });
    return { hall, categories, families };
  });
