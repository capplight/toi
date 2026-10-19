import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  type BudgetSummary,
  budgetSummary,
  dayIn,
  type ExpenseCategory,
  isAmount,
  isCategory,
  NOTE_MAX,
  restaurantPlanned,
  TITLE_MAX,
} from "@/domain/budget";
import { authorize, ForbiddenError, type Principal } from "../auth/access";
import type { Db } from "../db";
import { eventMembers, events, expenses, families } from "../schema";

/**
 * «Шығындар» (Ф9, plan 6.7, decision Р9). Every function: `authorize(…, "budget")` (owner or `can_manage_budget`)
 * → validation → write. The restaurant item (`linked_to_seats`, category `restaurant`, at most one per event) has no
 * stored plan: it is `price_per_seat × Σ confirmed` at read time. Concurrent edits: optimistic by `updated_at` (409).
 */

export type ExpenseRow = typeof expenses.$inferSelect;
export type ExpenseField = "titleRequired" | "titleTooLong" | "amount" | "category" | "date" | "noteTooLong";

export type ExpenseInput = {
  title: string;
  category: string;
  planned: number;
  paid: number;
  dueDate: string | null;
  note: string | null;
};

export type ExpenseView = {
  id: string;
  title: string;
  category: ExpenseCategory;
  planned: number;
  paid: number;
  dueDate: string | null;
  note: string | null;
  linked: boolean;
  /** Optimistic lock: the `updated_at` the client saw (ISO, ms). */
  version: string;
  changedBy: string | null;
  changedAt: string;
};

export type BudgetView = {
  eventId: string;
  total: number | null;
  pricePerSeat: number | null;
  /** Σ confirmed seats of «Келеді». */
  confirmedSeats: number;
  restaurant: { itemId: string | null; planned: number | null };
  items: ExpenseView[];
  summary: BudgetSummary;
  today: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function validateExpense(
  input: ExpenseInput,
): { ok: true; value: ExpenseInput & { category: ExpenseCategory } } | { ok: false; field: ExpenseField } {
  const title = input.title.trim();
  if (!title) return { ok: false, field: "titleRequired" };
  if (title.length > TITLE_MAX) return { ok: false, field: "titleTooLong" };
  if (!isCategory(input.category)) return { ok: false, field: "category" };
  if (!isAmount(input.planned) || !isAmount(input.paid)) return { ok: false, field: "amount" };
  if (input.dueDate !== null && !validDate(input.dueDate)) return { ok: false, field: "date" };
  const note = input.note?.trim() || null;
  if (note && note.length > NOTE_MAX) return { ok: false, field: "noteTooLong" };
  return { ok: true, value: { ...input, title, note, category: input.category } };
}

/** Σ confirmed seats of families that answered «Келеді» (the restaurant formula). */
async function confirmedSeats(db: Db, eventId: string): Promise<number> {
  const [r] = (await db
    .select({ n: sql<string>`coalesce(sum(${families.confirmedCount}), 0)` })
    .from(families)
    .where(and(eq(families.eventId, eventId), eq(families.rsvp, "yes"), isNull(families.deletedAt)))) as {
    n: string;
  }[];
  return Number(r?.n ?? 0);
}

const iso = (d: Date) => d.toISOString();

export async function budgetView(db: Db, who: Principal, eventId: string, now = new Date()): Promise<BudgetView> {
  await authorize(db, who, eventId, "budget");
  const [ev] = await db
    .select({ total: events.budgetTotal, price: events.pricePerSeat, tz: events.tz })
    .from(events)
    .where(eq(events.id, eventId));
  if (!ev) throw new ForbiddenError();
  const rows = await db
    .select()
    .from(expenses)
    .where(eq(expenses.eventId, eventId))
    .orderBy(asc(expenses.createdAt), asc(expenses.id));
  const members = await db
    .select({ id: eventMembers.id, label: eventMembers.label })
    .from(eventMembers)
    .where(eq(eventMembers.eventId, eventId));
  const label = new Map(members.map((m) => [m.id, m.label]));
  const seats = await confirmedSeats(db, eventId);
  const restaurant = restaurantPlanned(ev.price, seats);
  const items: ExpenseView[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category as ExpenseCategory,
    planned: r.linkedToSeats ? (restaurant ?? 0) : r.plannedAmount,
    paid: r.paidAmount,
    dueDate: r.dueDate,
    note: r.note,
    linked: r.linkedToSeats,
    version: iso(r.updatedAt),
    changedBy: label.get(r.updatedBy ?? r.createdBy) ?? null,
    changedAt: iso(r.updatedAt),
  }));
  const today = dayIn(ev.tz, now);
  return {
    eventId,
    total: ev.total,
    pricePerSeat: ev.price,
    confirmedSeats: seats,
    restaurant: { itemId: rows.find((r) => r.linkedToSeats)?.id ?? null, planned: restaurant },
    items,
    summary: budgetSummary(ev.total, items, today),
    today,
  };
}

/** «Қорытынды» card `summary.budgetLink`: paid / (total or Σ planned). Null without the right. */
export async function budgetTotals(db: Db, who: Principal, eventId: string) {
  try {
    const v = await budgetView(db, who, eventId);
    return { paid: v.summary.paid, total: v.total ?? v.summary.planned };
  } catch (e) {
    if (e instanceof ForbiddenError) return null;
    throw e;
  }
}

/* ------------------------------------------------------------------ event settings */

export async function setBudgetTotal(db: Db, who: Principal, input: { eventId: string; total: number | null }) {
  await authorize(db, who, input.eventId, "budget");
  if (input.total !== null && !isAmount(input.total)) return { ok: false as const, field: "amount" as const };
  await db.update(events).set({ budgetTotal: input.total, updatedAt: new Date() }).where(eq(events.id, input.eventId));
  return { ok: true as const };
}

