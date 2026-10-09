import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { fullReseat } from "@/domain/seating";
import { db } from "@/server/db";
import { categories, eventMembers, events, families, hallTables, seatingChanges } from "@/server/schema";
import { seedEmpty, seedSample } from "../../scripts/lib/seed-sample";
import { expectedTables, sampleFamilies } from "../fixtures/sample-event";
import { resetDb } from "./helpers";

beforeEach(resetDb);

describe("seed from the shared fixture (plan 11.5)", () => {
  it("creates the sample event: 3 members with rights by kind, 8 categories, 16 tables, 65 families, h1–h6", async () => {
    const r = await seedSample(db(), new Date("2026-10-10T08:00:00Z"));
    const members = await db()
      .select({
        label: eventMembers.label,
        role: eventMembers.role,
        seat: eventMembers.canEditSeating,
        budget: eventMembers.canManageBudget,
        kind: eventMembers.memberKind,
      })
      .from(eventMembers)
      .where(eq(eventMembers.eventId, r.eventId))
      .orderBy(asc(eventMembers.phone));
    expect(members).toEqual([
      { label: "Әкесі", role: "owner", seat: true, budget: true, kind: "parent" },
      { label: "Анасы", role: "editor", seat: true, budget: true, kind: "parent" },
      { label: "Жастар", role: "editor", seat: false, budget: false, kind: "couple" },
    ]);
    const cats = await db()
      .select()
      .from(categories)
      .where(eq(categories.eventId, r.eventId))
      .orderBy(asc(categories.seatingRank));
    expect(cats.map((c) => [c.code, c.labelKk])).toEqual([
      ["kuda", "Құдалар"],
      ["oz", "Өз туыстар"],
      ["nagashy", "Нағашылар"],
      ["dos", "Достар"],
      ["ariptes", "Әріптестер"],
      ["korshi", "Көршілер"],
      ["synyp", "Сыныптастар / курстастар"],
      ["baska", "Басқа"],
    ]);
    expect((await db().select().from(hallTables).where(eq(hallTables.eventId, r.eventId))).length).toBe(16);
    expect((await db().select().from(seatingChanges).where(eq(seatingChanges.eventId, r.eventId))).length).toBe(6);
  });

  it("stored tables equal the Ф7a golden column «Стол»; locks on 7 and 12", async () => {
    const r = await seedSample(db());
    const rows = await db()
      .select({ id: families.id, table: families.tableNo, locked: families.seatLocked })
      .from(families)
      .where(and(eq(families.eventId, r.eventId), isNull(families.deletedAt)));
    const byId = new Map(rows.map((x) => [x.id, x]));
    for (const f of sampleFamilies) {
      const row = byId.get(r.familyIds.get(f.id)!)!;
      expect(row.table, f.id).toBe(expectedTables[f.id]);
      expect(row.locked, f.id).toBe(f.locked);
    }
    expect(fullReseat).toBeTypeOf("function");
  });

  it("re-seeding replaces the demo event (idempotent)", async () => {
    await seedSample(db());
    await seedSample(db());
    expect((await db().select().from(events)).length).toBe(1);
  });

  it("seed-empty: owner only, default categories, no hall", async () => {
    const r = await seedEmpty(db());
    const [ev] = await db().select().from(events).where(eq(events.id, r.eventId));
    expect(ev!.tablesCount).toBeNull();
    expect((await db().select().from(categories).where(eq(categories.eventId, r.eventId))).length).toBe(8);
  });
});

describe("schema constraints (plan 5)", () => {
  it("seat counts 1…20 (Д4/13), yes needs confirmed, lock needs a table", async () => {
    const r = await seedSample(db());
    const id = r.familyIds.get("f11")!;
    await expect(db().update(families).set({ expectedCount: 21 }).where(eq(families.id, id))).rejects.toThrow();
    await expect(db().update(families).set({ confirmedCount: 0 }).where(eq(families.id, id))).rejects.toThrow();
    await expect(db().update(families).set({ confirmedCount: null }).where(eq(families.id, id))).rejects.toThrow();
    await expect(
      db().update(families).set({ tableNo: null, seatLocked: true }).where(eq(families.id, id)),
    ).rejects.toThrow();
    await db().update(families).set({ expectedCount: 20, confirmedCount: 20 }).where(eq(families.id, id));
  });

  it("removing a hall table sets table_no to null but keeps event_id (ON DELETE SET NULL (table_no), PG15+)", async () => {
    const r = await seedSample(db());
    await db()
      .delete(hallTables)
      .where(and(eq(hallTables.eventId, r.eventId), eq(hallTables.no, 16)));
    await db()
      .delete(hallTables)
      .where(and(eq(hallTables.eventId, r.eventId), eq(hallTables.no, 15)));
    const [f] = await db()
      .select()
      .from(families)
      .where(eq(families.id, r.familyIds.get("f15")!));
    expect(f!.tableNo).toBeNull();
    expect(f!.eventId).toBe(r.eventId);
  });

  it("category ranks are unique per event but deferrable (swap in one transaction)", async () => {
    const r = await seedSample(db());
    const cats = await db()
      .select()
      .from(categories)
      .where(eq(categories.eventId, r.eventId))
      .orderBy(asc(categories.seatingRank));
    await db().transaction(async (tx) => {
      await tx.update(categories).set({ seatingRank: 2 }).where(eq(categories.id, cats[0]!.id));
      await tx.update(categories).set({ seatingRank: 1 }).where(eq(categories.id, cats[1]!.id));
    });
    await expect(
      db().update(categories).set({ seatingRank: 3 }).where(eq(categories.id, cats[0]!.id)),
    ).rejects.toThrow();
  });

  it("phone format, one owner per event, unique guest phone per event", async () => {
    const r = await seedSample(db());
    await expect(
      db().insert(eventMembers).values({ eventId: r.eventId, phone: "87011234567", label: "x" }),
    ).rejects.toThrow();
    await expect(
      db().insert(eventMembers).values({ eventId: r.eventId, phone: "+77019999999", label: "x", role: "owner" }),
    ).rejects.toThrow();
    const [a] = await db()
      .select()
      .from(families)
      .where(eq(families.id, r.familyIds.get("f01")!));
    await expect(
      db()
        .update(families)
        .set({ phone: a!.phone })
        .where(eq(families.id, r.familyIds.get("f02")!)),
    ).rejects.toThrow();
    const ext = await db().execute(sql`select count(*)::int as n from pg_extension where extname = 'pgcrypto'`);
    expect((ext as unknown as { rows: { n: number }[] }).rows[0]!.n).toBe(1);
  });
});
