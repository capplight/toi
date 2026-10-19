"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { ForbiddenError, UnauthorizedError } from "../auth/access";
import { requireUser } from "../authz";
import { db } from "../db";
import * as svc from "../events/service";
import { attachDraftMusic, createUploadUrl, removeMusic } from "../media/music";
import { renderPreview, type PreviewDraft } from "../invite/preview";

/**
 * Server Actions of Ф3 (plan 6.2): session → zod → service (authz inside) → revalidate.
 * Access errors come back as `{ ok: false, error: "forbidden" }`.
 */

type AccessError = { ok: false; error: "forbidden" | "invalid" };
const invalid = { ok: false as const, error: "invalid" as const };

async function guarded<T>(fn: (user: Awaited<ReturnType<typeof requireUser>>) => Promise<T>): Promise<T | AccessError> {
  try {
    return await fn(await requireUser());
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError) return { ok: false, error: "forbidden" };
    throw e;
  }
}

async function locale() {
  const v = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : ("kk" as const);
}

const uuid = z.uuid();
const str = (max: number) => z.string().max(max);
const eventInput = z.object({
  kind: z.enum(svc.EVENT_KINDS),
  title: str(200),
  hostsLine: str(200).nullable().optional(),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startsAt: z.string().max(5).nullable().optional(),
  venueName: str(200).nullable().optional(),
  venueAddress: str(300).nullable().optional(),
  mapUrl: str(600).nullable().optional(),
  invitationTextKk: str(2000).nullable().optional(),
  invitationTextRu: str(2000).nullable().optional(),
  templateId: z.enum(svc.TEMPLATE_IDS),
});
const hallInput = z.object({
  columns: z.union([z.literal(2), z.literal(4)]),
  tables: z.number().int(),
  seatsPerTable: z.number().int(),
});

/** «Той ашу»: one call at the end of the wizard — the event, then the hall if it was set (brief Ф3 §2). */
export async function createEventAction(input: {
  event: z.input<typeof eventInput>;
  hall?: z.input<typeof hallInput> | null;
  musicAssetId?: string | null;
}) {
  const p = z
    .object({ event: eventInput, hall: hallInput.nullable().optional(), musicAssetId: uuid.nullable().optional() })
    .safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    if (p.data.hall && !svc.validateHallInput(p.data.hall)) return { ok: false as const, field: "hall" as const };
    const r = await svc.createEvent(db(), user, p.data.event, { locale: await locale() });
    if (!r.ok) return r;
    if (p.data.hall) await svc.setupHall(db(), user, { eventId: r.eventId, hall: p.data.hall });
    if (p.data.musicAssetId) await attachDraftMusic(db(), user, r.eventId, p.data.musicAssetId);
    revalidatePath("/e");
    return { ok: true as const, eventId: r.eventId };
  });
}

export async function updateEventAction(input: {
  eventId: string;
  version: number;
  patch: z.input<typeof eventInput>;
}) {
  const p = z.object({ eventId: uuid, version: z.number().int().min(0), patch: eventInput }).safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.updateEvent(db(), user, p.data);
    if (r.ok) revalidatePath(`/e/${p.data.eventId}`, "layout");
    return r;
  });
}

export async function setupHallAction(input: {
  eventId: string;
  hall: z.input<typeof hallInput>;
  seatingVersion?: number;
}) {
  const p = z.object({ eventId: uuid, hall: hallInput, seatingVersion: z.number().int().optional() }).safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.setupHall(db(), user, p.data);
    if (r.ok) revalidatePath(`/e/${p.data.eventId}`, "layout");
    return r;
  });
}

const memberInput = z.object({
  eventId: uuid,
  phone: str(40),
  who: z.enum(["father", "mother", "couple", "other"]),
  customLabel: str(60).nullable().optional(),
  name: str(80).nullable().optional(),
  canEditSeating: z.boolean().optional(),
  canManageBudget: z.boolean().optional(),
  defaultCategoryId: uuid.nullable().optional(),
});

