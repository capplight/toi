"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { EXPENSE_CATEGORIES, MAX_AMOUNT } from "@/domain/budget";
import { ForbiddenError, UnauthorizedError } from "../auth/access";
import { requireUser } from "../authz";
import * as svc from "../budget/service";
import { db } from "../db";

/**
 * Server Actions of «Шығындар» (Ф9, plan 6.7). Thin: session → zod → service (`authorize(…, "budget")`, Р9) →
 * revalidate the event frame (the «Қорытынды» card too). Access errors → `{ ok: false, error: "forbidden" }`.
 */

const uuid = z.uuid();
const amount = z.number().int().min(0).max(MAX_AMOUNT);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();
const item = {
  title: z.string().max(400),
  category: z.enum(EXPENSE_CATEGORIES),
  planned: amount,
  paid: amount,
  dueDate: date,
  note: z.string().max(2000).nullable(),
};

type AccessError = { ok: false; error: "forbidden" | "invalid" };

async function guarded<T>(fn: (user: Awaited<ReturnType<typeof requireUser>>) => Promise<T>): Promise<T | AccessError> {
  try {
    const user = await requireUser();
    return await fn(user);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) return { ok: false, error: "forbidden" };
    throw e;
  }
}

const refresh = (eventId: string) => revalidatePath(`/e/${eventId}`, "layout");
const invalid = { ok: false as const, error: "invalid" as const };

const totalInput = z.object({ eventId: uuid, total: amount.nullable() });
export async function setBudgetTotalAction(input: z.input<typeof totalInput>) {
  const p = totalInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.setBudgetTotal(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const priceInput = z.object({ eventId: uuid, price: amount.nullable() });
export async function setPricePerSeatAction(input: z.input<typeof priceInput>) {
  const p = priceInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.setPricePerSeat(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const createInput = z.object({ eventId: uuid, linked: z.boolean().optional(), ...item });
export async function createExpenseAction(input: z.input<typeof createInput>) {
  const p = createInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.createExpense(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const updateInput = z.object({ eventId: uuid, id: uuid, version: z.string().max(40), ...item });
export async function updateExpenseAction(input: z.input<typeof updateInput>) {
  const p = updateInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.updateExpense(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const deleteInput = z.object({ eventId: uuid, id: uuid });
export async function deleteExpenseAction(input: z.input<typeof deleteInput>) {
  const p = deleteInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.deleteExpense(db(), user, { id: p.data.id });
    refresh(r.eventId);
    return r;
  });
}

const restoreInput = z.object({
  id: uuid,
  eventId: uuid,
  linked: z.boolean(),
  ...item,
  category: z.string().max(20),
});
export async function restoreExpenseAction(input: z.input<typeof restoreInput>) {
  const p = restoreInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.restoreExpense(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}
