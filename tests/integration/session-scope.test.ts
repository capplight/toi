import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorize, ForbiddenError, type Principal } from "@/server/auth/access";
import { consumeLink, issueMemberLink } from "@/server/auth/loginLinks";
import { requestOtp, verifyOtp } from "@/server/auth/otp";
import {
  createSession,
  revokeMemberEventAccess,
  sessionEventIds,
  type SessionUser,
  validateSession,
} from "@/server/auth/session";
import { hmacHex, randomToken } from "@/server/crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { eventMembers, events, otpChallenges, sessions, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { addMs, MIN, resetDb } from "./helpers";

const T0 = new Date("2026-10-10T08:00:00Z");
const ua = "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36";
const P = DEMO_PHONES.ana; // a member of event A (seed) and of event B (below)

beforeEach(async () => {
  await resetDb();
  vi.spyOn(console, "info").mockImplementation(() => {});
});

/** Event B of another owner where phone P is also a member. */
async function eventB() {
  const [owner] = await db().insert(users).values({ phone: "+77019990001" }).returning({ id: users.id });
  const [ev] = await db()
    .insert(events)
    .values({ ownerId: owner!.id, kind: "merey", title: "Event B", startsOn: "2026-12-01", doorToken: randomToken() })
    .returning({ id: events.id });
  await db()
    .insert(eventMembers)
    .values([
      {
        eventId: ev!.id,
        userId: owner!.id,
        phone: "+77019990001",
        role: "owner",
        label: "Owner B",
        memberKind: "parent",
      },
      { eventId: ev!.id, phone: P, role: "editor", label: "Анасы", memberKind: "parent", canEditSeating: true },
    ]);
  return ev!.id;
}

const asPrincipal = (u: SessionUser): Principal => ({ userId: u.userId, scope: u.scope, sessionId: u.sessionId });

async function loginByLink(memberId: string, now: Date, currentSessionToken?: string, locale: "kk" | "ru" = "kk") {
  const link = await issueMemberLink(db(), { memberId, createdBy: null, now });
  const r = await consumeLink(db(), {
    token: link.token,
    ip: "10.0.0.1",
    userAgent: ua,
    locale,
    now,
    currentSessionToken,
  });
  if (!r.ok) throw new Error("link login failed");
  return r;
}

async function loginBySms(phone: string, now: Date, locale: "kk" | "ru" = "kk") {
  const req = await requestOtp(db(), { phone, ip: "10.0.0.9", locale, now });
  if (!req.ok || !req.devCode) throw new Error("otp request failed");
  const v = await verifyOtp(db(), { phone, code: req.devCode, userAgent: ua, locale, now: addMs(now, MIN) });
  if (!v.ok) throw new Error("otp verify failed");
  return v;
}

