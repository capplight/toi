import { fullReseat, type SeatingState, tableStats } from "@/domain/seating";
import { dupPairs } from "@/domain/guests/duplicates";
import { sampleEvent, sampleFamilies } from "../../../../tests/fixtures/sample-event";

/** Demo data for /dev/ui only: the shared fixture (design_spec 5.2) through the Ф7a engine. */
export function demoState(opts: { tables?: number; seats?: number; columns?: 2 | 4 } = {}): SeatingState {
  return {
    hall: {
      columns: opts.columns ?? sampleEvent.hall.columns,
      tables: opts.tables ?? sampleEvent.hall.tables,
      seatsPerTable: opts.seats ?? sampleEvent.hall.seatsPerTable,
    },
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

export function demoHall(opts: Parameters<typeof demoState>[0] = {}) {
  const seated = fullReseat(demoState(opts)).state;
  const stats = tableStats(seated);
  const byId = new Map(seated.families.map((f) => [f.id, f]));
  const pairs = dupPairs(
    sampleFamilies.map((f) => ({ id: f.id, name: f.name, rsvp: f.rsvp, tableNo: byId.get(f.id)?.tableNo ?? null })),
  );
  const unplacedSeats = stats.unplaced.reduce((a, id) => {
    const f = byId.get(id)!;
    return a + (f.rsvp === "yes" ? (f.confirmed ?? 0) : f.expected);
  }, 0);
  return { state: seated, stats, pairs, unplacedSeats };
}

/** 20 tables × 16 seats (DESIGN_v2 9 check): every family of the fixture, larger hall. */
export const demoBigHall = () => demoHall({ tables: 20, seats: 16 });

export const categoryCodes: Record<string, string> = Object.fromEntries(
  sampleEvent.categories.map((c) => [c.id, c.id]),
);
export const categoryLabels: Record<string, string> = Object.fromEntries(
  sampleEvent.categories.map((c) => [c.id, c.name]),
);
export const familyName = (id: string) => sampleFamilies.find((f) => f.id === id)?.name ?? id;
export { sampleEvent, sampleFamilies };
