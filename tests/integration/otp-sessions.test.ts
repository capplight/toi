import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { globalLimit, otpDeliveryStatus, requestOtp, verifyOtp } from "@/server/auth/otp";
import { createSession, revokeSessionByToken, revokeUserSessions, validateSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { eventMembers, otpChallenges, rateLimits, sessions, smsLog, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { addMs, DAY, HOUR, MIN, resetDb } from "./helpers";

const T0 = new Date("2026-10-10T08:00:00Z");
const KNOWN = "8 700 000 00 02"; // Анасы (demo), any input format
const UNKNOWN = "+7 701 555 00 00";

beforeEach(async () => {
  await resetDb();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const req = (phone: string, now: Date, ip = "10.1.1.1") => requestOtp(db(), { phone, ip, locale: "kk", now });

describe("requestOtp (plan 6.1 flow 2, Н4)", () => {
  it("known and unknown numbers get the same answer; only the known one gets an SMS", async () => {
    await seedSample(db(), T0);
    const a = await req(KNOWN, T0);
    const b = await req(UNKNOWN, T0);
    expect(a).toMatchObject({ ok: true, retryAfterSec: 60 });
    expect(b).toMatchObject({ ok: true, retryAfterSec: 60 });
    if (!a.ok || !b.ok) throw new Error();
    expect(Object.keys(b).sort()).toEqual(["challengeId", "ok", "retryAfterSec"]);
    expect(a.devCode).toMatch(/^\d{6}$/); // console provider only
    const log = await db().select().from(smsLog);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ phoneMasked: "+7 700 *** ** 02", provider: "console", status: "delivered" });
    expect(JSON.stringify(log)).not.toContain("77000000002");
  });

  it("the SMS text is sms.otp in the interface language with APP_DOMAIN", async () => {
    await seedSample(db(), T0);
    const spy = vi.spyOn(console, "info");
    const r = await requestOtp(db(), { phone: KNOWN, ip: null, locale: "ru", now: T0 });
    if (!r.ok) throw new Error();
    const printed = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(printed).toContain(`Той: код ${r.devCode}. Никому не говорите.\n@toi-pilot.vercel.app #${r.devCode}`);
    expect(printed).not.toContain("77000000002");
  });

  it("rejects incomplete and non-mobile numbers (only +7 7XX)", async () => {
    expect(await req("701 12", T0)).toEqual({ ok: false, error: "phoneIncomplete" });
    expect(await req("+7 905 123 45 67", T0)).toEqual({ ok: false, error: "phoneNotMobile" });
  });

  it("per number: 1 per 60 s, 5 per hour, 10 per day — same for unknown numbers", async () => {
    for (const phone of [UNKNOWN]) {
      expect((await req(phone, T0)).ok).toBe(true);
      expect(await req(phone, addMs(T0, 10_000))).toMatchObject({ ok: false, error: "tooSoon" });
      for (let i = 1; i < 5; i++) expect((await req(phone, addMs(T0, i * 61_000))).ok).toBe(true);
      expect(await req(phone, addMs(T0, 6 * 61_000))).toMatchObject({ ok: false, error: "tooMany" });
    }
    // day limit: 10 across hours
    let ok = 0;
    for (let h = 1; h <= 4; h++)
      for (let i = 0; i < 5; i++) if ((await req(UNKNOWN, addMs(T0, h * HOUR + i * 61_000))).ok) ok++;
    expect(ok).toBe(5); // 5 already used in hour 0, 10 per day in total
  });

  it("per IP: 20 per hour", async () => {
    for (let i = 0; i < 20; i++)
      expect((await req(`+7701000${String(i).padStart(4, "0")}`, T0, "9.9.9.9")).ok).toBe(true);
    expect(await req("+77019999999", T0, "9.9.9.9")).toMatchObject({ ok: false, error: "tooMany" });
    expect((await req("+77019999999", T0, "9.9.9.8")).ok).toBe(true);
  });

  it("global daily SMS limit: no SMS sent, same answer", async () => {
    await seedSample(db(), T0);
    const day = new Date(Math.floor(T0.getTime() / DAY) * DAY);
    await db()
      .insert(rateLimits)
      .values({ key: globalLimit(300).key, windowStart: day, count: 300 });
    const r = await req(KNOWN, T0);
    expect(r).toMatchObject({ ok: true });
    expect(r.ok && r.devCode).toBeFalsy();
    expect(await db().select().from(smsLog)).toHaveLength(0);
  });
});

describe("verifyOtp", () => {
  it("correct code → session (sms), user created with locale, all memberships of the phone joined", async () => {
    const s = await seedSample(db(), T0);
    const r = await requestOtp(db(), { phone: KNOWN, ip: null, locale: "ru", now: T0 });
    if (!r.ok || !r.devCode) throw new Error();
    const v = await verifyOtp(db(), {
      phone: KNOWN,
      code: r.devCode,
      userAgent: "iPhone Safari/605.1",
      locale: "ru",
      now: addMs(T0, MIN),
    });
    expect(v).toMatchObject({ ok: true, redirectTo: `/e/${s.eventId}` });
    const [u] = await db().select().from(users).where(eq(users.phone, DEMO_PHONES.ana));
    expect(u!.locale).toBe("ru");
    const [m] = await db().select().from(eventMembers).where(eq(eventMembers.id, s.memberIds.ana));
    expect(m!.userId).toBe(u!.id);
    const [sess] = await db().select().from(sessions);
    expect(sess).toMatchObject({ authMethod: "sms", deviceLabel: "iOS · Safari" });
    // a used code cannot be reused
    expect(
      await verifyOtp(db(), { phone: KNOWN, code: r.devCode, userAgent: null, locale: "kk", now: addMs(T0, MIN) }),
    ).toEqual({ ok: false, error: "expired" });
  });

  it("5 minutes, 5 attempts; then locked; new code only after 10 minutes", async () => {
    await seedSample(db(), T0);
    const r = await req(KNOWN, T0);
    if (!r.ok || !r.devCode) throw new Error();
    const wrong = r.devCode === "000000" ? "111111" : "000000";
    const v = (code: string, ms = MIN) =>
      verifyOtp(db(), { phone: KNOWN, code, userAgent: null, locale: "kk", now: addMs(T0, ms) });
    expect(await v("12")).toEqual({ ok: false, error: "incomplete" });
    for (let left = 4; left >= 1; left--) expect(await v(wrong)).toEqual({ ok: false, error: "wrong", left });
    expect(await v(wrong)).toMatchObject({ ok: false, error: "locked" });
    expect(await v(r.devCode)).toMatchObject({ ok: false, error: "locked" }); // even the right code
    expect(await req(KNOWN, addMs(T0, 2 * MIN))).toMatchObject({ ok: false, error: "locked" });
    expect((await req(KNOWN, addMs(T0, 11 * MIN))).ok).toBe(true);
    const [c] = await db().select().from(otpChallenges).limit(1);
    expect(c!.codeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expired after 5 minutes", async () => {
    await seedSample(db(), T0);
    const r = await req(KNOWN, T0);
    if (!r.ok || !r.devCode) throw new Error();
    expect(
      await verifyOtp(db(), {
        phone: KNOWN,
        code: r.devCode,
        userAgent: null,
        locale: "kk",
        now: addMs(T0, 5 * MIN + 1),
      }),
    ).toEqual({ ok: false, error: "expired" });
  });

  it("unknown number never verifies (no code was sent)", async () => {
    const r = await req(UNKNOWN, T0);
    if (!r.ok) throw new Error();
    for (const code of ["000000", "123456"]) {
      const v = await verifyOtp(db(), { phone: UNKNOWN, code, userAgent: null, locale: "kk", now: T0 });
      expect(v.ok).toBe(false);
    }
  });

  it("otpDeliveryStatus: console → delivered; unknown numbers and bad ids → sent", async () => {
    await seedSample(db(), T0);
    const a = await req(KNOWN, T0);
    const b = await req(UNKNOWN, T0);
    if (!a.ok || !b.ok) throw new Error();
    expect(await otpDeliveryStatus(db(), a.challengeId)).toEqual({ status: "delivered" });
    expect(await otpDeliveryStatus(db(), b.challengeId)).toEqual({ status: "sent" });
    expect(await otpDeliveryStatus(db(), "nope")).toEqual({ status: "sent" });
  });
});

describe("sessions (plan 6.1, 9)", () => {
  async function user() {
    const [u] = await db().insert(users).values({ phone: "+77011112233" }).returning({ id: users.id });
    return u!.id;
  }

  it("180 days; sliding renewal at most once a day; only the hash is stored", async () => {
    const userId = await user();
    const s = await createSession(db(), { userId, method: "sms", scope: "all", userAgent: null, now: T0 });
    expect(s.expiresAt.getTime() - T0.getTime()).toBe(180 * DAY);
    const [row] = await db().select().from(sessions);
    expect(row!.id).not.toBe(s.token);
    expect((await validateSession(db(), s.token, addMs(T0, HOUR)))!.renewed).toBe(false);
    const later = await validateSession(db(), s.token, addMs(T0, DAY + 1));
    expect(later!.renewed).toBe(true);
    expect(later!.expiresAt.getTime()).toBe(addMs(T0, DAY + 1 + 180 * DAY).getTime());
    expect((await validateSession(db(), s.token, addMs(T0, DAY + 2)))!.renewed).toBe(false);
    expect(await validateSession(db(), s.token, addMs(T0, 400 * DAY))).toBeNull();
    expect(await validateSession(db(), "garbage", T0)).toBeNull();
    expect(await validateSession(db(), undefined, T0)).toBeNull();
  });

  it("at most 3 active sessions: the 4th revokes the oldest", async () => {
    const userId = await user();
    const tokens = [];
    for (let i = 0; i < 4; i++)
      tokens.push(
        (await createSession(db(), { userId, method: "sms", scope: "all", userAgent: null, now: addMs(T0, i * MIN) }))
          .token,
      );
    expect(await validateSession(db(), tokens[0], addMs(T0, HOUR))).toBeNull();
    for (const t of tokens.slice(1)) expect(await validateSession(db(), t, addMs(T0, HOUR))).not.toBeNull();
  });

  it("logout revokes one session; owner's «Шығару» revokes all of a user", async () => {
    const userId = await user();
    const a = await createSession(db(), { userId, method: "sms", scope: "all", userAgent: null, now: T0 });
    const b = await createSession(db(), { userId, method: "sms", scope: "all", userAgent: null, now: T0 });
    await revokeSessionByToken(db(), a.token, T0);
    expect(await validateSession(db(), a.token, T0)).toBeNull();
    expect(await validateSession(db(), b.token, T0)).not.toBeNull();
    expect(await revokeUserSessions(db(), userId, T0)).toBe(1);
    expect(await validateSession(db(), b.token, T0)).toBeNull();
  });
});
