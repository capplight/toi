"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { db } from "../db";
import { consumeLink, inspectLink, issueMemberLink, LinkLimitError } from "../auth/loginLinks";
import { otpDeliveryStatus, requestOtp, verifyOtp, type RequestOtpResult, type VerifyOtpResult } from "../auth/otp";
import {
  revokeMemberEventAccess,
  revokeSessionByToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  validateSession,
} from "../auth/session";
import { authorize, ForbiddenError } from "../auth/access";
import { requireUser } from "../authz";
import { eventMembers } from "../schema";
import { eq } from "drizzle-orm";

async function requestContext() {
  const h = await headers();
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const ip = (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim() || null;
  return {
    store,
    ip: ip && /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null,
    userAgent: h.get("user-agent"),
    locale: isLocale(fromCookie) ? fromCookie : ("kk" as const),
  };
}

const tokenSchema = z.string().regex(/^[0-9A-Za-z]{22}$/);

/**
 * «Кіру» on /join/{token} (POST). GET never reaches this.
 * Ф3 `#switch`: if this device is signed in as ANOTHER person, the POST is accepted only after «Иә, мен кіремін»
 * (`switch=1`); then the previous person's session on this device is closed («Ол бұл телефоннан шығады»).
 */
export async function consumeLoginLinkAction(formData: FormData): Promise<void> {
  const parsed = tokenSchema.safeParse(formData.get("token"));
  const token = parsed.success ? parsed.data : "invalid";
  const ctx = await requestContext();
  const current = ctx.store.get(SESSION_COOKIE)?.value;
  const view = await inspectLink(db(), token, new Date());
  const signedIn = current ? await validateSession(db(), current, new Date()) : null;
  const other = Boolean(signedIn && view.status === "valid" && signedIn.phone !== view.phone);
  if (other && formData.get("switch") !== "1") redirect(`/join/${encodeURIComponent(token)}`);
  const r = await consumeLink(db(), {
    token,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    locale: ctx.locale,
    now: new Date(),
    currentSessionToken: ctx.store.get(SESSION_COOKIE)?.value,
  });
  if (!r.ok) redirect(`/join/${encodeURIComponent(token)}${r.reason === "tooManyAttempts" ? "?limit=1" : ""}`);
  if (other && current) await revokeSessionByToken(db(), current, new Date());
  ctx.store.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions(r.expiresAt));
  redirect(r.redirectTo);
}

const phoneInput = z.object({ phone: z.string().max(40), fallback: z.boolean().optional() });

export async function requestOtpAction(input: { phone: string; fallback?: boolean }): Promise<RequestOtpResult> {
  const parsed = phoneInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "phoneIncomplete" };
  const ctx = await requestContext();
  return requestOtp(db(), {
    phone: parsed.data.phone,
    ip: ctx.ip,
    locale: ctx.locale,
    now: new Date(),
    useFallback: parsed.data.fallback,
  });
}

export async function otpStatusAction(challengeId: string): Promise<{ status: "sent" | "delivered" | "failed" }> {
  const parsed = z.string().uuid().safeParse(challengeId);
  if (!parsed.success) return { status: "sent" };
  return otpDeliveryStatus(db(), parsed.data);
}

const verifyInput = z.object({ phone: z.string().max(40), code: z.string().max(12) });

/** On success sets the cookie and returns where to go (the client navigates). */
export async function verifyOtpAction(input: {
  phone: string;
  code: string;
}): Promise<Exclude<VerifyOtpResult, { ok: true }> | { ok: true; redirectTo: string }> {
  const parsed = verifyInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "incomplete" };
  const ctx = await requestContext();
  const r = await verifyOtp(db(), {
    phone: parsed.data.phone,
    code: parsed.data.code.replace(/\D/g, ""),
    userAgent: ctx.userAgent,
    locale: ctx.locale,
    now: new Date(),
  });
  if (!r.ok) return r;
  ctx.store.set(SESSION_COOKIE, r.sessionToken, sessionCookieOptions(r.expiresAt));
  return { ok: true, redirectTo: r.redirectTo };
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await revokeSessionByToken(db(), token, new Date());
  store.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Owner: new login link for a member (plan 6.1 `issueLoginLink`). */
export async function issueLoginLinkAction(
  memberId: string,
): Promise<
  { ok: true; url: string; waUrl: string; expiresAt: string } | { ok: false; error: "forbidden" | "rateLimited" }
> {
  const id = z.string().uuid().parse(memberId);
  const user = await requireUser();
  const [m] = await db().select({ eventId: eventMembers.eventId }).from(eventMembers).where(eq(eventMembers.id, id));
  try {
    if (!m) throw new ForbiddenError();
    await authorize(db(), user, m.eventId, "owner");
    const link = await issueMemberLink(db(), { memberId: id, createdBy: user.userId, now: new Date() });
    return { ok: true, url: link.url, waUrl: link.waUrl, expiresAt: link.expiresAt.toISOString() };
  } catch (err) {
    if (err instanceof ForbiddenError) return { ok: false, error: "forbidden" };
    if (err instanceof LinkLimitError) return { ok: false, error: "rateLimited" };
    throw err;
  }
}

/**
 * Owner: «Шығару» (plan 6.1 `revokeMemberSessions`, v1.5): removes only access to THIS event —
 * the person's 'all' (SMS) sessions are never touched by another event's owner.
 */
export async function revokeMemberSessionsAction(memberId: string): Promise<{ ok: boolean; revoked: number }> {
  const id = z.string().uuid().parse(memberId);
  const user = await requireUser();
  const [m] = await db()
    .select({ eventId: eventMembers.eventId, userId: eventMembers.userId })
    .from(eventMembers)
    .where(eq(eventMembers.id, id));
  if (!m) return { ok: false, revoked: 0 };
  await authorize(db(), user, m.eventId, "owner");
  if (!m.userId) return { ok: true, revoked: 0 };
  const r = await revokeMemberEventAccess(db(), { userId: m.userId, eventId: m.eventId, now: new Date() });
  return { ok: true, revoked: r.revoked };
}
