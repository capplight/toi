import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { authorize, ForbiddenError, type Principal } from "@/server/auth/access";
import { consumeLink } from "@/server/auth/loginLinks";
import { createSession, validateSession } from "@/server/auth/session";
import { db } from "@/server/db";
import * as svc from "@/server/events/service";
import {
  allowedOwners,
  categories,
  eventMembers,
  events,
  hallTables,
  loginLinks,
  seatingChanges,
  users,
} from "@/server/schema";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const OWNER = "+77010000101";
const MOM = "+77020000202";
const ua = "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36";

const event = (over: Partial<svc.EventInput> = {}): svc.EventInput => ({
  kind: "uilenu_toi",
  title: "Айбек пен Дана",
  hostsLine: "Серік — Гүлжан",
  startsOn: "2026-11-15",
  startsAt: "18:00",
  venueName: "«Шаңырақ» мейрамханасы",
  venueAddress: "Атырау",
  mapUrl: "https://2gis.kz/x",
  invitationTextKk: "Шақырамыз",
  invitationTextRu: null,
  templateId: "ak-shanyrak",
  ...over,
});

async function owner(opts: { allowed?: boolean; scope?: "all" | "events" } = {}) {
  const [u] = await db().insert(users).values({ phone: OWNER, name: "Серік" }).returning({ id: users.id });
  if (opts.allowed !== false) await db().insert(allowedOwners).values({ phone: OWNER });
  const s = await createSession(db(), { userId: u!.id, method: "sms", scope: "all", userAgent: ua, now: new Date() });
  const who: Principal = { userId: u!.id, scope: opts.scope ?? "all", sessionId: s.id };
  return { userId: u!.id, who };
}

describe("createEvent (plan 6.2)", () => {
  it("403 for a link session (scope 'events') and for a phone outside allowed_owners", async () => {
    const a = await owner();
    await expect(svc.createEvent(db(), { ...a.who, scope: "events" }, event())).rejects.toBeInstanceOf(ForbiddenError);
    await db().delete(allowedOwners);
    await expect(svc.createEvent(db(), a.who, event())).rejects.toBeInstanceOf(ForbiddenError);
    expect(await svc.canCreateEvents(db(), a.who)).toBe("notAllowed");
    expect(await svc.canCreateEvents(db(), { ...a.who, scope: "events" })).toBe("needFullLogin");
    expect(await db().select().from(events)).toHaveLength(0);
  });

  it("one transaction: event, owner with full rights, 8 categories, door token, purge_after = date + 90", async () => {
    const a = await owner();
    const r = await svc.createEvent(db(), a.who, event());
    if (!r.ok) throw new Error(JSON.stringify(r));
    const [ev] = await db().select().from(events).where(eq(events.id, r.eventId));
    expect(ev).toMatchObject({
      title: "Айбек пен Дана",
      ownerId: a.userId,
      templateId: "ak-shanyrak",
      purgeAfter: "2027-02-13",
    });
    expect(ev!.doorToken).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(ev!.hallColumns).toBeNull();
    const cats = await db().select().from(categories).where(eq(categories.eventId, r.eventId));
    expect(cats.map((c) => c.code).sort()).toEqual([
      "ariptes",
      "baska",
      "dos",
      "korshi",
      "kuda",
      "nagashy",
      "oz",
      "synyp",
    ]);
    expect(cats.find((c) => c.code === "kuda")).toMatchObject({ labelKk: "Құдалар", labelRu: "Сваты", seatingRank: 1 });
    const [m] = await db().select().from(eventMembers).where(eq(eventMembers.eventId, r.eventId));
    expect(m).toMatchObject({
      role: "owner",
      userId: a.userId,
      canEditSeating: true,
      canManageBudget: true,
      displayName: "Серік",
    });
    await expect(authorize(db(), a.who, r.eventId, "owner")).resolves.toBeTruthy();
  });

  it("validation: title, https map link, time, text length; nothing is created", async () => {
    const a = await owner();
    expect(await svc.createEvent(db(), a.who, event({ title: " " }))).toEqual({ ok: false, field: "title" });
    expect(await svc.createEvent(db(), a.who, event({ mapUrl: "2gis.kz/x" }))).toEqual({ ok: false, field: "mapUrl" });
    expect(await svc.createEvent(db(), a.who, event({ startsAt: "25:00" }))).toEqual({ ok: false, field: "time" });
    expect(await svc.createEvent(db(), a.who, event({ invitationTextKk: "x".repeat(601) }))).toEqual({
      ok: false,
      field: "textKk",
    });
    expect(await db().select().from(events)).toHaveLength(0);
  });
});

