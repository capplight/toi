/**
 * Seating engine — public contract for Ф2 (server actions), Ф4 and Ф7b (UI preview).
 * Pure TypeScript: no React, no DB, no clock; deterministic (plan 7.1).
 */
export * from "./types";
export { MAX_FAMILY_SEATS, seatsOf, validateFamily, validateHall, validateState } from "./family";
export { layoutTables, type Layout, type TableInfo } from "./layout";
export { fullReseat, previewFullReseat, type FullReseatPreview } from "./fullReseat";
export { placeIncremental, suggestTable } from "./incremental";
export {
  setupHall,
  seatUnplaced,
  addFamily,
  setRsvp,
  setSeats,
  removeFamily,
  restoreFamily,
  moveFamily,
  unlockFamily,
  reorderCategories,
} from "./events";
export { tableStats, totals, type HallStats, type TableStat, type Totals } from "./stats";
export { buildDiff, invertDiff, undoChange, type SeatingDiff, type SeatState } from "./undo";
