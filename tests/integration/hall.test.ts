import { asc, desc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Principal } from "@/server/auth/access";
import { db } from "@/server/db";
import { setupHall } from "@/server/events/service";
import * as guests from "@/server/guests/service";
import { answerAsGuest } from "@/server/invite/guest";
import { loadSeatingState, SeatingContractError, withSeating } from "@/server/seating/adapter";
import * as hall from "@/server/seating/hall";
import { hallAttention, hallView, historyView } from "@/server/seating/view";
import { categories, eventMembers, events, families, seatingChanges, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

/**
 * Ф7b brief §4 integration: every hall action — access («Тек тізім» → 403), 409, history, `seating_version`;
 * full re-seat preview = apply at the same version; undo of move / order / hall / full re-seat incl. partial;
 * `reverted_by`; no «Қайтару» for `categoryAdded` and guest answers; the adapter guard.
 */
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
  const f = (key: string) => s.familyIds.get(key)!;
  return { s, f, owner: all(ids.ake!), ana: all(ids.ana!), jas: all(ids.jas!), stranger: all(ids.stranger!) };
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
const lastRecord = (eventId: string) =>
  db()
    .select()
    .from(seatingChanges)
    .where(eq(seatingChanges.eventId, eventId))
    .orderBy(desc(seatingChanges.id))
    .limit(1)
    .then((r) => r[0]!);
const record = (id: number) =>
  db()
    .select()
    .from(seatingChanges)
    .where(eq(seatingChanges.id, id))
    .then((r) => r[0]!);
const tables = async (eventId: string) =>
  Object.fromEntries((await loadSeatingState(db(), eventId)).families.map((x) => [x.id, x.tableNo]));
const order = async (eventId: string) =>
  (
    await db()
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.eventId, eventId))
      .orderBy(asc(categories.seatingRank))
  ).map((c) => c.id);

/** A family that is seated, unlocked and free to move to table 16 (empty in the seed). */
async function freeMover(eventId: string) {
  const st = await loadSeatingState(db(), eventId);
  return st.families.find((x) => x.tableNo === 1 && !x.locked)!;
}

