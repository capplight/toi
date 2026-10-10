import { and, desc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Principal } from "@/server/auth/access";
import { createSession } from "@/server/auth/session";
import { randomToken } from "@/server/crypto";
import { db } from "@/server/db";
import * as svc from "@/server/guests/service";
import { guestsData } from "@/server/guests/queries";
import { loadSeatingState, withSeating } from "@/server/seating/adapter";
import {
  activityLog,
  categories,
  duplicateReviews,
  eventMembers,
  events,
  families,
  seatingChanges,
  users,
} from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const T0 = new Date("2026-10-10T08:00:00Z");

async function setup() {
  const s = await seedSample(db(), T0);
  const ids: Record<string, string> = {};
  for (const [k, phone] of Object.entries({ ...DEMO_PHONES, stranger: "+77019990000" })) {
    const [u] = await db()
      .insert(users)
      .values({ phone })
      .onConflictDoUpdate({ target: users.phone, set: { phone } })
      .returning({ id: users.id });
    ids[k] = u!.id;
    if (k !== "stranger") await db().update(eventMembers).set({ userId: u!.id }).where(eq(eventMembers.phone, phone));
  }
  const all = (userId: string): Principal => ({ userId, scope: "all", sessionId: "n/a" });
  const cats = await db().select().from(categories).where(eq(categories.eventId, s.eventId));
  const cat = (code: string) => cats.find((c) => c.code === code)!.id;
  return {
    s,
    ids,
    cat,
    owner: all(ids.ake!),
    ana: all(ids.ana!),
    jas: all(ids.jas!),
    stranger: all(ids.stranger!),
  };
}

const fam = (id: string) =>
  db()
    .select()
    .from(families)
    .where(eq(families.id, id))
    .then((r) => r[0]!);
const version = (eventId: string) =>
  db()
    .select({ v: events.seatingVersion })
    .from(events)
    .where(eq(events.id, eventId))
    .then((r) => r[0]!.v);

