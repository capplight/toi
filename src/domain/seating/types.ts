/**
 * Seating engine types (plan 7, brief Ф7a). Pure data — no React, no DB, no clock.
 */

export type Rsvp = "yes" | "no" | "pending";

export type HallConfig = {
  /** «қатар» = longitudinal columns of tables from the төр to the entrance (design_spec 3.13). */
  columns: 2 | 4;
  tables: number;
  seatsPerTable: number;
};

export type Category = {
  id: string;
  /** Seating order 1…N (strict). The category with the lowest rank (usually Құдалар) never shares tables with others. */
  rank: number;
};

export type Family = {
  id: string;
  categoryId: string;
  rsvp: Rsvp;
  /** Expected seats while there is no answer (1…20). */
  expected: number;
  /** Confirmed seats for rsvp «yes» (1…20), otherwise null. */
  confirmed: number | null;
  /** null = not seated. */
  tableNo: number | null;
  /** Placed by hand (`seat_locked`). */
  locked: boolean;
  /** Who locked it (member id), for history/diff. */
  lockedBy?: string | null;
  /** Stable data order (creation order). Tie-break for equal seat counts. */
  seq: number;
};

export type SeatingState = {
  /** null = hall not set up yet. */
  hall: HallConfig | null;
  categories: readonly Category[];
  /** Active (not deleted) families. */
  families: readonly Family[];
};

export type SeatDelta = {
  familyId: string;
  from: number | null;
  to: number | null;
  /** Lock state after the change. */
  locked: boolean;
};

export type Warning =
  /** Auto-placement found no table with enough free seats («Отырғызылмағандар»). */
  | { kind: "unplaced"; familyId: string }
  /** A table holds more than its capacity (locks, grown seat count, forced move). */
  | { kind: "table_overflow"; tableNo: number; missing: number }
  /** A manual move would overflow the table; nothing changed (repeat with `force` = «Бәрібір ауыстыру»). */
  | { kind: "move_overflow"; familyId: string; tableNo: number; missing: number }
  /** A locked family's table no longer exists; the lock was dropped and the family re-placed. */
  | { kind: "lock_dropped"; familyId: string }
  /** Undo skipped families/fields that changed after the recorded change. */
  | { kind: "undo_skipped"; familyIds: string[]; order: boolean; hall: boolean };

export type SeatingResult = {
  state: SeatingState;
  /** Families whose table or lock changed, in processing order. */
  deltas: SeatDelta[];
  warnings: Warning[];
};

export class SeatingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeatingError";
  }
}