describe("setupHall through the adapter", () => {
  it("writes the settings, hall_tables, a `hall` history record and a new seating version; limits checked", async () => {
    const a = await owner();
    const r = await svc.createEvent(db(), a.who, event());
    if (!r.ok) throw new Error("create");
    expect(
      await svc.setupHall(db(), a.who, { eventId: r.eventId, hall: { columns: 4, tables: 61, seatsPerTable: 12 } }),
    ).toEqual({
      ok: false,
      field: "hall",
    });
    expect(
      await svc.setupHall(db(), a.who, { eventId: r.eventId, hall: { columns: 4, tables: 16, seatsPerTable: 5 } }),
    ).toEqual({
      ok: false,
      field: "hall",
    });
    const h = await svc.setupHall(db(), a.who, {
      eventId: r.eventId,
      hall: { columns: 4, tables: 16, seatsPerTable: 12 },
    });
    expect(h).toEqual({ ok: true, seatingVersion: 1 });
    const [ev] = await db().select().from(events).where(eq(events.id, r.eventId));
    expect(ev).toMatchObject({ hallColumns: 4, tablesCount: 16, seatsPerTable: 12, seatingVersion: 1 });
    expect(await db().select().from(hallTables).where(eq(hallTables.eventId, r.eventId))).toHaveLength(16);
    const [rec] = await db().select().from(seatingChanges).where(eq(seatingChanges.eventId, r.eventId));
    expect(rec).toMatchObject({ action: "hall", seatingVersionAfter: 1 });
    expect((rec!.diff as { hall?: unknown }).hall).toBeTruthy();
    // smaller hall: extra tables removed
    await svc.setupHall(db(), a.who, {
      eventId: r.eventId,
      hall: { columns: 2, tables: 10, seatsPerTable: 10 },
      seatingVersion: 1,
    });
    expect(await db().select().from(hallTables).where(eq(hallTables.eventId, r.eventId))).toHaveLength(10);
    expect(
      await svc.setupHall(db(), a.who, {
        eventId: r.eventId,
        hall: { columns: 2, tables: 10, seatsPerTable: 10 },
        seatingVersion: 1,
      }),
    ).toEqual({ ok: false, conflict: "version" });
  });
});

