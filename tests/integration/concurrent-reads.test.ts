import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { eventMembers, families, users } from "@/server/schema";
import { loadSeatingState } from "@/server/seating/adapter";
import { invalidateHallAttention } from "@/server/seating/attention-cache";
import { moveFamily } from "@/server/seating/hall";
import { hallAttention, hallView } from "@/server/seating/view";
import { seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

/**
 * Regression (found by the Ф8 test run on the two-parents hall e2e): the «Зал» red dot is streamed in parallel with
 * the page queries (Ф7b П1). While another connection holds a seating transaction, the local PGlite server — one
 * backend session for all connections — mixed the extended-protocol messages of concurrent connections:
 * «bind message supplies 2 parameters, but prepared statement "" requires 1» (exec_bind_message).
 * With `DATABASE_POOL_MAX=1` for PGlite (integration global-setup, playwright config, e2e global-setup, `.env.local`)
 * the same burst passes. On real Postgres every connection has its own session; there the pool stays 10.
 * Verified: with a pool of 10 on PGlite this test fails with exactly that error.
 */
beforeEach(resetDb);

describe("concurrent reads and seating writes on one event", () => {
  it("parallel hallAttention / hallView / state reads next to two moves do not mix their parameters", async () => {
    const s = await seedSample(db(), new Date("2026-10-10T08:00:00Z"));
    const [u] = await db()
      .insert(users)
      .values({ phone: "+77000000001" })
      .onConflictDoUpdate({ target: users.phone, set: { phone: "+77000000001" } })
      .returning({ id: users.id });
    await db().update(eventMembers).set({ userId: u!.id }).where(eq(eventMembers.phone, "+77000000001"));
    const who = { userId: u!.id, scope: "all" as const, sessionId: "n/a" };
    const movers = (await loadSeatingState(db(), s.eventId)).families.filter((f) => f.tableNo === 1 && !f.locked);

    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 30; i++) {
      invalidateHallAttention(s.eventId);
      jobs.push(hallAttention(db(), s.eventId), loadSeatingState(db(), s.eventId));
    }
    for (let i = 0; i < 40; i++) jobs.push(hallView(db(), who, s.eventId, { locale: "kk" }));
    for (const f of movers.slice(0, 2)) {
      const [row] = await db().select({ v: families.version }).from(families).where(eq(families.id, f.id));
      jobs.push(moveFamily(db(), who, { familyId: f.id, toTableNo: 16, force: true, familyVersion: row!.v }));
    }
    const out = await Promise.all(jobs);
    expect(out.filter((x) => x === true)).toHaveLength(30);
    const after = await loadSeatingState(db(), s.eventId);
    for (const f of movers.slice(0, 2)) expect(after.families.find((x) => x.id === f.id)!.tableNo).toBe(16);
    expect(env().DATABASE_POOL_MAX).toBe(process.env.TEST_DATABASE_URL ? 10 : 1);
  });
});
