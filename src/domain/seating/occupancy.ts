import { seatsOf } from "./family";
import type { Family } from "./types";
import type { Layout } from "./layout";

/** Mutable working copy of table usage (internal to one engine call). */
export class Occupancy {
  private readonly used = new Map<number, number>();
  private readonly cats = new Map<number, Map<string, number>>();
  private readonly capacity = new Map<number, number>();

  constructor(
    layout: Layout,
    private readonly firstCategoryId: string | null,
  ) {
    for (const t of layout.tables) {
      this.capacity.set(t.no, t.capacity);
      this.used.set(t.no, 0);
      this.cats.set(t.no, new Map());
    }
  }

  has(tableNo: number | null): tableNo is number {
    return tableNo !== null && this.capacity.has(tableNo);
  }

  free(tableNo: number): number {
    return (this.capacity.get(tableNo) ?? 0) - (this.used.get(tableNo) ?? 0);
  }

  add(tableNo: number, f: Pick<Family, "categoryId" | "rsvp" | "expected" | "confirmed">): void {
    this.used.set(tableNo, (this.used.get(tableNo) ?? 0) + seatsOf(f));
    const m = this.cats.get(tableNo)!;
    m.set(f.categoryId, (m.get(f.categoryId) ?? 0) + 1);
  }

  /**
   * Automation constraints (plan 7.3): the family fits whole (never split) and the first category's
   * tables are exclusive — no other category joins them and the first category joins no one else.
   * Manual moves ignore these rules.
   */
  fits(tableNo: number, f: Pick<Family, "categoryId" | "rsvp" | "expected" | "confirmed">): boolean {
    if (this.free(tableNo) < seatsOf(f)) return false;
    const first = this.firstCategoryId;
    if (first === null) return true;
    const m = this.cats.get(tableNo)!;
    for (const cat of m.keys()) {
      if (f.categoryId === first ? cat !== first : cat === first) return false;
    }
    return true;
  }
}
