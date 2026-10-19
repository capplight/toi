import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Principal } from "@/server/auth/access";
import * as svc from "@/server/budget/service";
import { db } from "@/server/db";
import * as guests from "@/server/guests/service";
import { answerAsGuest } from "@/server/invite/guest";
import { eventMembers, expenses, families, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

/**
 * Ф9 brief §4 integration: access by Р9 (owner and `can_manage_budget` ✓; «Жастар», «Басқа» without the right and a
 * stranger → 403 on every action and on the view), the restaurant formula and its recount after answers, one linked
 * item under parallel calls, 409 by `updated_at`, delete + restore, amounts, totals, overdue in Almaty.
 */
beforeEach(resetDb);

const T0 = new Date("2026-10-10T08:00:00Z");

async function setup() {
  const s = await seedSample(db(), T0);
  const ids: Record<string, string> = {};
  for (const [k, phone] of Object.entries({ ...DEMO_PHONES, other: "+77019990001", stranger: "+77019990000" })) {
    const [u] = await db()
      .insert(users)
      .values({ phone })
      .onConflictDoUpdate({ target: users.phone, set: { phone } })
      .returning({ id: users.id });
    ids[k] = u!.id;
    if (k in DEMO_PHONES) await db().update(eventMembers).set({ userId: u!.id }).where(eq(eventMembers.phone, phone));
  }
  // «Басқа» without the budget right (Р9 defaults)
  await db().insert(eventMembers).values({
    eventId: s.eventId,
    userId: ids.other!,
    phone: "+77019990001",
    role: "editor",
    label: "Әпкесі",
    memberKind: "other",
    canEditSeating: false,
    canManageBudget: false,
  });
  const all = (userId: string): Principal => ({ userId, scope: "all", sessionId: "n/a" });
  return {
    s,
    owner: all(ids.ake!),
    ana: all(ids.ana!),
    jas: all(ids.jas!),
    other: all(ids.other!),
    stranger: all(ids.stranger!),
  };
}

const base = { title: "Асаба және әнші", category: "asaba", planned: 700000, paid: 350000, dueDate: null, note: null };

describe("budget: access (Р9)", () => {
  it("owner and a parent pass; Жастар, Басқа and a stranger get 403 on every action and the view", async () => {
    const { s, owner, ana, jas, other, stranger } = await setup();
    const made = await svc.createExpense(db(), owner, { eventId: s.eventId, ...base });
    expect(made.ok).toBe(true);
    const id = made.ok ? made.id : "";
    expect((await svc.budgetView(db(), ana, s.eventId)).items).toHaveLength(1);
    const v = (await svc.budgetView(db(), owner, s.eventId)).items[0]!;
    for (const who of [jas, other, stranger]) {
      const calls = [
        () => svc.budgetView(db(), who, s.eventId),
        () => svc.setBudgetTotal(db(), who, { eventId: s.eventId, total: 1 }),
        () => svc.setPricePerSeat(db(), who, { eventId: s.eventId, price: 1 }),
        () => svc.createExpense(db(), who, { eventId: s.eventId, ...base }),
        () => svc.updateExpense(db(), who, { id, version: v.version, ...base }),
        () => svc.deleteExpense(db(), who, { id }),
        () => svc.restoreExpense(db(), who, { id, eventId: s.eventId, linked: false, ...base }),
      ];
      for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
      expect(await svc.budgetTotals(db(), who, s.eventId)).toBeNull();
    }
    expect(await svc.budgetTotals(db(), ana, s.eventId)).toEqual({ paid: 350000, total: 700000 });
  });
});

describe("budget: restaurant", () => {
  it("plan = price × confirmed seats; no price → null; recounted after answers by phone and by the guest", async () => {
    const { s, owner } = await setup();
    const r = await svc.createExpense(db(), owner, {
      eventId: s.eventId,
      title: "«Шаңырақ» мейрамханасы",
      category: "restaurant",
      planned: 999,
      paid: 900000,
      dueDate: "2026-11-20",
      note: null,
      linked: true,
    });
    expect(r.ok).toBe(true);
    let v = await svc.budgetView(db(), owner, s.eventId);
    expect(v.confirmedSeats).toBe(150); // design_spec 5.2
    expect(v.restaurant).toMatchObject({ planned: null });
    expect(v.items[0]).toMatchObject({ linked: true, planned: 0, paid: 900000 });
    await svc.setPricePerSeat(db(), owner, { eventId: s.eventId, price: 12000 });
    v = await svc.budgetView(db(), owner, s.eventId);
    expect(v.restaurant.planned).toBe(1_800_000);
    expect(v.items[0]!.planned).toBe(1_800_000);

    // a pending family answers «Келеміз, 3» by phone → +3 seats
    const [pending] = await db().select().from(families).where(eq(families.eventId, s.eventId));
    const p = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (f) => f.rsvp === "pending",
    )!;
    expect(pending).toBeDefined();
    await guests.recordAnswerByMember(db(), owner, { familyId: p.id, attending: true, seats: 3 });
    expect((await svc.budgetView(db(), owner, s.eventId)).restaurant.planned).toBe(12000 * 153);
    // another pending family answers by the guest link → +2
    const q = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (f) => f.rsvp === "pending",
    )!;
    await answerAsGuest(db(), q.token, { attending: true, seats: 2 }, { now: new Date("2026-10-11T08:00:00Z") });
    expect((await svc.budgetView(db(), owner, s.eventId)).restaurant.planned).toBe(12000 * 155);
  });

  it("only one linked item: a second one (also in parallel) is refused; linked must be the restaurant category", async () => {
    const { s, owner, ana } = await setup();
    const make = (who: Principal) =>
      svc.createExpense(db(), who, {
        eventId: s.eventId,
        title: "Мейрамхана",
        category: "restaurant",
        planned: 0,
        paid: 0,
        dueDate: null,
        note: null,
        linked: true,
      });
    const res = await Promise.all([make(owner), make(ana)]);
    expect(res.filter((r) => r.ok)).toHaveLength(1);
    expect(res.filter((r) => !r.ok)[0]).toEqual({ ok: false, conflict: "restaurantExists" });
    expect(
      (await db().select().from(expenses).where(eq(expenses.eventId, s.eventId))).filter((e) => e.linkedToSeats),
    ).toHaveLength(1);
    expect(await svc.createExpense(db(), owner, { eventId: s.eventId, ...base, linked: true })).toEqual({
      ok: false,
      field: "category",
    });
  });
});

