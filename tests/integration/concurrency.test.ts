import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { moveFamily, seatsOf, tableStats } from "@/domain/seating";
import type { Principal } from "@/server/auth/access";
import { db } from "@/server/db";
import * as svc from "@/server/guests/service";
import { loadSeatingState, withSeating } from "@/server/seating/adapter";
import { categories, eventMembers, events, seatingChanges, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

/**
 * Ф4 review (deviation 10): real parallel transactions against Postgres. PGlite serves one connection at a time,
 * so locally these tests are skipped; in CI (`TEST_DATABASE_URL`, postgres:16) they are required.
 */
const realPg = Boolean(process.env.TEST_DATABASE_URL);
if (process.env.CI && !realPg)
  throw new Error("CI must run the concurrency tests against Postgres (TEST_DATABASE_URL)");

describe.skipIf(!realPg)("concurrency on real Postgres (withSeating: select … for update)", () => {
  beforeEach(resetDb);

  async function setup() {
    const s = await seedSample(db());
    const who: Record<string, Principal> = {};
    for (const k of ["ake", "ana"] as const) {
      const [u] = await db()
        .insert(users)
        .values({ phone: DEMO_PHONES[k] })
        .onConflictDoUpdate({ target: users.phone, set: { phone: DEMO_PHONES[k] } })
        .returning({ id: users.id });
      await db().update(eventMembers).set({ userId: u!.id }).where(eq(eventMembers.phone, DEMO_PHONES[k]));
      who[k] = { userId: u!.id, scope: "all", sessionId: "n/a" };
    }
    const cats = await db().select().from(categories).where(eq(categories.eventId, s.eventId));
    return { s, who, cat: (code: string) => cats.find((c) => c.code === code)!.id };
  }

  it("two parallel addFamily: both saved, distinct versions, no table over capacity by auto-placement", async () => {
    const { s, who, cat } = await setup();
    const [v0] = await db().select({ v: events.seatingVersion }).from(events).where(eq(events.id, s.eventId));
    const [a, b] = await Promise.all([
      svc.addFamily(db(), who.ana!, {
        eventId: s.eventId,
        name: "Alpha Parallel",
        categoryId: cat("baska"),
        seats: 12,
      }),
      svc.addFamily(db(), who.ake!, {
        eventId: s.eventId,
        name: "Bravo Parallel",
        categoryId: cat("baska"),
        seats: 12,
      }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const [v1] = await db().select({ v: events.seatingVersion }).from(events).where(eq(events.id, s.eventId));
    expect(v1!.v).toBe(v0!.v + 2);
    const state = await loadSeatingState(db(), s.eventId);
    const unlocked = new Map<number, number>();
    for (const f of state.families) {
      if (f.tableNo === null || f.locked) continue;
      unlocked.set(f.tableNo, (unlocked.get(f.tableNo) ?? 0) + seatsOf(f));
    }
    const lockedTables = new Set(state.families.filter((f) => f.locked).map((f) => f.tableNo));
    for (const [t, n] of unlocked) if (!lockedTables.has(t)) expect(n, `table ${t}`).toBeLessThanOrEqual(12);
    const versions = (await db().select().from(seatingChanges).where(eq(seatingChanges.eventId, s.eventId))).map(
      (h) => h.seatingVersionAfter,
    );
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("two parallel moves into a table with room for one of them: exactly one moves, no overflow", async () => {
    const { s } = await setup();
    const state = await loadSeatingState(db(), s.eventId);
    const stats = tableStats(state).tables;
    // A target with free seats F and two unlocked families elsewhere that fit alone but not together.
    let plan: { to: number; a: string; b: string; free: number } | null = null;
    for (const t of stats) {
      if (t.free < 2) continue;
      const fits = state.families.filter(
        (f) => !f.locked && f.tableNo !== null && f.tableNo !== t.no && seatsOf(f) > 0 && seatsOf(f) <= t.free,
      );
      for (const x of fits)
        for (const y of fits)
          if (x.id < y.id && seatsOf(x) + seatsOf(y) > t.free) plan ??= { to: t.no, a: x.id, b: y.id, free: t.free };
    }
    if (!plan) throw new Error("seed has no suitable pair (fixture changed?)");
    const p = plan;
    const move = (id: string) =>
      withSeating(db(), s.eventId, { kind: "member", memberId: s.memberIds.ana }, async ({ state: st }) => ({
        result: moveFamily(st, id, p.to, { by: s.memberIds.ana }),
        action: "move" as const,
        summary: { familyId: id, to: p.to },
        value: id,
      }));
    const out = await Promise.all([move(p.a), move(p.b)]);
    const moved = out.filter((o) => o.changes.length > 0);
    expect(moved).toHaveLength(1);
    expect(out.some((o) => o.warnings.some((w) => w.kind === "move_overflow"))).toBe(true);
    const after = await loadSeatingState(db(), s.eventId);
    const t = tableStats(after).tables.find((x) => x.no === p.to)!;
    expect(t.free).toBeGreaterThanOrEqual(0);
  });
});
