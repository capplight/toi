"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "../auth/access";
import { requireUser } from "../authz";
import { db } from "../db";
import * as svc from "../tableQueue/service";

/** Ф8 actions: table-number queue and the owner's «Үстел нөмірін көрсету» switch. */
type AccessError = { ok: false; error: "forbidden" | "invalid" };

async function guarded<T>(fn: (user: Awaited<ReturnType<typeof requireUser>>) => Promise<T>): Promise<T | AccessError> {
  try {
    return await fn(await requireUser());
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) return { ok: false, error: "forbidden" };
    throw e;
  }
}

export async function markTableSentAction(input: { familyId: string }) {
  const p = z.object({ familyId: z.uuid() }).safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  return guarded((u) => svc.markTableSent(db(), u, p.data.familyId));
}

export async function restartTableQueueAction(input: { eventId: string }) {
  const p = z.object({ eventId: z.uuid() }).safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  const r = await guarded((u) => svc.restartTableQueue(db(), u, p.data.eventId));
  revalidatePath(`/e/${p.data.eventId}/table-queue`);
  return r;
}

export async function setShowTableNumbersAction(input: { eventId: string; on: boolean }) {
  const p = z.object({ eventId: z.uuid(), on: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false as const, error: "invalid" as const };
  const r = await guarded((u) => svc.setShowTableNumbers(db(), u, p.data.eventId, p.data.on));
  revalidatePath(`/e/${p.data.eventId}/settings`);
  return r;
}
