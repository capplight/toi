"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "../auth/access";
import { requireUser } from "../authz";
import { db } from "../db";
import * as svc from "../guests/service";

/**
 * Server Actions of the guest screens (plan 6.3). Thin wrappers: session (`requireUser`) → zod →
 * service (which authorizes the event / family: `authorize(… 'member')`) → revalidate the event frame.
 * Access errors come back as `{ ok: false, error: "forbidden" }` (the client shows `errors.*`), never as data.
 */

const uuid = z.uuid();
const name = z.string().max(200);
const phone = z.string().max(40).nullable().optional();
const seats = z.number().int().min(-1000).max(1000);

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

function refresh(eventId: string) {
  revalidatePath(`/e/${eventId}`, "layout");
}

const addInput = z.object({
  eventId: uuid,
  name,
  phone,
  categoryId: uuid,
  seats,
  confirmNotDuplicateOf: z.array(uuid).max(20).optional(),
});

export async function addFamilyAction(input: z.input<typeof addInput>) {
  const p = addInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.addFamily(db(), user, p.data);
    if (r.ok) refresh(p.data.eventId);
    // The row has the token and timestamps — return only what the client needs.
    return r.ok ? { ok: true as const, familyId: r.family.id, tableNo: r.tableNo } : r;
  });
}

const updateInput = z.object({
  familyId: uuid,
  version: z.number().int().min(0),
  name,
  phone,
  categoryId: uuid,
  seats,
});

export async function updateFamilyAction(input: z.input<typeof updateInput>) {
  const p = updateInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.updateFamily(db(), user, p.data);
    if (r.ok) refresh(r.family.eventId);
    return r.ok ? { ok: true as const, familyId: r.family.id } : r;
  });
}

const familyInput = z.object({ familyId: uuid });

export async function deleteFamilyAction(input: z.input<typeof familyInput>) {
  const p = familyInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.deleteFamily(db(), user, p.data.familyId);
    refresh(r.eventId);
    return { ok: true as const };
  });
}

export async function restoreFamilyAction(input: z.input<typeof familyInput>) {
  const p = familyInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.restoreFamily(db(), user, p.data.familyId);
    refresh(r.eventId);
    return r.ok ? { ok: true as const, tableNo: r.tableNo } : { ok: false as const, conflict: r.conflict };
  });
}

const sendInput = z.object({ familyId: uuid, kind: z.enum(["invite", "reminder"]) });

export async function markSentAction(input: z.input<typeof sendInput>) {
  const p = sendInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.markSent(db(), user, p.data.familyId, p.data.kind);
    if (r.family) refresh(r.family.eventId);
    return { ok: r.ok };
  });
}

export async function waClickedAction(input: z.input<typeof sendInput>) {
  const p = sendInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    await svc.waClicked(db(), user, p.data.familyId, p.data.kind);
    return { ok: true as const };
  });
}

const answerInput = z.object({ familyId: uuid, attending: z.boolean(), seats: seats.optional() });

export async function recordAnswerAction(input: z.input<typeof answerInput>) {
  const p = answerInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.recordAnswerByMember(db(), user, p.data);
    if (!r.ok) return r;
    refresh(r.family.eventId);
    return { ok: true as const, previous: r.previous };
  });
}

const revertInput = z.object({
  familyId: uuid,
  previous: z.object({ rsvp: z.enum(["pending", "yes", "no"]), confirmed: z.number().int().nullable() }),
});

/** «Қайтару» after an answer recorded by phone. */
export async function revertAnswerAction(input: z.input<typeof revertInput>) {
  const p = revertInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.revertAnswer(db(), user, p.data);
    refresh(r.eventId);
    return { ok: true as const };
  });
}

const categoryInput = z.object({
  eventId: uuid,
  labelKk: z.string().max(200),
  labelRu: z.string().max(200).nullable().optional(),
  afterCategoryId: uuid.nullable(),
});

export async function createCategoryAction(input: z.input<typeof categoryInput>) {
  const p = categoryInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.createCategory(db(), user, p.data);
    if (r.ok) refresh(p.data.eventId);
    return r.ok ? { ok: true as const, categoryId: r.category.id, label: r.category.labelKk } : r;
  });
}

const pairInput = z.object({ eventId: uuid, familyA: uuid, familyB: uuid });

/** «Екеуі де қалсын» (also used by the hall duplicates sheet in Ф7b). */
export async function keepBothDuplicatesAction(input: z.input<typeof pairInput>) {
  const p = pairInput.safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded(async (user) => {
    const r = await svc.keepBothDuplicates(db(), user, p.data);
    refresh(p.data.eventId);
    return r;
  });
}
