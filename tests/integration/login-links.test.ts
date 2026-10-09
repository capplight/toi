import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeLink,
  inspectLink,
  issueMemberLink,
  issueOwnerBootstrapLink,
  LinkLimitError,
} from "@/server/auth/loginLinks";
import { validateSession } from "@/server/auth/session";
import { sha256Hex } from "@/server/crypto";
import { db } from "@/server/db";
import { allowedOwners, eventMembers, loginLinks, sessions } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { addMs, HOUR, resetDb } from "./helpers";

const T0 = new Date("2026-10-10T08:00:00Z");
const ctx = {
  ip: "10.0.0.1",
  userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36",
  locale: "kk" as const,
};

beforeEach(resetDb);

describe("login links (plan 6.1 flow 1)", () => {
  it("issue: 22-char base62 token, only sha256 stored, 72 h, wa.me text from content/messages", async () => {
    const s = await seedSample(db(), T0);
    const link = await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now: T0 });
    expect(link.token).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(link.url).toBe(`http://localhost:3100/join/${link.token}`);
    expect(link.expiresAt.getTime() - T0.getTime()).toBe(72 * HOUR);
    expect(link.waUrl.startsWith("https://wa.me/77000000002?text=")).toBe(true);
    expect(decodeURIComponent(link.waUrl.split("text=")[1]!)).toContain(link.url);
    const rows = await db().select().from(loginLinks);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(sha256Hex(link.token));
    expect(JSON.stringify(rows)).not.toContain(link.token);
  });

  it("GET (inspect) spends nothing — any number of previews; then POST consumes once", async () => {
    const s = await seedSample(db(), T0);
    const link = await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now: T0 });
    for (let i = 0; i < 3; i++) {
      const v = await inspectLink(db(), link.token, T0);
      expect(v).toMatchObject({
        status: "valid",
        purpose: "member",
        label: "Анасы",
        event: { title: "Айбек пен Дана" },
      });
    }
    const r = await consumeLink(db(), { token: link.token, ...ctx, now: addMs(T0, 1000) });
    expect(r).toMatchObject({ ok: true, redirectTo: `/e/${s.eventId}` });
    // Re-use is rejected.
    expect(await consumeLink(db(), { token: link.token, ...ctx, now: addMs(T0, 2000) })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect((await inspectLink(db(), link.token, T0)).status).toBe("expired");
  });

  it("consume: user created by the link phone, membership joined, session with device label", async () => {
    const s = await seedSample(db(), T0);
    const link = await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now: T0 });
    const r = await consumeLink(db(), { token: link.token, ...ctx, now: T0 });
    if (!r.ok) throw new Error("expected ok");
    const [m] = await db().select().from(eventMembers).where(eq(eventMembers.id, s.memberIds.ana));
    expect(m!.userId).toBe(r.userId);
    expect(m!.joinedAt).not.toBeNull();
    const u = await validateSession(db(), r.sessionToken, T0);
    expect(u).toMatchObject({ phone: DEMO_PHONES.ana, userId: r.userId });
    const [sess] = await db().select().from(sessions);
    expect(sess).toMatchObject({ authMethod: "link", deviceLabel: "Android · Chrome" });
    const [l] = await db().select().from(loginLinks);
    expect(l!.usedSessionId).toBe(sess!.id);
  });

  it("expired after 72 h; a new link revokes the old unused one", async () => {
    const s = await seedSample(db(), T0);
    const old = await issueMemberLink(db(), { memberId: s.memberIds.jas, createdBy: null, now: T0 });
    expect((await inspectLink(db(), old.token, addMs(T0, 72 * HOUR + 1))).status).toBe("expired");
    const fresh = await issueMemberLink(db(), { memberId: s.memberIds.jas, createdBy: null, now: addMs(T0, HOUR) });
    expect(await consumeLink(db(), { token: old.token, ...ctx, now: addMs(T0, 2 * HOUR) })).toEqual({
      ok: false,
      reason: "expired",
    });
    expect((await consumeLink(db(), { token: fresh.token, ...ctx, now: addMs(T0, 2 * HOUR) })).ok).toBe(true);
  });

  it("expired view offers the owner's number for «Иесінен жаңа сілтеме сұрау»", async () => {
    const s = await seedSample(db(), T0);
    const link = await issueMemberLink(db(), { memberId: s.memberIds.jas, createdBy: null, now: T0 });
    await consumeLink(db(), { token: link.token, ...ctx, now: T0 });
    expect(await inspectLink(db(), link.token, T0)).toEqual({
      status: "expired",
      ownerPhone: DEMO_PHONES.ake,
      label: "Жастар",
    });
    expect(await inspectLink(db(), "not-a-token", T0)).toEqual({ status: "expired", ownerPhone: null, label: null });
  });

  it("removed member: link no longer works", async () => {
    const s = await seedSample(db(), T0);
    const link = await issueMemberLink(db(), { memberId: s.memberIds.jas, createdBy: null, now: T0 });
    await db().update(eventMembers).set({ removedAt: T0 }).where(eq(eventMembers.id, s.memberIds.jas));
    expect((await inspectLink(db(), link.token, T0)).status).toBe("expired");
    expect((await consumeLink(db(), { token: link.token, ...ctx, now: T0 })).ok).toBe(false);
  });

  it("10 failed attempts per hour per IP → tooManyAttempts (even for a valid link)", async () => {
    const s = await seedSample(db(), T0);
    for (let i = 0; i < 10; i++) {
      expect((await consumeLink(db(), { token: `x${String(i).padStart(21, "0")}`, ...ctx, now: T0 })).ok).toBe(false);
    }
    const link = await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now: T0 });
    expect(await consumeLink(db(), { token: link.token, ...ctx, now: T0 })).toEqual({
      ok: false,
      reason: "tooManyAttempts",
    });
    expect((await consumeLink(db(), { token: link.token, ...ctx, ip: "10.0.0.2", now: T0 })).ok).toBe(true);
    expect((await consumeLink(db(), { token: "y".repeat(22), ...ctx, now: addMs(T0, HOUR) })).ok).toBe(false);
  });

  it("20 links per event per day", async () => {
    const s = await seedSample(db(), T0);
    for (let i = 0; i < 20; i++) await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now: T0 });
    await expect(issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now: T0 })).rejects.toThrow(
      LinkLimitError,
    );
    const active = await db()
      .select()
      .from(loginLinks)
      .where(and(isNull(loginLinks.usedAt), isNull(loginLinks.revokedAt)));
    expect(active).toHaveLength(1);
  });
});

describe("owner bootstrap link (plan 6.1 flow 4)", () => {
  it("adds the phone to allowed_owners; consuming creates the owner user and goes to /e", async () => {
    const link = await issueOwnerBootstrapLink(db(), { phone: "+77011234567", note: "pilot", now: T0 });
    expect(await db().select().from(allowedOwners)).toMatchObject([{ phone: "+77011234567", note: "pilot" }]);
    const view = await inspectLink(db(), link.token, T0);
    expect(view).toMatchObject({ status: "valid", purpose: "owner_bootstrap", event: null });
    const r = await consumeLink(db(), { token: link.token, ...ctx, now: T0 });
    expect(r).toMatchObject({ ok: true, redirectTo: "/e" });
  });

  it("removed from allowed_owners → the bootstrap link stops working", async () => {
    const link = await issueOwnerBootstrapLink(db(), { phone: "+77011234567", now: T0 });
    await db().delete(allowedOwners);
    expect((await consumeLink(db(), { token: link.token, ...ctx, now: T0 })).ok).toBe(false);
    // the failed consume did not burn the link
    const [l] = await db().select().from(loginLinks);
    expect(l!.usedAt).toBeNull();
  });
});
