import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/cleanup/route";
import { cleanup } from "@/server/cleanup";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { loginLinks, otpChallenges, rateLimits, sessionEvents, sessions, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { DAY, HOUR, resetDb } from "./helpers";

const NOW = new Date("2026-10-10T22:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

beforeEach(resetDb);

describe("Б3: /api/cron/cleanup retention (plan 6.7)", () => {
  it("deletes only what is past retention, per table; session_events go by cascade", async () => {
    const s = await seedSample(db(), NOW);
    const [u] = await db().insert(users).values({ phone: "+77011112233" }).returning({ id: users.id });

    await db()
      .insert(otpChallenges)
      .values([
        {
          phone: "+77011112233",
          codeHash: "a",
          createdAt: ago(25 * HOUR),
          expiresAt: ago(25 * HOUR),
          provider: "none",
        },
        {
          phone: "+77011112233",
          codeHash: "b",
          createdAt: ago(23 * HOUR),
          expiresAt: ago(23 * HOUR),
          provider: "none",
        },
      ]);
    await db()
      .insert(rateLimits)
      .values([
        { key: "k", windowStart: ago(3 * DAY), count: 1 },
        { key: "k", windowStart: ago(1 * DAY), count: 1 },
      ]);
    const link = (hash: string, extra: Partial<typeof loginLinks.$inferInsert>) => ({
      tokenHash: hash,
      phone: DEMO_PHONES.ana,
      memberId: s.memberIds.ana,
      purpose: "member",
      expiresAt: NOW,
      ...extra,
    });
    await db()
      .insert(loginLinks)
      .values([
        link("used-old", { usedAt: ago(31 * DAY), expiresAt: ago(29 * DAY) }),
        link("revoked-old", { revokedAt: ago(31 * DAY), expiresAt: ago(28 * DAY) }),
        link("expired-old", { expiresAt: ago(31 * DAY) }),
        link("used-recent", { usedAt: ago(5 * DAY), expiresAt: ago(2 * DAY) }),
        link("active", { expiresAt: new Date(NOW.getTime() + DAY) }),
      ]);
    const sess = (id: string, extra: Partial<typeof sessions.$inferInsert>) => ({
      id,
      userId: u!.id,
      authMethod: "link",
      expiresAt: new Date(NOW.getTime() + 100 * DAY),
      ...extra,
    });
    await db()
      .insert(sessions)
      .values([
        sess("revoked-old", { revokedAt: ago(31 * DAY), scope: "events" }),
        sess("expired-old", { expiresAt: ago(31 * DAY) }),
        sess("revoked-recent", { revokedAt: ago(1 * DAY) }),
        sess("active", {}),
      ]);
    await db().insert(sessionEvents).values({ sessionId: "revoked-old", eventId: s.eventId });

    const r = await cleanup(db(), NOW);
    expect(r).toEqual({ otpChallenges: 1, rateLimits: 1, loginLinks: 3, sessions: 2, music: 0 });
    expect((await db().select({ h: loginLinks.tokenHash }).from(loginLinks)).map((x) => x.h).sort()).toEqual([
      "active",
      "used-recent",
    ]);
    expect((await db().select({ id: sessions.id }).from(sessions)).map((x) => x.id).sort()).toEqual([
      "active",
      "revoked-recent",
    ]);
    expect(await db().select().from(sessionEvents)).toHaveLength(0);
    expect(await db().select().from(otpChallenges)).toHaveLength(1);
    expect(await db().select().from(rateLimits)).toHaveLength(1);
  });

  it("route: 401 without or with a wrong Bearer secret; 200 with counts only", async () => {
    const call = (auth?: string) =>
      GET(new Request("http://localhost/api/cron/cleanup", { headers: auth ? { authorization: auth } : {} }));
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call(env().CRON_SECRET)).status).toBe(401); // missing "Bearer "
    const ok = await call(`Bearer ${env().CRON_SECRET}`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({
      ok: true,
      deleted: { otpChallenges: 0, rateLimits: 0, loginLinks: 0, sessions: 0, music: 0 },
    });
  });
});
