import { and, desc, eq, isNull } from "drizzle-orm";
import { isKzMobile, maskPhone, normalizePhone } from "@/domain/guests/phone";
import { translator } from "@/i18n/messages";
import { hmacHex, otpCode, safeEqualHex, sha256Hex } from "../crypto";
import type { Db } from "../db";
import { env } from "../env";
import { hit, type Limit } from "../ratelimit";
import { allowedOwners, eventMembers, events, otpChallenges, smsLog } from "../schema";
import { createSmsProvider, type SmsStatus } from "../sms";
import { createSession, upsertUser } from "./session";

/** Plan 6.1 / 9. */
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_MS = 10 * 60 * 1000;
export const RESEND_AFTER_SEC = 60;

const phoneKey = (phone: string) => sha256Hex(`phone:${phone}`).slice(0, 32);
const ipKey = (ip: string | null) => sha256Hex(`ip:${ip ?? "unknown"}`).slice(0, 32);

export function phoneLimits(phone: string): Limit[] {
  const k = phoneKey(phone);
  return [
    { key: `otp:phone:60s:${k}`, windowSec: 60, max: 1 },
    { key: `otp:phone:1h:${k}`, windowSec: 3600, max: 5 },
    { key: `otp:phone:1d:${k}`, windowSec: 86_400, max: 10 },
  ];
}
export const ipLimit = (ip: string | null): Limit => ({ key: `otp:ip:1h:${ipKey(ip)}`, windowSec: 3600, max: 20 });
export const globalLimit = (max: number): Limit => ({ key: "sms:global:1d", windowSec: 86_400, max });

/** Known number: a member of a live event or an allowed owner (plan 6.1 flow 2). */
export async function isKnownPhone(db: Db, phone: string): Promise<boolean> {
  const [m] = await db
    .select({ id: eventMembers.id })
    .from(eventMembers)
    .innerJoin(events, eq(events.id, eventMembers.eventId))
    .where(and(eq(eventMembers.phone, phone), isNull(eventMembers.removedAt), isNull(events.deletedAt)))
    .limit(1);
  if (m) return true;
  const [o] = await db.select({ phone: allowedOwners.phone }).from(allowedOwners).where(eq(allowedOwners.phone, phone));
  return Boolean(o);
}

export type RequestOtpResult =
  | {
      ok: true;
      challengeId: string;
      retryAfterSec: number;
      /** Only with SMS_PROVIDER=console (local/preview): the code is shown on screen (plan 3.6). */
      devCode?: string;
    }
  | { ok: false; error: "phoneIncomplete" | "phoneNotMobile" }
  | { ok: false; error: "tooSoon" | "tooMany" | "locked"; retryAfterSec: number }
  | { ok: false; error: "sendFailed" };

/**
 * `requestOtp`: the same answer for known and unknown numbers; an SMS goes only to known numbers.
 * Limits: 1/60 s, 5/h, 10/day per number; 20/h per IP; global daily SMS limit.
 */
export async function requestOtp(
  db: Db,
  input: { phone: string; ip: string | null; locale: "kk" | "ru"; now: Date; useFallback?: boolean },
): Promise<RequestOtpResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) return { ok: false, error: "phoneIncomplete" };
  if (!isKzMobile(phone)) return { ok: false, error: "phoneNotMobile" };

  // After 5 wrong codes: no new code for 10 minutes (plan 9).
  const [last] = await db
    .select({ createdAt: otpChallenges.createdAt, attempts: otpChallenges.attempts })
    .from(otpChallenges)
    .where(eq(otpChallenges.phone, phone))
    .orderBy(desc(otpChallenges.createdAt))
    .limit(1);
  if (last && last.attempts >= OTP_MAX_ATTEMPTS && input.now.getTime() - last.createdAt.getTime() < OTP_LOCK_MS) {
    const retryAfterSec = Math.ceil((last.createdAt.getTime() + OTP_LOCK_MS - input.now.getTime()) / 1000);
    return { ok: false, error: "locked", retryAfterSec };
  }

  const ipRes = await hit(db, ipLimit(input.ip), input.now);
  if (!ipRes.ok) return { ok: false, error: "tooMany", retryAfterSec: ipRes.retryAfterSec };
  const [perMinute, ...longer] = phoneLimits(phone);
  const first = await hit(db, perMinute!, input.now);
  if (!first.ok) return { ok: false, error: "tooSoon", retryAfterSec: first.retryAfterSec };
  for (const l of longer) {
    const r = await hit(db, l, input.now);
    if (!r.ok) return { ok: false, error: "tooMany", retryAfterSec: r.retryAfterSec };
  }

  const e = env();
  const code = otpCode();
  const known = await isKnownPhone(db, phone);
  const providerName = input.useFallback && e.SMS_FALLBACK_PROVIDER ? e.SMS_FALLBACK_PROVIDER : e.SMS_PROVIDER;

  let provider = "none";
  let providerMsgId: string | null = null;
  if (known) {
    const global = await hit(db, globalLimit(e.SMS_DAILY_LIMIT), input.now);
    const sms = createSmsProvider(providerName, e);
    if (!global.ok) {
      // Ceiling reached: no SMS, same answer; the person still has «ask the owner for a link».
      console.warn("[otp] SMS_DAILY_LIMIT reached — SMS not sent");
    } else if (!sms) {
      console.error(`[otp] SMS provider "${providerName}" is not configured`);
      return { ok: false, error: "sendFailed" };
    } else {
      const text = translator(input.locale)("sms.otp", { code, domain: e.APP_DOMAIN });
      try {
        const sent = await sms.send(phone, text);
        provider = sms.name;
        providerMsgId = sent.providerMsgId;
        await db.insert(smsLog).values({
          phoneHash: sha256Hex(phone),
          phoneMasked: maskPhone(phone),
          provider: sms.name,
          providerMsgId: sent.providerMsgId,
          status: sent.status,
          costTiyn: sent.cost === null ? null : Math.round(sent.cost * 100),
          createdAt: input.now,
        });
      } catch (err) {
        await db.insert(smsLog).values({
          phoneHash: sha256Hex(phone),
          phoneMasked: maskPhone(phone),
          provider: sms.name,
          providerMsgId: null,
          status: "failed",
          createdAt: input.now,
        });
        console.error(`[otp] send via ${sms.name} failed: ${(err as Error).message}`);
        return { ok: false, error: "sendFailed" };
      }
    }
  }

  const [challenge] = await db
    .insert(otpChallenges)
    .values({
      phone,
      codeHash: hmacHex(e.OTP_HMAC_SECRET, `${phone}|${code}`),
      createdAt: input.now,
      expiresAt: new Date(input.now.getTime() + OTP_TTL_MS),
      ip: input.ip,
      provider,
      providerMsgId,
    })
    .returning({ id: otpChallenges.id });

  return {
    ok: true,
    challengeId: challenge!.id,
    retryAfterSec: RESEND_AFTER_SEC,
    ...(known && provider === "console" ? { devCode: code } : {}),
  };
}