describe("Б1: session scope (plan 6.1 v1.5)", () => {
  it("impersonation: owner A opens P's member link → access only to A, never to B", async () => {
    const a = await seedSample(db(), T0);
    const b = await eventB();
    const r = await loginByLink(a.memberIds.ana, T0); // opened by owner A himself
    const s = (await validateSession(db(), r.sessionToken, T0))!;
    expect(s.scope).toBe("events");
    await expect(authorize(db(), asPrincipal(s), a.eventId, "seating")).resolves.toMatchObject({ eventId: a.eventId });
    await expect(authorize(db(), asPrincipal(s), b, "member")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await sessionEventIds(db(), s)).toEqual([a.eventId]);
    // Only the membership of the link is joined; P's membership in B stays unclaimed.
    const [mB] = await db()
      .select()
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, b), eq(eventMembers.phone, P)));
    expect(mB!.userId).toBeNull();
  });

  it("impersonation when P already uses B: owner A's session for P still gets 403 in B", async () => {
    const a = await seedSample(db(), T0);
    const b = await eventB();
    // P works in B on P's own phone (same users.id as any later session for P).
    const pOwn = await loginBySms(P, T0);
    const pSession = (await validateSession(db(), pOwn.sessionToken, T0))!;
    await expect(authorize(db(), asPrincipal(pSession), b, "member")).resolves.toBeTruthy();
    // Owner A issues P's link for A and opens it himself.
    const stolen = await loginByLink(a.memberIds.ana, addMs(T0, MIN));
    const s = (await validateSession(db(), stolen.sessionToken, addMs(T0, MIN)))!;
    expect(s.userId).toBe(pSession.userId);
    await expect(authorize(db(), asPrincipal(s), b, "member")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(authorize(db(), asPrincipal(s), a.eventId, "member")).resolves.toBeTruthy();
    // P's own SMS session is not affected.
    expect(await validateSession(db(), pOwn.sessionToken, addMs(T0, MIN))).not.toBeNull();
  });

  it("SMS login proves the phone: scope 'all', access to A and B", async () => {
    const a = await seedSample(db(), T0);
    const b = await eventB();
    const v = await loginBySms(P, T0);
    const s = (await validateSession(db(), v.sessionToken, T0))!;
    expect(s.scope).toBe("all");
    expect(await sessionEventIds(db(), s)).toBeNull();
    await expect(authorize(db(), asPrincipal(s), a.eventId, "member")).resolves.toBeTruthy();
    await expect(authorize(db(), asPrincipal(s), b, "member")).resolves.toBeTruthy();
    expect(v.redirectTo).toBe("/e"); // two events
  });

  it("«Шығару» in A removes only A's link access; P's SMS session is untouched", async () => {
    const a = await seedSample(db(), T0);
    await eventB();
    const link = await loginByLink(a.memberIds.ana, T0);
    const sms = await loginBySms(P, addMs(T0, MIN));
    const userId = sms.userId;
    const r = await revokeMemberEventAccess(db(), { userId, eventId: a.eventId, now: addMs(T0, 2 * MIN) });
    expect(r).toEqual({ removed: 1, revoked: 1 });
    expect(await validateSession(db(), link.sessionToken, addMs(T0, 3 * MIN))).toBeNull();
    const s = (await validateSession(db(), sms.sessionToken, addMs(T0, 3 * MIN)))!;
    expect(s.scope).toBe("all");
  });

  it("two member links of different events on one device → one session with two events", async () => {
    const a = await seedSample(db(), T0);
    const b = await eventB();
    const [mB] = await db()
      .select({ id: eventMembers.id })
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, b), eq(eventMembers.phone, P)));
    const first = await loginByLink(a.memberIds.ana, T0);
    const second = await loginByLink(mB!.id, addMs(T0, MIN), first.sessionToken);
    expect(second.sessionToken).toBe(first.sessionToken);
    expect(second.redirectTo).toBe(`/e/${b}`);
    const s = (await validateSession(db(), first.sessionToken, addMs(T0, 2 * MIN)))!;
    expect((await sessionEventIds(db(), s))!.sort()).toEqual([a.eventId, b].sort());
    expect(await db().select().from(sessions)).toHaveLength(1);
  });

  it("a device cookie of another person is not reused: a new session is created", async () => {
    const a = await seedSample(db(), T0);
    const other = await loginByLink(a.memberIds.jas, T0);
    const r = await loginByLink(a.memberIds.ana, addMs(T0, MIN), other.sessionToken);
    expect(r.sessionToken).not.toBe(other.sessionToken);
  });

  it("3-session cap per scope: link sessions never push out SMS sessions, and the reverse", async () => {
    const a = await seedSample(db(), T0);
    const sms = await loginBySms(P, T0);
    const links = [];
    for (let i = 0; i < 4; i++) links.push(await loginByLink(a.memberIds.ana, addMs(T0, (i + 2) * MIN)));
    const at = addMs(T0, 10 * MIN);
    expect(await validateSession(db(), links[0]!.sessionToken, at)).toBeNull(); // oldest link session lost A → revoked
    for (const l of links.slice(1)) expect(await validateSession(db(), l.sessionToken, at)).not.toBeNull();
    expect(await validateSession(db(), sms.sessionToken, at)).not.toBeNull();
    // 3 more SMS sessions: the first SMS session goes, link sessions stay.
    const userId = sms.userId;
    for (let i = 0; i < 3; i++) {
      await createSession(db(), {
        userId,
        method: "sms",
        scope: "all",
        userAgent: null,
        now: addMs(T0, (20 + i) * MIN),
      });
    }
    expect(await validateSession(db(), sms.sessionToken, addMs(T0, 30 * MIN))).toBeNull();
    for (const l of links.slice(1))
      expect(await validateSession(db(), l.sessionToken, addMs(T0, 30 * MIN))).not.toBeNull();
  });

  it("a link login never changes an existing user's language; SMS does", async () => {
    const a = await seedSample(db(), T0);
    await loginBySms(P, T0, "ru");
    await loginByLink(a.memberIds.ana, addMs(T0, MIN), undefined, "kk");
    const [u] = await db().select().from(users).where(eq(users.phone, P));
    expect(u!.locale).toBe("ru");
    // a new user created by a link gets the interface language
    await loginByLink(a.memberIds.jas, addMs(T0, MIN), undefined, "ru");
    const [j] = await db().select().from(users).where(eq(users.phone, DEMO_PHONES.jas));
    expect(j!.locale).toBe("ru");
  });

  it("owner bootstrap link keeps scope 'all'", async () => {
    const a = await seedSample(db(), T0);
    const { issueOwnerBootstrapLink } = await import("@/server/auth/loginLinks");
    const link = await issueOwnerBootstrapLink(db(), { phone: DEMO_PHONES.ake, now: T0 });
    const r = await consumeLink(db(), { token: link.token, ip: null, userAgent: ua, locale: "kk", now: T0 });
    if (!r.ok) throw new Error();
    const s = (await validateSession(db(), r.sessionToken, T0))!;
    expect(s.scope).toBe("all");
    await expect(authorize(db(), asPrincipal(s), a.eventId, "owner")).resolves.toBeTruthy();
  });
});

describe("Б2: a challenge of an unknown number never verifies", () => {
  it("even the right code is answered like a wrong one; attempts are counted", async () => {
    const phone = "+77015550000";
    const r = await requestOtp(db(), { phone, ip: null, locale: "kk", now: T0 });
    if (!r.ok) throw new Error();
    // Plant a known code into the unknown-number challenge (as if it had been guessed).
    await db()
      .update(otpChallenges)
      .set({ codeHash: hmacHex(env().OTP_HMAC_SECRET, `${phone}|123456`) })
      .where(eq(otpChallenges.id, r.challengeId));
    const v = await verifyOtp(db(), { phone, code: "123456", userAgent: null, locale: "kk", now: addMs(T0, MIN) });
    expect(v).toEqual({ ok: false, error: "wrong", left: 4 });
    expect(await db().select().from(users).where(eq(users.phone, phone))).toHaveLength(0);
    expect(await db().select().from(sessions)).toHaveLength(0);
  });
});