describe("guest actions: access (plan 5.3)", () => {
  it("a stranger gets 403 on every action; unknown family ids are 403 too", async () => {
    const { s, cat, stranger } = await setup();
    const anyFamily = s.familyIds.get("f10")!;
    const input = { eventId: s.eventId, name: "Ерлан", categoryId: cat("oz"), seats: 2 };
    const calls = [
      () => svc.addFamily(db(), stranger, input),
      () => svc.updateFamily(db(), stranger, { ...input, familyId: anyFamily, version: 0 }),
      () => svc.deleteFamily(db(), stranger, anyFamily),
      () => svc.restoreFamily(db(), stranger, anyFamily),
      () => svc.markSent(db(), stranger, anyFamily, "invite"),
      () => svc.waClicked(db(), stranger, anyFamily, "invite"),
      () => svc.recordAnswerByMember(db(), stranger, { familyId: anyFamily, attending: true, seats: 2 }),
      () => svc.revertAnswer(db(), stranger, { familyId: anyFamily, previous: { rsvp: "pending", confirmed: null } }),
      () => svc.createCategory(db(), stranger, { eventId: s.eventId, labelKk: "Ауылдастар", afterCategoryId: null }),
      () =>
        svc.keepBothDuplicates(db(), stranger, {
          eventId: s.eventId,
          familyA: anyFamily,
          familyB: s.familyIds.get("f11")!,
        }),
      () => svc.deleteFamily(db(), stranger, "00000000-0000-4000-8000-000000000000"),
      () => svc.deleteFamily(db(), stranger, "garbage"),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    expect((await fam(anyFamily)).deletedAt).toBeNull();
  });

  it("a session with scope 'events' for another event → 403 (even though the person is a member here)", async () => {
    const { s, ids, cat } = await setup();
    const [owner] = await db().insert(users).values({ phone: "+77019990001" }).returning({ id: users.id });
    const [b] = await db()
      .insert(events)
      .values({ ownerId: owner!.id, kind: "merey", title: "B", startsOn: "2026-12-01", doorToken: randomToken() })
      .returning({ id: events.id });
    await db()
      .insert(eventMembers)
      .values({ eventId: b!.id, userId: ids.ana!, phone: DEMO_PHONES.ana, label: "Апасы" });
    const sess = await createSession(db(), {
      userId: ids.ana!,
      method: "link",
      scope: "events",
      eventId: b!.id,
      userAgent: null,
      now: new Date(),
    });
    const scoped: Principal = { userId: ids.ana!, scope: "events", sessionId: sess.id };
    await expect(
      svc.addFamily(db(), scoped, { eventId: s.eventId, name: "Ерлан", categoryId: cat("oz"), seats: 2 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.markSent(db(), scoped, s.familyIds.get("f10")!, "invite")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a family id of another event cannot be used with this event's category or pair", async () => {
    const { s, owner } = await setup();
    await expect(
      svc.keepBothDuplicates(db(), owner, {
        eventId: s.eventId,
        familyA: s.familyIds.get("f10")!,
        familyB: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

const UNIQUE_NAMES = [
  "Alpha",
  "Bravo",
  "Charlie",
  "Delta",
  "Echo",
  "Foxtrot",
  "Golf",
  "Hotel",
  "India",
  "Juliett",
  "Kilo",
  "Lima",
];

describe("addFamily", () => {
  it("validates input: name, phone, seats 1–20, category of the event", async () => {
    const { s, cat, ana } = await setup();
    const base = { eventId: s.eventId, name: "Ерлан ағай отбасы", categoryId: cat("nagashy"), seats: 2 };
    expect(await svc.addFamily(db(), ana, { ...base, name: "  " })).toEqual({ ok: false, field: "nameRequired" });
    expect(await svc.addFamily(db(), ana, { ...base, name: "x".repeat(81) })).toEqual({
      ok: false,
      field: "nameTooLong",
    });
    expect(await svc.addFamily(db(), ana, { ...base, phone: "701 55" })).toEqual({
      ok: false,
      field: "phoneIncomplete",
    });
    expect(await svc.addFamily(db(), ana, { ...base, seats: 0 })).toEqual({ ok: false, field: "seatsRange" });
    expect(await svc.addFamily(db(), ana, { ...base, seats: 21 })).toEqual({ ok: false, field: "seatsRange" });
    expect(await svc.addFamily(db(), ana, { ...base, categoryId: "00000000-0000-4000-8000-000000000000" })).toEqual({
      ok: false,
      field: "categoryUnknown",
    });
  });

  it("adds through the adapter: token, seat_seq, placement, seating_changes, seating_version + 1", async () => {
    const { s, cat, ana } = await setup();
    const v0 = await version(s.eventId);
    const r = await svc.addFamily(db(), ana, {
      eventId: s.eventId,
      name: "Жаңабай Тоқтар",
      phone: "8 (701) 000-77-66",
      categoryId: cat("nagashy"),
      seats: 3,
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const row = await fam(r.family.id);
    expect(row.phone).toBe("+77010007766");
    expect(row.token).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(row.seatSeq).toBe(65); // seeds use 0…64
    expect(row.addedByMemberId).toBe(s.memberIds.ana);
    expect(row.tableNo).not.toBeNull();
    expect(r.tableNo).toBe(row.tableNo);
    expect(await version(s.eventId)).toBe(v0 + 1);
    const [h] = await db()
      .select()
      .from(seatingChanges)
      .where(eq(seatingChanges.eventId, s.eventId))
      .orderBy(desc(seatingChanges.id))
      .limit(1);
    expect(h).toMatchObject({ action: "auto_place", actorKind: "member", actorMemberId: s.memberIds.ana });
    expect(h!.seatingVersionAfter).toBe(v0 + 1);
    expect((h!.diff as { families: { id: string }[] }).families.map((f) => f.id)).toEqual([row.id]);
  });

  it("Russian numbers are allowed for guests (isKzMobile is not required)", async () => {
    const { s, cat, ana } = await setup();
    const r = await svc.addFamily(db(), ana, {
      eventId: s.eventId,
      name: "Мәскеулік туыс",
      phone: "+7 916 123 45 67",
      categoryId: cat("oz"),
      seats: 1,
    });
    expect(r.ok).toBe(true);
  });

  it("phone duplicate → conflict with the existing guest and the list it is in; nothing saved", async () => {
    const { s, cat, owner } = await setup();
    const [existing] = await db()
      .select()
      .from(families)
      .where(and(eq(families.eventId, s.eventId), eq(families.addedByMemberId, s.memberIds.ana)))
      .limit(1);
    const before = await db().select().from(families).where(eq(families.eventId, s.eventId));
    const r = await svc.addFamily(db(), owner, {
      eventId: s.eventId,
      name: "Мүлде басқа адам",
      phone: existing!.phone!,
      categoryId: cat("oz"),
      seats: 2,
    });
    expect(r).toMatchObject({
      ok: false,
      conflict: "phone",
      existing: { id: existing!.id, memberId: s.memberIds.ana },
    });
    expect(await db().select().from(families).where(eq(families.eventId, s.eventId))).toHaveLength(before.length);
  });

  it("the partial unique index is the last line: a direct second insert with the same phone fails", async () => {
    const { s } = await setup();
    const [existing] = await db().select().from(families).where(eq(families.eventId, s.eventId)).limit(1);
    const withPhone = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find((f) => f.phone)!;
    await expect(
      db().insert(families).values({
        eventId: s.eventId,
        addedByMemberId: existing!.addedByMemberId,
        name: "Race",
        phone: withPhone.phone,
        categoryId: existing!.categoryId,
        expectedCount: 1,
        token: randomToken(),
      }),
    ).rejects.toThrow();
  });

  it("similar name → candidates (up to 3); confirmNotDuplicateOf adds and records duplicate_reviews", async () => {
    const { s, cat, ana } = await setup();
    const target = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (f) => f.name === "Тимур құда отбасы",
    )!;
    const input = { eventId: s.eventId, name: "Тимур құда", categoryId: cat("kuda"), seats: 4 };
    const r1 = await svc.addFamily(db(), ana, input);
    if (r1.ok || !("conflict" in r1) || r1.conflict !== "similar") throw new Error(JSON.stringify(r1));
    expect(r1.candidates.map((c) => c.id)).toContain(target.id);
    expect(r1.candidates.length).toBeLessThanOrEqual(3);
    const r2 = await svc.addFamily(db(), ana, { ...input, confirmNotDuplicateOf: r1.candidates.map((c) => c.id) });
    if (!r2.ok) throw new Error(JSON.stringify(r2));
    const reviews = await db().select().from(duplicateReviews).where(eq(duplicateReviews.eventId, s.eventId));
    expect(reviews).toHaveLength(r1.candidates.length);
    for (const rv of reviews) expect(rv.familyA < rv.familyB).toBe(true);
  });

  it("without a configured hall the family is saved unplaced, no history, version unchanged", async () => {
    const { s, cat, ana } = await setup();
    await db().update(events).set({ hallColumns: null, tablesCount: null }).where(eq(events.id, s.eventId));
    await db().update(families).set({ tableNo: null, seatLocked: false, lockedByMemberId: null });
    const v0 = await version(s.eventId);
    const r = await svc.addFamily(db(), ana, {
      eventId: s.eventId,
      name: "Жаңа адам",
      categoryId: cat("oz"),
      seats: 2,
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.tableNo).toBeNull();
    expect(await version(s.eventId)).toBe(v0);
  });

  it("acceptance 2: seated families never move when guests are added on the seeded hall", async () => {
    const { s, cat, ana, owner } = await setup();
    const seatOf = async () =>
      new Map(
        (
          await db()
            .select()
            .from(families)
            .where(and(eq(families.eventId, s.eventId), isNull(families.deletedAt)))
        )
          .filter((f) => f.tableNo !== null)
          .map((f) => [f.id, f.tableNo]),
      );
    const before = await seatOf();
    for (let i = 0; i < 12; i++) {
      const r = await svc.addFamily(db(), i % 2 ? ana : owner, {
        eventId: s.eventId,
        name: UNIQUE_NAMES[i]!,
        categoryId: cat(["kuda", "oz", "nagashy", "dos", "ariptes", "baska"][i % 6]!),
        seats: 1 + (i % 6),
      });
      expect(r.ok, JSON.stringify(r)).toBe(true);
    }
    const after = await seatOf();
    for (const [id, table] of before) expect(after.get(id), id).toBe(table);
  });

  it("two concurrent addFamily into a nearly full table do not overflow beyond the engine rules", async () => {
    const { s, cat, ana, owner } = await setup();
    const run = (who: Principal, n: string) =>
      svc.addFamily(db(), who, { eventId: s.eventId, name: n, categoryId: cat("baska"), seats: 12 });
    const [a, b] = await Promise.all([run(ana, "Есенжолов"), run(owner, "Райымбек")]);
    expect(a.ok && b.ok, JSON.stringify([a, b])).toBe(true);
    // Auto-placement never overfills a table (plan 7.2 Р3: overflow only from locks / grown seats).
    const state = await loadSeatingState(db(), s.eventId);
    const load = new Map<number, number>();
    for (const f of state.families) {
      if (f.tableNo === null || f.locked) continue;
      const seats = f.rsvp === "yes" ? (f.confirmed ?? 0) : f.rsvp === "no" ? 0 : f.expected;
      load.set(f.tableNo, (load.get(f.tableNo) ?? 0) + seats);
    }
    const lockedLoad = new Map<number, number>();
    for (const f of state.families) {
      if (f.tableNo === null || !f.locked) continue;
      lockedLoad.set(
        f.tableNo,
        (lockedLoad.get(f.tableNo) ?? 0) + (f.rsvp === "yes" ? (f.confirmed ?? 0) : f.expected),
      );
    }
    for (const [t, n] of load) if (!lockedLoad.has(t)) expect(n, `table ${t}`).toBeLessThanOrEqual(12);
    const hist = await db().select().from(seatingChanges).where(eq(seatingChanges.eventId, s.eventId));
    const versions = hist.map((h) => h.seatingVersionAfter).sort((x, y) => x - y);
    expect(new Set(versions).size).toBe(versions.length); // serialised: every change has its own version
  });
});

describe("updateFamily", () => {
  it("optimistic lock: a stale version → conflict 'version'; fresh one saves", async () => {
    const { s, cat, ana, owner } = await setup();
    const id = s.familyIds.get("f20")!;
    const row = await fam(id);
    const input = { familyId: id, version: row.version, name: row.name, categoryId: row.categoryId, seats: 3 };
    const first = await svc.updateFamily(db(), ana, { ...input, name: `${row.name} (жаңа)` });
    expect(first.ok).toBe(true);
    const stale = await svc.updateFamily(db(), owner, { ...input, categoryId: cat("baska") });
    expect(stale).toEqual({ ok: false, conflict: "version" });
    expect((await fam(id)).name).toBe(`${row.name} (жаңа)`);
  });

  it("phone of another family → conflict; own phone kept is fine", async () => {
    const { s, ana } = await setup();
    const rows = (await db().select().from(families).where(eq(families.eventId, s.eventId))).filter((f) => f.phone);
    const [a, b] = rows as [(typeof rows)[0], (typeof rows)[0]];
    const base = { familyId: a.id, version: a.version, name: a.name, categoryId: a.categoryId, seats: a.expectedCount };
    expect(await svc.updateFamily(db(), ana, { ...base, phone: b.phone })).toMatchObject({ conflict: "phone" });
    expect(await svc.updateFamily(db(), ana, { ...base, phone: a.phone })).toMatchObject({ ok: true });
  });

  it("category change does not move a seated family", async () => {
    const { s, cat, ana } = await setup();
    const row = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (f) => f.tableNo !== null && f.rsvp === "pending",
    )!;
    const r = await svc.updateFamily(db(), ana, {
      familyId: row.id,
      version: row.version,
      name: row.name,
      phone: row.phone,
      categoryId: cat("baska"),
      seats: row.expectedCount,
    });
    expect(r.ok).toBe(true);
    expect((await fam(row.id)).tableNo).toBe(row.tableNo);
  });
});

describe("delete / restore", () => {
  it("soft delete through the adapter; restore returns to the same table when seats are free", async () => {
    const { s, ana } = await setup();
    const row = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (f) => f.tableNo !== null && !f.seatLocked,
    )!;
    const v0 = await version(s.eventId);
    await svc.deleteFamily(db(), ana, row.id);
    const deleted = await fam(row.id);
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.tableNo).toBe(row.tableNo); // kept for «Қайтару»
    expect(await version(s.eventId)).toBe(v0 + 1);
    const state = await loadSeatingState(db(), s.eventId);
    expect(state.families.some((f) => f.id === row.id)).toBe(false);

    const r = await svc.restoreFamily(db(), ana, row.id);
    expect(r).toMatchObject({ ok: true, tableNo: row.tableNo });
    const back = await fam(row.id);
    expect(back.deletedAt).toBeNull();
    expect(back.tableNo).toBe(row.tableNo);
    expect(await version(s.eventId)).toBe(v0 + 2);
    const hist = await db()
      .select()
      .from(seatingChanges)
      .where(eq(seatingChanges.eventId, s.eventId))
      .orderBy(desc(seatingChanges.id))
      .limit(2);
    expect(hist.map((h) => h.action)).toEqual(["undo", "unseat"]);
  });

  it("restore goes elsewhere (incremental) when the old table filled up meanwhile", async () => {
    const { s, cat, ana } = await setup();
    const row = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (f) => f.tableNo !== null && !f.seatLocked && f.rsvp !== "no" && f.categoryId === cat("dos"),
    )!;
    await svc.deleteFamily(db(), ana, row.id);
    // Fill the freed seats with a locked family on that table.
    const state = await loadSeatingState(db(), s.eventId);
    const used = state.families
      .filter((f) => f.tableNo === row.tableNo)
      .reduce((n, f) => n + (f.rsvp === "yes" ? (f.confirmed ?? 0) : f.rsvp === "no" ? 0 : f.expected), 0);
    const free = 12 - used;
    if (free > 0) {
      await db()
        .insert(families)
        .values({
          eventId: s.eventId,
          addedByMemberId: s.memberIds.ana,
          name: "Толтырушы",
          categoryId: cat("dos"),
          expectedCount: free,
          token: randomToken(),
          tableNo: row.tableNo,
          seatLocked: true,
          lockedByMemberId: s.memberIds.ana,
          seatSeq: 999,
        });
    }
    const r = await svc.restoreFamily(db(), ana, row.id);
    expect(r.ok).toBe(true);
    expect((await fam(row.id)).tableNo).not.toBe(row.tableNo);
  });
});

describe("sending and answers", () => {
  it("markSent sets sent_at only on «Иә» (first send kept); reminder sets reminded_at; wa_clicked is a metric", async () => {
    const { s, ana } = await setup();
    const row = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find((f) => !f.sentAt)!;
    await svc.waClicked(db(), ana, row.id, "invite");
    expect((await fam(row.id)).sentAt).toBeNull();
    const [log] = await db().select().from(activityLog).where(eq(activityLog.familyId, row.id));
    expect(log).toMatchObject({ kind: "wa_clicked", meta: { kind: "invite" } });

    const t1 = new Date("2026-10-11T10:00:00Z");
    await svc.markSent(db(), ana, row.id, "invite", t1);
    expect((await fam(row.id)).sentAt).toEqual(t1);
    await svc.markSent(db(), ana, row.id, "invite", new Date("2026-10-12T10:00:00Z"));
    expect((await fam(row.id)).sentAt).toEqual(t1);
    const t3 = new Date("2026-10-13T10:00:00Z");
    await svc.markSent(db(), ana, row.id, "reminder", t3);
    const after = await fam(row.id);
    expect(after.remindedAt).toEqual(t3);
    expect(after.sentAt).toEqual(t1);
  });

  it("answer by phone goes through setRsvp: answered_by member; «no» frees the seat; revert restores", async () => {
    const { s, ana } = await setup();
    const row = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (f) => f.rsvp === "pending" && f.tableNo !== null && !f.seatLocked,
    )!;
    const v0 = await version(s.eventId);
    const no = await svc.recordAnswerByMember(db(), ana, { familyId: row.id, attending: false });
    expect(no.ok).toBe(true);
    let r = await fam(row.id);
    expect(r).toMatchObject({ rsvp: "no", answeredBy: "member", answeredByMemberId: s.memberIds.ana, tableNo: null });
    expect(await version(s.eventId)).toBe(v0 + 1);

    await svc.revertAnswer(db(), ana, { familyId: row.id, previous: { rsvp: "pending", confirmed: null } });
    r = await fam(row.id);
    expect(r.rsvp).toBe("pending");
    expect(r.answeredBy).toBeNull();
    expect(r.tableNo).not.toBeNull();

    const yes = await svc.recordAnswerByMember(db(), ana, { familyId: row.id, attending: true, seats: 2 });
    expect(yes.ok).toBe(true);
    r = await fam(row.id);
    expect(r).toMatchObject({ rsvp: "yes", confirmedCount: 2 });
    expect(await svc.recordAnswerByMember(db(), ana, { familyId: row.id, attending: true, seats: 21 })).toEqual({
      ok: false,
      field: "seatsRange",
    });
  });
});

describe("categories and the read model", () => {
  it("createCategory: after a category shifts the ranks below (deferrable unique), duplicates refused", async () => {
    const { s, cat, ana } = await setup();
    const r = await svc.createCategory(db(), ana, {
      eventId: s.eventId,
      labelKk: "Ауылдастар",
      labelRu: null,
      afterCategoryId: cat("synyp"),
    });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const cats = await db().select().from(categories).where(eq(categories.eventId, s.eventId));
    const rank = (id: string) => cats.find((c) => c.id === id)!.seatingRank;
    expect(rank(r.category.id)).toBe(rank(cat("synyp")) + 1);
    expect(rank(cat("baska"))).toBe(rank(r.category.id) + 1);
    expect(r.category.isCustom).toBe(true);
    expect(
      await svc.createCategory(db(), ana, { eventId: s.eventId, labelKk: "ауылдастар", afterCategoryId: null }),
    ).toEqual({ ok: false, field: "exists" });
    expect(await svc.createCategory(db(), ana, { eventId: s.eventId, labelKk: " ", afterCategoryId: null })).toEqual({
      ok: false,
      field: "required",
    });
  });

  it("guestsData: own list by default, other lists with counts, unknown list id falls back", async () => {
    const { s, ana } = await setup();
    const m = {
      memberId: s.memberIds.ana,
      eventId: s.eventId,
      role: "editor" as const,
      canEditSeating: true,
      canManageBudget: true,
      label: "Анасы",
    };
    void ana;
    const d = await guestsData(db(), m, { locale: "kk", appUrl: "http://localhost:3100" });
    expect(d.list).toEqual({ memberId: s.memberIds.ana, own: true });
    expect(d.guests.every((g) => g.memberId === s.memberIds.ana)).toBe(true);
    expect(d.members.map((x) => x.listName)).toEqual(["Әкесінің тізімі", "Анасының тізімі", "Жастардың тізімі"]);
    expect(d.members.reduce((n, x) => n + x.families, 0)).toBe(65);
    const other = await guestsData(db(), m, { listMemberId: s.memberIds.ake, locale: "ru", appUrl: "x" });
    expect(other.list.own).toBe(false);
    expect(other.members[0]!.listName).toBe("Список папы");
    const bad = await guestsData(db(), m, { listMemberId: "nope", locale: "kk", appUrl: "x" });
    expect(bad.list.own).toBe(true);
  });

  it("withSeating without seat changes writes no history and keeps the version", async () => {
    const { s } = await setup();
    const v0 = await version(s.eventId);
    const out = await withSeating(db(), s.eventId, { kind: "system", memberId: null }, async ({ state }) => ({
      result: { state, deltas: [], warnings: [] },
      action: "auto_place",
      summary: {},
      value: 1,
    }));
    expect(out).toMatchObject({ seatingVersion: v0, changes: [], value: 1 });
    expect(out.historyId).toBeUndefined();
  });
});