describe("members", () => {
  async function withEvent() {
    const a = await owner();
    const r = await svc.createEvent(db(), a.who, event());
    if (!r.ok) throw new Error("create");
    return { ...a, eventId: r.eventId };
  }

  it("addMember: rights and category by «Кім?», login link with wa.me, duplicate phone refused; owner only", async () => {
    const o = await withEvent();
    const mom = await svc.addMember(db(), o.who, {
      eventId: o.eventId,
      phone: "702 000 02 02",
      who: "mother",
      name: "Гүлжан",
    });
    if (!mom.ok) throw new Error(JSON.stringify(mom));
    expect(mom.waUrl).toMatch(/^https:\/\/wa\.me\/77020000202\?text=.+%2Fjoin%2F[0-9A-Za-z]{22}$/);
    const couple = await svc.addMember(db(), o.who, { eventId: o.eventId, phone: "707 000 03 03", who: "couple" });
    const other = await svc.addMember(db(), o.who, {
      eventId: o.eventId,
      phone: "705 000 04 04",
      who: "other",
      customLabel: "Әпкесі",
    });
    expect(couple.ok && other.ok).toBe(true);
    const rows = await db().select().from(eventMembers).where(eq(eventMembers.eventId, o.eventId));
    const cats = await db().select().from(categories).where(eq(categories.eventId, o.eventId));
    const code = (id: string | null) => cats.find((c) => c.id === id)?.code;
    const byPhone = (p: string) => rows.find((r) => r.phone === p)!;
    expect(byPhone(MOM)).toMatchObject({
      label: "Анасы",
      memberKind: "parent",
      canEditSeating: true,
      canManageBudget: true,
      displayName: "Гүлжан",
    });
    expect(code(byPhone(MOM).defaultCategoryId)).toBe("nagashy");
    expect(byPhone("+77070000303")).toMatchObject({
      label: "Жастар",
      memberKind: "couple",
      canEditSeating: false,
      canManageBudget: false,
    });
    expect(code(byPhone("+77070000303").defaultCategoryId)).toBe("dos");
    expect(byPhone("+77050000404")).toMatchObject({ label: "Әпкесі", memberKind: "other", canEditSeating: false });
    expect(await svc.addMember(db(), o.who, { eventId: o.eventId, phone: "+7 702 000 02 02", who: "father" })).toEqual({
      ok: false,
      error: "alreadyMember",
    });
    expect(await svc.addMember(db(), o.who, { eventId: o.eventId, phone: "702 000", who: "father" })).toEqual({
      ok: false,
      field: "phone",
    });
    expect(
      await svc.addMember(db(), o.who, { eventId: o.eventId, phone: "701 111 22 33", who: "other", customLabel: " " }),
    ).toEqual({
      ok: false,
      field: "label",
    });
    // a member (not the owner) cannot add people
    const [momUser] = await db().insert(users).values({ phone: MOM }).returning({ id: users.id });
    await db().update(eventMembers).set({ userId: momUser!.id }).where(eq(eventMembers.phone, MOM));
    const momWho: Principal = { userId: momUser!.id, scope: "all", sessionId: "n/a" };
    await expect(
      svc.addMember(db(), momWho, { eventId: o.eventId, phone: "701 999 88 77", who: "other", customLabel: "X" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(svc.removeMember(db(), momWho, byPhone("+77070000303").id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("removeMember: the owner cannot be removed; removal closes the link session's access, guests stay", async () => {
    const o = await withEvent();
    const mom = await svc.addMember(db(), o.who, { eventId: o.eventId, phone: "702 000 02 02", who: "mother" });
    if (!mom.ok) throw new Error("add");
    const token = mom.url.split("/join/")[1]!;
    const joined = await consumeLink(db(), { token, ip: "10.0.0.1", userAgent: ua, locale: "kk", now: new Date() });
    if (!joined.ok) throw new Error("join");
    const s = (await validateSession(db(), joined.sessionToken, new Date()))!;
    await expect(authorize(db(), s, o.eventId, "member")).resolves.toBeTruthy();

    const [ownerRow] = await db()
      .select()
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, o.eventId), eq(eventMembers.role, "owner")));
    expect(await svc.removeMember(db(), o.who, ownerRow!.id)).toMatchObject({ ok: false, error: "ownerCannotRemove" });

    expect(await svc.removeMember(db(), o.who, mom.memberId)).toMatchObject({ ok: true });
    await expect(authorize(db(), s, o.eventId, "member")).rejects.toBeInstanceOf(ForbiddenError);
    const [row] = await db().select().from(eventMembers).where(eq(eventMembers.id, mom.memberId));
    expect(row!.removedAt).not.toBeNull();
  });

  it("members view: joined / notJoined (hours) / linkExpired; devices only from sessions with access to this event", async () => {
    const o = await withEvent();
    const now = new Date();
    const mom = await svc.addMember(
      db(),
      o.who,
      { eventId: o.eventId, phone: "702 000 02 02", who: "mother", name: "Гүлжан" },
      { locale: "kk", now },
    );
    const kid = await svc.addMember(
      db(),
      o.who,
      { eventId: o.eventId, phone: "707 000 03 03", who: "couple" },
      { locale: "kk", now },
    );
    const old = await svc.addMember(
      db(),
      o.who,
      { eventId: o.eventId, phone: "705 000 04 04", who: "other", customLabel: "Әпкесі" },
      { locale: "kk", now },
    );
    if (!mom.ok || !kid.ok || !old.ok) throw new Error("add");
    await db()
      .update(loginLinks)
      .set({ expiresAt: new Date(now.getTime() - 1000) })
      .where(eq(loginLinks.memberId, old.memberId));
    // Mom joins by the link (a session scoped to this event).
    const joined = await consumeLink(db(), {
      token: mom.url.split("/join/")[1]!,
      ip: "10.0.0.2",
      userAgent: ua,
      locale: "kk",
      now,
    });
    if (!joined.ok) throw new Error("join");
    // Mom also has a link session for ANOTHER event on an iPhone: never shown to this owner.
    const [momUser] = await db().select().from(users).where(eq(users.phone, MOM));
    const [otherOwner] = await db().insert(users).values({ phone: "+77019990001" }).returning({ id: users.id });
    const [other] = await db()
      .insert(events)
      .values({ ownerId: otherOwner!.id, kind: "merey", title: "B", startsOn: "2026-12-01", doorToken: "B".repeat(22) })
      .returning({ id: events.id });
    await createSession(db(), {
      userId: momUser!.id,
      method: "link",
      scope: "events",
      eventId: other!.id,
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile/15E148 Safari/604.1",
      now: new Date(now.getTime() + 60_000),
    });

    const view = await svc.membersView(db(), o.who, o.eventId, new Date(now.getTime() + 2 * 3_600_000));
    const by = (id: string) => view.find((v) => v.id === id)!;
    expect(view[0]!.role).toBe("owner");
    expect(by(mom.memberId)).toMatchObject({ label: "Анасы", name: "Гүлжан", phoneMasked: "+7 702 *** ** 02" });
    expect(by(mom.memberId).status).toMatchObject({ kind: "joined", device: "Android · Chrome" });
    expect(by(kid.memberId).status).toEqual({ kind: "notJoined", hoursLeft: 70 });
    expect(by(old.memberId).status).toEqual({ kind: "linkExpired" });
    await expect(
      svc.membersView(db(), { userId: momUser!.id, scope: "all", sessionId: "x" }, o.eventId),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("signOut removes only this event from the person's link sessions; rotateDoorToken changes the token", async () => {
    const o = await withEvent();
    const mom = await svc.addMember(db(), o.who, { eventId: o.eventId, phone: "702 000 02 02", who: "mother" });
    if (!mom.ok) throw new Error("add");
    const joined = await consumeLink(db(), {
      token: mom.url.split("/join/")[1]!,
      ip: "10.0.0.3",
      userAgent: ua,
      locale: "kk",
      now: new Date(),
    });
    if (!joined.ok) throw new Error("join");
    const r = await svc.signOutMember(db(), o.who, mom.memberId);
    expect(r.revoked).toBe(1);
    expect(await validateSession(db(), joined.sessionToken, new Date())).toBeNull();
    const [m] = await db()
      .select()
      .from(eventMembers)
      .where(and(eq(eventMembers.id, mom.memberId), isNull(eventMembers.removedAt)));
    expect(m).toBeTruthy(); // still a member: a new link brings her back
    const [before] = await db().select({ t: events.doorToken }).from(events).where(eq(events.id, o.eventId));
    await svc.rotateDoorToken(db(), o.who, o.eventId);
    const [after] = await db().select({ t: events.doorToken }).from(events).where(eq(events.id, o.eventId));
    expect(after!.t).not.toBe(before!.t);
  });
});