describe("budget: edits", () => {
  it("409 by updated_at: the second editor gets the fresh item, nothing is overwritten; «Анасы өзгертті»", async () => {
    const { s, owner, ana } = await setup();
    const made = await svc.createExpense(db(), owner, { eventId: s.eventId, ...base });
    const id = made.ok ? made.id : "";
    const seen = (await svc.budgetView(db(), owner, s.eventId)).items[0]!;
    expect(seen.changedBy).toBe("Әкесі");
    const a = await svc.updateExpense(db(), ana, { id, version: seen.version, ...base, paid: 700000 });
    expect(a).toEqual({ ok: true, id });
    const b = await svc.updateExpense(db(), owner, { id, version: seen.version, ...base, paid: 0 });
    expect(b).toMatchObject({ ok: false, conflict: "version", current: { paid: 700000, changedBy: "Анасы" } });
    expect((await svc.budgetView(db(), owner, s.eventId)).items[0]).toMatchObject({ paid: 700000, changedBy: "Анасы" });
  });

  it("delete returns a snapshot; restore puts it back with the same id; validation on restore", async () => {
    const { s, owner } = await setup();
    const made = await svc.createExpense(db(), owner, {
      eventId: s.eventId,
      ...base,
      dueDate: "2026-11-01",
      note: "алдын ала",
    });
    const id = made.ok ? made.id : "";
    const d = await svc.deleteExpense(db(), owner, { id });
    expect((await svc.budgetView(db(), owner, s.eventId)).items).toHaveLength(0);
    expect(await svc.restoreExpense(db(), owner, d.snapshot)).toEqual({ ok: true, id });
    expect((await svc.budgetView(db(), owner, s.eventId)).items[0]).toMatchObject({
      id,
      title: base.title,
      dueDate: "2026-11-01",
      note: "алдын ала",
    });
    expect(await svc.restoreExpense(db(), owner, { ...d.snapshot, id: crypto.randomUUID(), title: " " })).toEqual({
      ok: false,
      field: "titleRequired",
    });
  });

  it("amounts ≥ 0 and whole; title, date, note checked; totals, over budget, overdue by Almaty", async () => {
    const { s, owner } = await setup();
    const bad = (x: Partial<typeof base>) => svc.createExpense(db(), owner, { eventId: s.eventId, ...base, ...x });
    expect(await bad({ planned: -1 })).toEqual({ ok: false, field: "amount" });
    expect(await bad({ paid: 1.5 })).toEqual({ ok: false, field: "amount" });
    expect(await bad({ title: "x".repeat(81) })).toEqual({ ok: false, field: "titleTooLong" });
    expect(await bad({ dueDate: "2026-02-30" } as never)).toEqual({ ok: false, field: "date" });
    expect(await bad({ category: "car" })).toEqual({ ok: false, field: "category" });
    expect(await svc.setBudgetTotal(db(), owner, { eventId: s.eventId, total: -5 })).toEqual({
      ok: false,
      field: "amount",
    });

    await svc.setBudgetTotal(db(), owner, { eventId: s.eventId, total: 1_000_000 });
    await svc.createExpense(db(), owner, { eventId: s.eventId, ...base, dueDate: "2026-10-13" });
    await svc.createExpense(db(), owner, {
      eventId: s.eventId,
      ...base,
      title: "Безендіру",
      category: "decor",
      planned: 400000,
      paid: 0,
      dueDate: "2026-10-14",
    });
    // 2026-10-13 19:30 UTC = 2026-10-14 00:30 in Almaty: the 13th is overdue, the 14th is not
    const v = await svc.budgetView(db(), owner, s.eventId, new Date("2026-10-13T19:30:00Z"));
    expect(v.today).toBe("2026-10-14");
    expect(v.summary).toMatchObject({ planned: 1_100_000, paid: 350_000, left: 650_000, over: 100_000 });
    expect(v.summary.upcoming.map((u) => [u.dueDate, u.overdue])).toEqual([
      ["2026-10-13", true],
      ["2026-10-14", false],
    ]);
  });
});