describe("hall actions: access (plan 5.3, brief Ф7b §4)", () => {
  it("«Тек тізім» (Жастар) and a stranger get 403 on every seating action; Жастар can read the hall", async () => {
    const { s, f, jas, stranger } = await setup();
    const fam1 = await fam(f("f01"));
    const [rec] = await db().select().from(seatingChanges).where(eq(seatingChanges.eventId, s.eventId)).limit(1);
    for (const who of [jas, stranger]) {
      const calls = [
        () =>
          hall.moveFamily(db(), who, { familyId: fam1.id, toTableNo: 16, force: false, familyVersion: fam1.version }),
        () => hall.unlockFamily(db(), who, { familyId: fam1.id }),
        () => hall.reorderCategories(db(), who, { eventId: s.eventId, order: [], seatingVersion: 6 }),
        () => hall.previewFullReseat(db(), who, { eventId: s.eventId }),
        () => hall.applyFullReseat(db(), who, { eventId: s.eventId, seatingVersion: 6 }),
        () => hall.seatUnplaced(db(), who, { eventId: s.eventId }),
        () => hall.undoSeatingChange(db(), who, { changeId: rec!.id }),
        () => setupHall(db(), who, { eventId: s.eventId, hall: { columns: 4, tables: 17, seatsPerTable: 12 } }),
      ];
      for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await version(s.eventId)).toBe(6);
    const v = await hallView(db(), jas, s.eventId, { locale: "kk" });
    expect(v.canSeat).toBe(false);
    await expect(hallView(db(), stranger, s.eventId, { locale: "kk" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("hallView (numbers from the domain)", () => {
  it("seed: 173 / 192, 15 tables used, overflow at 7 and 12, one duplicate pair, ranges per category", async () => {
    const { s, owner } = await setup();
    const v = await hallView(db(), owner, s.eventId, { locale: "kk" });
    expect(v.canSeat).toBe(true);
    expect(v.totals).toMatchObject({ toSeat: 173, capacity: 192, free: 19, usedTables: 15 });
    expect(v.stats.overfull.map((t) => [t.no, t.missing])).toEqual([
      [7, 2],
      [12, 1],
    ]);
    expect(v.dups).toHaveLength(1);
    expect(v.categories[0]).toMatchObject({ code: "kuda", seats: 28, tables: "1–3" });
    expect(v.history.count).toBe(6);
    expect(v.history.recent[0]!.undo).toBe("guest");
    expect(v.history.recent[1]!.undo).toBe("seating");
    expect(v.grew).toBeNull(); // overflow at 7 and 12 comes from manual moves only
    expect(await hallAttention(db(), s.eventId)).toBe(true);
  });

  it("Р3: a seat count grows in place → the family is suggested for a free table", async () => {
    const { s, owner } = await setup();
    const m = await freeMover(s.eventId);
    const row = await fam(m.id);
    const seats = (row.confirmedCount ?? row.expectedCount) + 8;
    const r = await guests.updateFamily(db(), owner, {
      familyId: row.id,
      version: row.version,
      name: row.name,
      phone: row.phone,
      categoryId: row.categoryId,
      seats,
    });
    expect(r.ok).toBe(true);
    expect((await fam(row.id)).tableNo).toBe(1); // stays in place (Р3)
    const v = await hallView(db(), owner, s.eventId, { locale: "kk" });
    expect(v.grew).toMatchObject({ familyId: row.id, tableNo: 1, suggested: 16 });
    const warn = (await lastRecord(s.eventId)).summary as { warn?: { tableNo: number }[] };
    expect(warn.warn?.[0]?.tableNo).toBe(1);
    const moved = await hall.moveFamily(db(), owner, {
      familyId: row.id,
      toTableNo: 16,
      force: false,
      familyVersion: (await fam(row.id)).version,
      reason: "suggested",
    });
    expect(moved.ok).toBe(true);
    expect((await lastRecord(s.eventId)).summary).toMatchObject({ reason: "suggested", from: 1, to: 16 });
  });
});

describe("moveFamily", () => {
  it("moves and locks, version + 1, history `move`; others stay; a stale familyVersion → 409 with who/where", async () => {
    const { s, ana, owner } = await setup();
    const m = await freeMover(s.eventId);
    const row = await fam(m.id);
    const before = await tables(s.eventId);
    const r = await hall.moveFamily(db(), ana, {
      familyId: row.id,
      toTableNo: 16,
      force: false,
      familyVersion: row.version,
    });
    expect(r).toMatchObject({ ok: true, seatingVersion: 7, from: 1, to: 16 });
    const after = await fam(row.id);
    expect(after).toMatchObject({ tableNo: 16, seatLocked: true, version: row.version + 1 });
    const now = await tables(s.eventId);
    for (const [id, t] of Object.entries(before)) if (id !== row.id) expect(now[id]).toBe(t);
    const rec = await lastRecord(s.eventId);
    expect(rec).toMatchObject({ action: "move", seatingVersionAfter: 7 });
    expect(rec.summary).toMatchObject({ names: [row.name], from: 1, to: 16 });

    // father opened the hall before mother's move: his familyVersion is stale
    const stale = await hall.moveFamily(db(), owner, {
      familyId: row.id,
      toTableNo: 15,
      force: false,
      familyVersion: row.version,
    });
    expect(stale).toEqual({ ok: false, conflict: "moved", tableNo: 16, memberLabel: "Анасы" });
    expect(await version(s.eventId)).toBe(7);
  });

  it("a full table: no change without force (overflow), then «Бәрібір ауыстыру» overflows it with a warning", async () => {
    const { s, owner } = await setup();
    const m = await freeMover(s.eventId);
    const row = await fam(m.id);
    const r = await hall.moveFamily(db(), owner, {
      familyId: row.id,
      toTableNo: 3,
      force: false,
      familyVersion: row.version,
    });
    expect(r).toMatchObject({ ok: false, overflow: { missing: expect.any(Number) } });
    expect((await fam(row.id)).tableNo).toBe(1);
    expect(await version(s.eventId)).toBe(6);
    const forced = await hall.moveFamily(db(), owner, {
      familyId: row.id,
      toTableNo: 3,
      force: true,
      familyVersion: row.version,
    });
    expect(forced.ok).toBe(true);
    expect((await lastRecord(s.eventId)).summary).toMatchObject({ warn: [{ tableNo: 3 }] });
  });

  it("unknown table or a family with 0 seats → invalid, nothing written", async () => {
    const { s, f, owner } = await setup();
    const row = await fam(f("f01"));
    expect(
      await hall.moveFamily(db(), owner, { familyId: row.id, toTableNo: 40, force: true, familyVersion: row.version }),
    ).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(await version(s.eventId)).toBe(6);
  });
});

describe("unlockFamily", () => {
  it("the family stays at its table, lock removed, history `unlock`", async () => {
    const { s, f, owner } = await setup();
    const row = await fam(f("f31"));
    expect(row.seatLocked).toBe(true);
    const r = await hall.unlockFamily(db(), owner, { familyId: row.id });
    expect(r.ok).toBe(true);
    expect(await fam(row.id)).toMatchObject({ tableNo: row.tableNo, seatLocked: false, lockedByMemberId: null });
    expect((await lastRecord(s.eventId)).action).toBe("unlock");
  });
});

describe("reorderCategories (Р4)", () => {
  it("nobody moves, ranks saved, history `order`; stale version → 409; undo restores the order", async () => {
    const { s, owner } = await setup();
    const before = await tables(s.eventId);
    const o = await order(s.eventId);
    const next = [o[0]!, o[2]!, o[1]!, ...o.slice(3)];
    const r = await hall.reorderCategories(db(), owner, {
      eventId: s.eventId,
      order: next,
      seatingVersion: 6,
      movedCategoryId: o[2]!,
    });
    expect(r).toMatchObject({ ok: true, seatingVersion: 7 });
    expect(await order(s.eventId)).toEqual(next);
    expect(await tables(s.eventId)).toEqual(before);
    const rec = await lastRecord(s.eventId);
    expect(rec.action).toBe("reorder");
    expect(rec.summary).toEqual({ categoryId: o[2], from: 3, to: 2 });
    expect((rec.diff as { order: unknown }).order).toEqual({ before: o, after: next });

    expect(await hall.reorderCategories(db(), owner, { eventId: s.eventId, order: o, seatingVersion: 6 })).toEqual({
      ok: false,
      conflict: "version",
    });
    const u = await hall.undoSeatingChange(db(), owner, { changeId: rec.id });
    expect(u).toMatchObject({ ok: true, skipped: 0 });
    expect(await order(s.eventId)).toEqual(o);
  });

  it("«Жаңа санат» has no «Қайтару»; undoing an older order change keeps the new category last (no rank 0)", async () => {
    const { s, owner } = await setup();
    const o = await order(s.eventId);
    const next = [o[1]!, o[0]!, ...o.slice(2)];
    await hall.reorderCategories(db(), owner, { eventId: s.eventId, order: next, seatingVersion: 6 });
    const reorderRec = await lastRecord(s.eventId);
    const c = await guests.createCategory(db(), owner, {
      eventId: s.eventId,
      labelKk: "Жерлестер",
      afterCategoryId: o[1]!,
    });
    expect(c.ok).toBe(true);
    const addRec = await lastRecord(s.eventId);
    expect((addRec.summary as { reason: string }).reason).toBe("categoryAdded");
    expect(await hall.undoSeatingChange(db(), owner, { changeId: addRec.id })).toEqual({
      ok: false,
      reason: "notUndoable",
    });
    const h = await historyView(db(), owner, s.eventId);
    expect(h.entries.find((e) => e.id === addRec.id)!.undo).toBe("none");

    const u = await hall.undoSeatingChange(db(), owner, { changeId: reorderRec.id });
    expect(u.ok).toBe(true);
    const newId = c.ok ? c.category.id : "";
    expect(await order(s.eventId)).toEqual([...o, newId]);
  });
});

describe("full re-seat", () => {
  it("preview = apply at the same version; one record; stale → 409 with a fresh preview; undo restores everything", async () => {
    const { s, owner, ana } = await setup();
    // make the current seating differ from 6.1: move two families by hand, then unlock them
    for (const key of ["f01", "f02"]) {
      const row = await fam(s.familyIds.get(key)!);
      if (row.tableNo === null) continue;
      await hall.moveFamily(db(), owner, { familyId: row.id, toTableNo: 16, force: true, familyVersion: row.version });
      await hall.unlockFamily(db(), owner, { familyId: row.id });
    }
    const before = await tables(s.eventId);
    const p = await hall.previewFullReseat(db(), owner, { eventId: s.eventId });
    expect(p.moves.length).toBeGreaterThan(0);
    expect(p.locked).toBeGreaterThan(0);

    // another parent changes something → the preview is stale
    const m = await freeMover(s.eventId);
    const mr = await fam(m.id);
    await hall.unlockFamily(db(), ana, { familyId: (await fam(s.familyIds.get("f31")!)).id });
    const stale = await hall.applyFullReseat(db(), owner, { eventId: s.eventId, seatingVersion: p.seatingVersion });
    expect(stale).toMatchObject({ ok: false, conflict: "version" });
    const fresh = stale.ok ? null : (stale as { preview: hall.FullReseatPreview }).preview;
    expect(fresh!.seatingVersion).toBe(p.seatingVersion + 1);
    expect(mr).toBeDefined();

    const beforeApply = await tables(s.eventId);
    const r = await hall.applyFullReseat(db(), owner, { eventId: s.eventId, seatingVersion: fresh!.seatingVersion });
    expect(r).toMatchObject({ ok: true, count: fresh!.moves.length });
    const after = await tables(s.eventId);
    for (const mv of fresh!.moves) expect(after[mv.familyId]).toBe(mv.to);
    for (const [id, t] of Object.entries(beforeApply))
      if (!fresh!.moves.some((x) => x.familyId === id)) expect(after[id]).toBe(t);
    const rec = await lastRecord(s.eventId);
    expect(rec).toMatchObject({ action: "full_reseat", summary: { count: fresh!.moves.length } });

    const u = await hall.undoSeatingChange(db(), owner, { changeId: rec.id });
    expect(u).toMatchObject({ ok: true, skipped: 0 });
    expect(await tables(s.eventId)).toEqual(beforeApply);
    expect(before).toBeDefined();
  });

  it("partial undo: a family moved after the re-seat is skipped (count for `hall.history.partialUndo`)", async () => {
    const { s, owner } = await setup();
    const row = await fam(s.familyIds.get("f01")!);
    const other = await fam(s.familyIds.get("f02")!);
    for (const x of [row, other]) {
      await hall.moveFamily(db(), owner, { familyId: x.id, toTableNo: 16, force: true, familyVersion: x.version });
      await hall.unlockFamily(db(), owner, { familyId: x.id });
    }
    const v = await version(s.eventId);
    const r = await hall.applyFullReseat(db(), owner, { eventId: s.eventId, seatingVersion: v });
    expect(r.ok).toBe(true);
    const rec = await lastRecord(s.eventId);
    const movedBack = (rec.diff as { families: { id: string }[] }).families.find((x) => x.id === row.id);
    expect(movedBack).toBeDefined();
    const now = await fam(row.id);
    await hall.moveFamily(db(), owner, { familyId: row.id, toTableNo: 15, force: true, familyVersion: now.version });
    const u = await hall.undoSeatingChange(db(), owner, { changeId: rec.id });
    expect(u).toMatchObject({ ok: true, skipped: 1 });
    expect((await fam(row.id)).tableNo).toBe(15);
    expect((await fam(other.id)).tableNo).toBe(16); // restored to its state before the re-seat
  });
});

describe("undo, reverted_by, undo of undo", () => {
  it("undo of a move: back to `before`, original `reverted_by`, new `undo` record with `revert_of`; undo of the undo", async () => {
    const { s, owner } = await setup();
    const m = await freeMover(s.eventId);
    const row = await fam(m.id);
    const r = await hall.moveFamily(db(), owner, {
      familyId: row.id,
      toTableNo: 16,
      force: false,
      familyVersion: row.version,
    });
    const moveId = r.ok ? r.historyId! : 0;
    const u = await hall.undoSeatingChange(db(), owner, { changeId: moveId });
    expect(u).toMatchObject({ ok: true, skipped: 0 });
    expect(await fam(row.id)).toMatchObject({ tableNo: 1, seatLocked: false });
    const undoId = u.ok ? u.historyId! : 0;
    expect(await record(moveId)).toMatchObject({ revertedBy: undoId });
    expect(await record(undoId)).toMatchObject({ action: "undo", revertOf: moveId });
    expect(await hall.undoSeatingChange(db(), owner, { changeId: moveId })).toEqual({
      ok: false,
      reason: "alreadyReverted",
    });

    const h = await historyView(db(), owner, s.eventId);
    const orig = h.entries.find((e) => e.id === moveId)!;
    expect(orig.reverted).toMatchObject({ actorLabel: "Әкесі" });
    expect(orig.undo).toBe("none");
    expect(h.entries.find((e) => e.id === undoId)!.undo).toBe("seating");

    const uu = await hall.undoSeatingChange(db(), owner, { changeId: undoId });
    expect(uu.ok).toBe(true);
    expect(await fam(row.id)).toMatchObject({ tableNo: 16, seatLocked: true });
  });

  it("undo of a seed move (H7 «Қайтару»): the family returns to the table it came from", async () => {
    const { s, f, ana } = await setup();
    const recs = await db()
      .select()
      .from(seatingChanges)
      .where(eq(seatingChanges.eventId, s.eventId))
      .orderBy(asc(seatingChanges.id));
    const first = recs[0]!; // f31: 8 → 7
    const u = await hall.undoSeatingChange(db(), ana, { changeId: first.id });
    expect(u.ok).toBe(true);
    expect(await fam(f("f31"))).toMatchObject({ tableNo: 8, seatLocked: false });
  });

  it("undo of a hall change goes through the hall logic (rows of hall_tables and families)", async () => {
    const { s, owner } = await setup();
    const before = await tables(s.eventId);
    const r = await setupHall(db(), owner, {
      eventId: s.eventId,
      hall: { columns: 4, tables: 18, seatsPerTable: 12 },
      seatingVersion: 6,
    });
    expect(r.ok).toBe(true);
    const rec = await lastRecord(s.eventId);
    expect(rec.action).toBe("hall");
    const u = await hall.undoSeatingChange(db(), owner, { changeId: rec.id });
    expect(u.ok).toBe(true);
    const [ev] = await db().select().from(events).where(eq(events.id, s.eventId));
    expect(ev!.tablesCount).toBe(16);
    expect(await tables(s.eventId)).toEqual(before);
  });

  it("guest answers have no «Қайтару»; an answer by phone reverted via revertAnswer gets `reverted_by`", async () => {
    const { s, f, owner } = await setup();
    const fam2 = await fam(f("f02"));
    await answerAsGuest(db(), fam2.token, { attending: true, seats: 2 }, { now: new Date("2026-10-11T08:00:00Z") });
    const guestRec = await lastRecord(s.eventId);
    expect(guestRec.actorKind).toBe("guest");
    expect(await hall.undoSeatingChange(db(), owner, { changeId: guestRec.id })).toEqual({
      ok: false,
      reason: "notUndoable",
    });

    const a = await guests.recordAnswerByMember(db(), owner, { familyId: f("f03"), attending: false });
    if (!a.ok) throw new Error("answer failed");
    const h1 = await historyView(db(), owner, s.eventId);
    expect(h1.entries.find((e) => e.id === a.historyId)!.undo).toBe("answer");
    const rv = await guests.revertAnswer(db(), owner, { historyId: a.historyId });
    expect(rv.ok).toBe(true);
    const orig = await record(a.historyId);
    expect(orig.revertedBy).not.toBeNull();
    expect(await record(orig.revertedBy!)).toMatchObject({ action: "undo", revertOf: a.historyId });
    const h2 = await historyView(db(), owner, s.eventId);
    expect(h2.entries.find((e) => e.id === a.historyId)!.reverted).not.toBeNull();
  });
});

describe("seatUnplaced", () => {
  it("seats unplaced families into free seats (auto_place record), nothing to do → no version change", async () => {
    const { s, owner } = await setup();
    // shrink the hall so some families become unplaced, then grow tables' capacity back via a forced state
    await setupHall(db(), owner, { eventId: s.eventId, hall: { columns: 4, tables: 14, seatsPerTable: 12 } });
    const v1 = await hallView(db(), owner, s.eventId, { locale: "kk" });
    expect(v1.stats.unplaced.length).toBeGreaterThan(0);
    const v = await version(s.eventId);
    const r = await hall.seatUnplaced(db(), owner, { eventId: s.eventId });
    expect(r.seated).toBe(0); // no free table big enough after the hall change already tried
    expect(await version(s.eventId)).toBe(v);
  });
});

describe("withSeating guard", () => {
  it("a noop step with deltas throws and writes nothing", async () => {
    const { s, f } = await setup();
    const id = f("f01");
    await expect(
      withSeating(db(), s.eventId, { kind: "system", memberId: null }, async ({ state }) => {
        const fam1 = state.families.find((x) => x.id === id)!;
        const moved = { ...fam1, tableNo: 16 };
        return {
          result: {
            state: { ...state, families: state.families.map((x) => (x.id === id ? moved : x)) },
            deltas: [{ familyId: id, from: fam1.tableNo, to: 16, locked: false }],
            warnings: [],
          },
          action: "move" as const,
          summary: {},
          value: null,
          noop: true,
        };
      }),
    ).rejects.toBeInstanceOf(SeatingContractError);
    expect((await fam(id)).tableNo).not.toBe(16);
    expect(await version(s.eventId)).toBe(6);
  });
});