export async function setPricePerSeat(db: Db, who: Principal, input: { eventId: string; price: number | null }) {
  await authorize(db, who, input.eventId, "budget");
  if (input.price !== null && !isAmount(input.price)) return { ok: false as const, field: "amount" as const };
  await db.update(events).set({ pricePerSeat: input.price, updatedAt: new Date() }).where(eq(events.id, input.eventId));
  return { ok: true as const };
}

/* ------------------------------------------------------------------ expenses */

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; field: ExpenseField }
  | { ok: false; conflict: "restaurantExists" }
  | { ok: false; conflict: "version"; current: ExpenseView | null };

/**
 * New item. `linked` = the restaurant item (category `restaurant`, plan from the seats): only one per event — checked
 * under the event row lock (`for update`), so two parallel creations cannot both pass.
 */
export async function createExpense(
  db: Db,
  who: Principal,
  input: ExpenseInput & { eventId: string; linked?: boolean; id?: string },
): Promise<SaveResult> {
  const m = await authorize(db, who, input.eventId, "budget");
  const v = validateExpense(input);
  if (!v.ok) return v;
  const linked = Boolean(input.linked);
  if (linked && v.value.category !== "restaurant") return { ok: false, field: "category" };
  return db.transaction(async (tx) => {
    await tx.select({ id: events.id }).from(events).where(eq(events.id, input.eventId)).for("update");
    if (linked) {
      const [other] = await tx
        .select({ id: expenses.id })
        .from(expenses)
        .where(and(eq(expenses.eventId, input.eventId), eq(expenses.linkedToSeats, true)));
      if (other) return { ok: false as const, conflict: "restaurantExists" as const };
    }
    const now = new Date();
    if (input.id) {
      const [taken] = await tx.select({ id: expenses.id }).from(expenses).where(eq(expenses.id, input.id));
      if (taken) input = { ...input, id: undefined };
    }
    const [row] = await tx
      .insert(expenses)
      .values({
        ...(input.id ? { id: input.id } : {}),
        eventId: input.eventId,
        category: v.value.category,
        title: v.value.title,
        plannedAmount: linked ? 0 : v.value.planned,
        paidAmount: v.value.paid,
        dueDate: v.value.dueDate,
        note: v.value.note,
        linkedToSeats: linked,
        createdBy: m.memberId,
        updatedBy: m.memberId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: expenses.id });
    return { ok: true as const, id: row!.id };
  });
}

async function expenseEvent(db: Db, id: string): Promise<ExpenseRow> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ForbiddenError();
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new ForbiddenError();
  return row;
}

async function viewOf(db: Db, who: Principal, eventId: string, id: string): Promise<ExpenseView | null> {
  return (await budgetView(db, who, eventId)).items.find((i) => i.id === id) ?? null;
}

/**
 * Edit with optimistic locking: `version` = the `updated_at` the client saw. Somebody saved in between → 409 with the
 * fresh item (nothing is overwritten). The restaurant item keeps its category and its computed plan.
 */
export async function updateExpense(
  db: Db,
  who: Principal,
  input: ExpenseInput & { id: string; version: string },
): Promise<SaveResult> {
  const cur = await expenseEvent(db, input.id);
  const m = await authorize(db, who, cur.eventId, "budget");
  const v = validateExpense(cur.linkedToSeats ? { ...input, category: "restaurant", planned: 0 } : input);
  if (!v.ok) return v;
  const seen = new Date(input.version);
  if (Number.isNaN(seen.getTime()))
    return { ok: false, conflict: "version", current: await viewOf(db, who, cur.eventId, cur.id) };
  const [row] = await db
    .update(expenses)
    .set({
      title: v.value.title,
      category: v.value.category,
      plannedAmount: cur.linkedToSeats ? 0 : v.value.planned,
      paidAmount: v.value.paid,
      dueDate: v.value.dueDate,
      note: v.value.note,
      updatedBy: m.memberId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(expenses.id, cur.id),
        sql`date_trunc('milliseconds', ${expenses.updatedAt}) = ${seen.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: expenses.id });
  if (!row) return { ok: false, conflict: "version", current: await viewOf(db, who, cur.eventId, cur.id) };
  return { ok: true, id: row.id };
}

/** What «Қайтару» needs to put a deleted item back (validated again on restore). */
export type ExpenseSnapshot = ExpenseInput & { id: string; eventId: string; linked: boolean };

/** Real delete; returns the snapshot for the toast «Өшірілді: …» + «Қайтару» (8 s). */
export async function deleteExpense(db: Db, who: Principal, input: { id: string }) {
  const cur = await expenseEvent(db, input.id);
  await authorize(db, who, cur.eventId, "budget");
  await db.delete(expenses).where(eq(expenses.id, cur.id));
  const snapshot: ExpenseSnapshot = {
    id: cur.id,
    eventId: cur.eventId,
    title: cur.title,
    category: cur.category,
    planned: cur.plannedAmount,
    paid: cur.paidAmount,
    dueDate: cur.dueDate,
    note: cur.note,
    linked: cur.linkedToSeats,
  };
  return { ok: true as const, eventId: cur.eventId, snapshot };
}

/** «Қайтару» after a delete: the same checks as a new item; the same id when it is still free. */
export async function restoreExpense(db: Db, who: Principal, snapshot: ExpenseSnapshot): Promise<SaveResult> {
  return createExpense(db, who, { ...snapshot, linked: snapshot.linked, id: snapshot.id });
}
