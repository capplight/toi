import type { Family, SeatDelta } from "./types";

/** Deltas for families whose table or lock differ between two lists (matched by id, order of `after`). */
export function collectDeltas(before: readonly Family[], after: readonly Family[]): SeatDelta[] {
  const prev = new Map(before.map((f) => [f.id, f]));
  const out: SeatDelta[] = [];
  for (const f of after) {
    const b = prev.get(f.id);
    const from = b?.tableNo ?? null;
    const wasLocked = b?.locked ?? false;
    if (from !== f.tableNo || wasLocked !== f.locked) {
      out.push({ familyId: f.id, from, to: f.tableNo, locked: f.locked });
    }
  }
  return out;
}

export function replaceFamily(list: readonly Family[], next: Family): Family[] {
  return list.map((f) => (f.id === next.id ? next : f));
}
