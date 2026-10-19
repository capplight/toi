"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "../auth/access";
import { requireUser } from "../authz";
import { db } from "../db";
import * as svc from "../seating/hall";

/**
 * Server Actions of «Зал» (plan 6.5, brief Ф7b §2). Thin: session → zod → service (which authorizes the event with
 * the seating right and runs `withSeating`) → revalidate the event frame. Access errors come back as
 * `{ ok: false, error: "forbidden" }` («Тек тізім» → 403 in the service).
 */

const uuid = z.uuid();
const version = z.number().int().min(0);

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

const moveInput = z.object({
  eventId: uuid,
  familyId: uuid,
  toTableNo: z.number().int().min(1).max(60),
  force: z.boolean(),
  familyVersion: version,
  reason: z.literal("suggested").optional(),
});

export async function moveFamilyAction(input: z.input<typeof moveInput>) {
  const p = moveInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.moveFamily(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const familyInput = z.object({ eventId: uuid, familyId: uuid });

export async function unlockFamilyAction(input: z.input<typeof familyInput>) {
  const p = familyInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.unlockFamily(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const orderInput = z.object({
  eventId: uuid,
  order: z.array(uuid).min(1).max(60),
  seatingVersion: version,
  movedCategoryId: uuid.optional(),
});

export async function reorderCategoriesAction(input: z.input<typeof orderInput>) {
  const p = orderInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.reorderCategories(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const eventInput = z.object({ eventId: uuid });

export async function previewFullReseatAction(input: z.input<typeof eventInput>) {
  const p = eventInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => ({ ok: true as const, preview: await svc.previewFullReseat(db(), user, p.data) }));
}

const applyInput = z.object({ eventId: uuid, seatingVersion: version });

export async function applyFullReseatAction(input: z.input<typeof applyInput>) {
  const p = applyInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.applyFullReseat(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

export async function seatUnplacedAction(input: z.input<typeof eventInput>) {
  const p = eventInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.seatUnplaced(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}

const undoInput = z.object({ eventId: uuid, changeId: z.number().int().positive() });

export async function undoSeatingChangeAction(input: z.input<typeof undoInput>) {
  const p = undoInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.undoSeatingChange(db(), user, { changeId: p.data.changeId });
    refresh(p.data.eventId);
    return r;
  });
}