/** «Қосу және сілтеме жіберу»: the member and the login link; the client goes to `waUrl` (location.assign). */
export async function addMemberAction(input: z.input<typeof memberInput>) {
  const p = memberInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.addMember(db(), user, p.data, { locale: await locale() });
    if (r.ok) revalidatePath(`/e/${p.data.eventId}`, "layout");
    return r;
  });
}

export async function updateMemberAction(input: {
  memberId: string;
  canEditSeating?: boolean;
  canManageBudget?: boolean;
  defaultCategoryId?: string | null;
  name?: string | null;
}) {
  const p = z
    .object({
      memberId: uuid,
      canEditSeating: z.boolean().optional(),
      canManageBudget: z.boolean().optional(),
      defaultCategoryId: uuid.nullable().optional(),
      name: str(80).nullable().optional(),
    })
    .safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.updateMember(db(), user, p.data);
    if (r.ok) revalidatePath(`/e/${r.eventId}`, "layout");
    return r;
  });
}

const memberId = z.object({ memberId: uuid });

export async function removeMemberAction(input: { memberId: string }) {
  const p = memberId.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.removeMember(db(), user, p.data.memberId);
    revalidatePath(`/e/${r.eventId}`, "layout");
    return r;
  });
}

export async function signOutMemberAction(input: { memberId: string }) {
  const p = memberId.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.signOutMember(db(), user, p.data.memberId);
    revalidatePath(`/e/${r.eventId}`, "layout");
    return { ok: true as const, revoked: r.revoked };
  });
}

export async function newMemberLinkAction(input: { memberId: string }) {
  const p = memberId.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await svc.newMemberLink(db(), user, p.data.memberId);
    revalidatePath(`/e/${r.eventId}`, "layout");
    return r.ok ? { ok: true as const, waUrl: r.waUrl } : { ok: false as const, error: r.error };
  });
}

export async function rotateDoorTokenAction(input: { eventId: string }) {
  const p = z.object({ eventId: uuid }).safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    await svc.rotateDoorToken(db(), user, p.data.eventId);
    revalidatePath(`/e/${p.data.eventId}`, "layout");
    return { ok: true as const };
  });
}

const uploadInput = z.object({ eventId: uuid.nullable(), mime: str(40), bytes: z.number().int() });

/** Music (Ф5): where the browser PUTs the file; then `POST /api/media/finalize` processes it. */
export async function createMusicUploadAction(input: z.input<typeof uploadInput>) {
  const p = uploadInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => createUploadUrl(db(), user, p.data));
}

export async function removeMusicAction(input: { eventId: string }) {
  const p = z.object({ eventId: uuid }).safeParse(input);
  if (!p.success) return invalid;
  return guarded(async (user) => {
    const r = await removeMusic(db(), user, p.data.eventId);
    revalidatePath(`/e/${p.data.eventId}`, "layout");
    return r;
  });
}

const previewInput = z.object({
  kind: z.enum(svc.EVENT_KINDS),
  title: str(200),
  hostsLine: str(200).nullable().optional(),
  startsOn: z.string().max(10),
  startsAt: z.string().max(5).nullable().optional(),
  venueName: str(200).nullable().optional(),
  venueAddress: str(300).nullable().optional(),
  textKk: str(2000).nullable().optional(),
  textRu: str(2000).nullable().optional(),
  templateId: z.enum(svc.TEMPLATE_IDS),
  locale: z.enum(["kk", "ru"]),
});

/** Real preview of the invitation (Ф5 §3.4): HTML of the same template by draft data, for `<iframe srcdoc sandbox>`. */
export async function previewInviteAction(input: PreviewDraft) {
  const p = previewInput.safeParse(input);
  if (!p.success) return invalid;
  return guarded(async () => ({ ok: true as const, html: renderPreview(p.data) }));
}
