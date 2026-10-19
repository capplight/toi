import { type Family, type HallConfig, SeatingError, type SeatingState } from "./types";

/** Seat limit per family everywhere: UI, guest form, data model (decision Д4/13). */
export const MAX_FAMILY_SEATS = 20;

/** Seats to plan for (plan 5.1): yes → confirmed, pending → expected, no → 0. */
export function seatsOf(f: Pick<Family, "rsvp" | "expected" | "confirmed">): number {
  if (f.rsvp === "no") return 0;
  if (f.rsvp === "yes") return f.confirmed ?? 0;
  return f.expected;
}

function assertCount(value: number, what: string, id: string): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_FAMILY_SEATS) {
    throw new SeatingError(`${what} of family ${id} must be an integer 1…${MAX_FAMILY_SEATS}`);
  }
}

export function validateFamily(f: Family): void {
  assertCount(f.expected, "expected", f.id);
  if (f.rsvp === "yes") {
    if (f.confirmed === null) throw new SeatingError(`confirmed of family ${f.id} is required for rsvp "yes"`);
    assertCount(f.confirmed, "confirmed", f.id);
  } else if (f.confirmed !== null) {
    assertCount(f.confirmed, "confirmed", f.id);
  }
}

export function validateHall(h: HallConfig): void {
  if (h.columns !== 2 && h.columns !== 4) throw new SeatingError("hall columns must be 2 or 4");
  if (!Number.isInteger(h.tables) || h.tables < 1) throw new SeatingError("hall tables must be a positive integer");
  if (!Number.isInteger(h.seatsPerTable) || h.seatsPerTable < 1) {
    throw new SeatingError("hall seatsPerTable must be a positive integer");
  }
}

export function validateState(s: SeatingState): void {
  if (s.hall) validateHall(s.hall);
  const cats = new Set<string>();
  const ranks = new Set<number>();
  for (const c of s.categories) {
    if (cats.has(c.id)) throw new SeatingError(`duplicate category ${c.id}`);
    if (ranks.has(c.rank)) throw new SeatingError(`duplicate category rank ${c.rank}`);
    cats.add(c.id);
    ranks.add(c.rank);
  }
  const ids = new Set<string>();
  for (const f of s.families) {
    if (ids.has(f.id)) throw new SeatingError(`duplicate family ${f.id}`);
    ids.add(f.id);
    if (!cats.has(f.categoryId)) throw new SeatingError(`family ${f.id} has unknown category ${f.categoryId}`);
    validateFamily(f);
  }
}

/** Categories sorted by rank (seating order). */
export function orderedCategories(s: Pick<SeatingState, "categories">) {
  return [...s.categories].sort((a, b) => a.rank - b.rank);
}

/** Id of the first category by rank (exclusive tables), or null when there are no categories. */
export function firstCategoryId(s: Pick<SeatingState, "categories">): string | null {
  return orderedCategories(s)[0]?.id ?? null;
}

export function findFamily(s: SeatingState, id: string): Family {
  const f = s.families.find((x) => x.id === id);
  if (!f) throw new SeatingError(`unknown family ${id}`);
  return f;
}
