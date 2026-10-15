import { dayKey } from "../format";
/**
 * «Шығындар» (Ф9, plan 5 `expenses`, DESIGN 8.20): pure money rules — no React, no DB, no clock (today is a parameter).
 * Money is whole tenge (`bigint` in the DB, safe integers here).
 */

export const EXPENSE_CATEGORIES = [
  "restaurant",
  "asaba",
  "clothes",
  "gifts",
  "decor",
  "photo",
  "transport",
  "other",
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

/** Upper bound of one amount (10 billion tenge): far above any toi, below `Number.MAX_SAFE_INTEGER`. */
export const MAX_AMOUNT = 10_000_000_000;
export const TITLE_MAX = 80;
export const NOTE_MAX = 500;

export const isCategory = (v: string): v is ExpenseCategory => (EXPENSE_CATEGORIES as readonly string[]).includes(v);

/**
 * Amount typed by a person: digits with any spaces (also no-break / narrow no-break) — «150 000», «150000».
 * Empty → 0. Anything else (minus, comma, letters, more than `MAX_AMOUNT`) → null (`budget.item.errors.amount`).
 */
export function parseAmount(raw: string): number | null {
  const s = raw.replace(/[\s  ]/g, "");
  if (s === "") return 0;
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n <= MAX_AMOUNT ? n : null;
}

export const isAmount = (n: unknown): n is number =>
  typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT;

/** «6 000 000 ₸» — from the shared module (Ф10 §4). */
export { formatMoney } from "../format";

/** Restaurant plan = price per seat × confirmed seats of «Келеді»; null while there is no price (`priceMissing`). */
export function restaurantPlanned(pricePerSeat: number | null, confirmedSeats: number): number | null {
  return pricePerSeat === null ? null : pricePerSeat * confirmedSeats;
}

export type BudgetItem = {
  id: string;
  category: ExpenseCategory;
  planned: number;
  paid: number;
  /** `YYYY-MM-DD` or null. */
  dueDate: string | null;
};

export type BudgetSummary = {
  planned: number;
  paid: number;
  /** total − paid (null without a total). */
  left: number | null;
  /** Σ planned − total when the plan exceeds the budget («Бюджеттен асты»), else 0; 0 without a total. */
  over: number;
  /** Per category with any plan or payment, largest plan first; `share` = plan ÷ largest plan (bar length 0…1). */
  categories: { category: ExpenseCategory; planned: number; paid: number; share: number; paidShare: number }[];
  /** Items with a date and something left to pay, earliest first; `overdue` = date before today. */
  upcoming: { id: string; dueDate: string; left: number; overdue: boolean }[];
};

/** Totals, categories and upcoming payments. `today` = `YYYY-MM-DD` in the event's time zone. */
export function budgetSummary(total: number | null, items: readonly BudgetItem[], today: string): BudgetSummary {
  let planned = 0;
  let paid = 0;
  const per = new Map<ExpenseCategory, { planned: number; paid: number }>();
  for (const it of items) {
    planned += it.planned;
    paid += it.paid;
    const c = per.get(it.category) ?? { planned: 0, paid: 0 };
    c.planned += it.planned;
    c.paid += it.paid;
    per.set(it.category, c);
  }
  const rows = [...per.entries()]
    .filter(([, c]) => c.planned > 0 || c.paid > 0)
    .sort(([a, x], [b, y]) => y.planned - x.planned || EXPENSE_CATEGORIES.indexOf(a) - EXPENSE_CATEGORIES.indexOf(b));
  const top = Math.max(1, ...rows.map(([, c]) => Math.max(c.planned, c.paid)));
  return {
    planned,
    paid,
    left: total === null ? null : total - paid,
    over: total === null ? 0 : Math.max(0, planned - total),
    categories: rows.map(([category, c]) => ({
      category,
      planned: c.planned,
      paid: c.paid,
      share: c.planned / top,
      paidShare: Math.min(c.paid, Math.max(c.planned, c.paid)) / top,
    })),
    upcoming: items
      .filter((it) => it.dueDate !== null && it.paid < it.planned)
      .map((it) => ({ id: it.id, dueDate: it.dueDate!, left: it.planned - it.paid, overdue: it.dueDate! < today }))
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id < b.id ? -1 : 1)),
  };
}

/** `YYYY-MM-DD` of a moment in a time zone (the event's «today» for «Мерзімі өтті») — the shared module. */
export function dayIn(tz: string, at: Date): string {
  return dayKey(at, tz);
}