/**
 * `otpDeliveryStatus(challengeId)` — polled ~20 s after the request. The phone for
 * `SmsProvider.status(id, to)` comes from `otp_challenges`; `sms_log` keeps only mask + hash.
 * Unknown numbers answer "sent" like everyone else.
 */
export async function otpDeliveryStatus(
  db: Db,
  challengeId: string,
): Promise<{ status: "sent" | "delivered" | "failed" }> {
  if (!/^[0-9a-f-]{36}$/i.test(challengeId)) return { status: "sent" };
  const [c] = await db
    .select({ phone: otpChallenges.phone, provider: otpChallenges.provider, msgId: otpChallenges.providerMsgId })
    .from(otpChallenges)
    .where(eq(otpChallenges.id, challengeId));
  if (!c || c.provider === "none" || !c.msgId) return { status: "sent" };
  const sms = createSmsProvider(c.provider as "console" | "smsc" | "mobizon", env());
  if (!sms) return { status: "sent" };
  let s: SmsStatus;
  try {
    s = await sms.status(c.msgId, c.phone);
  } catch {
    return { status: "sent" };
  }
  await db.update(smsLog).set({ status: s }).where(eq(smsLog.providerMsgId, c.msgId));
  return { status: s === "delivered" ? "delivered" : s === "failed" ? "failed" : "sent" };
}

export type VerifyOtpResult =
  | { ok: true; sessionToken: string; expiresAt: Date; redirectTo: string; userId: string }
  | { ok: false; error: "incomplete" | "expired" }
  | { ok: false; error: "wrong"; left: number }
  | { ok: false; error: "locked"; minutes: number };

/** `verifyOtp`: 6 digits, HMAC compare, 5 minutes, 5 attempts. */
export async function verifyOtp(
  db: Db,
  input: { phone: string; code: string; userAgent: string | null; locale: "kk" | "ru"; now: Date },
): Promise<VerifyOtpResult> {
  const phone = normalizePhone(input.phone);
  if (!/^\d{6}$/.test(input.code) || !phone) return { ok: false, error: "incomplete" };
  const e = env();

  return db.transaction(async (tx): Promise<VerifyOtpResult> => {
    const [c] = await tx
      .select()
      .from(otpChallenges)
      .where(eq(otpChallenges.phone, phone))
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1)
      .for("update");
    if (!c || c.consumedAt || c.expiresAt <= input.now) return { ok: false, error: "expired" };
    if (c.attempts >= OTP_MAX_ATTEMPTS) {
      const minutes = Math.max(1, Math.ceil((c.createdAt.getTime() + OTP_LOCK_MS - input.now.getTime()) / 60_000));
      return { ok: false, error: "locked", minutes };
    }
    const good = safeEqualHex(c.codeHash, hmacHex(e.OTP_HMAC_SECRET, `${phone}|${input.code}`));
    if (!good) {
      const attempts = c.attempts + 1;
      await tx.update(otpChallenges).set({ attempts }).where(eq(otpChallenges.id, c.id));
      const left = OTP_MAX_ATTEMPTS - attempts;
      if (left <= 0) return { ok: false, error: "locked", minutes: Math.ceil(OTP_LOCK_MS / 60_000) };
      return { ok: false, error: "wrong", left };
    }
    await tx.update(otpChallenges).set({ consumedAt: input.now }).where(eq(otpChallenges.id, c.id));

    const user = await upsertUser(tx, { phone, locale: input.locale, now: input.now });
    const joined = await tx
      .update(eventMembers)
      .set({ userId: user.id, joinedAt: input.now })
      .where(and(eq(eventMembers.phone, phone), isNull(eventMembers.removedAt), isNull(eventMembers.joinedAt)))
      .returning({ eventId: eventMembers.eventId });
    await tx
      .update(eventMembers)
      .set({ userId: user.id })
      .where(and(eq(eventMembers.phone, phone), isNull(eventMembers.removedAt)));
    const session = await createSession(tx, {
      userId: user.id,
      method: "sms",
      userAgent: input.userAgent,
      now: input.now,
    });
    const redirectTo = joined.length === 1 ? `/e/${joined[0]!.eventId}` : "/e";
    return { ok: true, sessionToken: session.token, expiresAt: session.expiresAt, redirectTo, userId: user.id };
  });
}
