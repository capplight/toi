import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "@/server/auth/access";
import { ForbiddenError } from "@/server/auth/access";
import { db } from "@/server/db";
import { answerAsGuest, pingGuest } from "@/server/invite/guest";
import { eventMembers, events, families, users } from "@/server/schema";
import { pollState, seatingVersion, summaryView } from "@/server/summary/queries";
import { addDemoActivity, DEMO_PHONES, EMPTY_OWNER_PHONE, seedEmpty, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

beforeEach(resetDb);

const NOW = new Date("2026-10-11T08:00:00Z");

async function principal(phone: string, memberId?: string): Promise<Principal> {
  const [u] = await db()
    .insert(users)
    .values({ phone })
    .onConflictDoUpdate({ target: users.phone, set: { phone } })
    .returning({ id: users.id });
  if (memberId) await db().update(eventMembers).set({ userId: u!.id }).where(eq(eventMembers.id, memberId));
  return { userId: u!.id, scope: "all", sessionId: "n/a" };
}

describe("summaryView (Ф6) on the seed — design_spec 5.2", () => {
  it("restaurant 173 → 15, tiles 53/150 · 9/~23 (2 not sent) · 3, categories add up to 173, funnel and lists for the owner", async () => {
    const s = await seedSample(db(), NOW);
    const v = await summaryView(db(), await principal(DEMO_PHONES.ake), s.eventId, { locale: "kk" });
    expect(v.empty).toBe(false);
    expect(v.restaurant).toEqual({ people: 173, tables: 15 });
    expect(v.tiles).toEqual({
      yes: { families: 53, seats: 150 },
      pending: { families: 9, seats: 23, notSent: 2 },
      no: { families: 3 },
    });
    // by category: seating-rank order, seats to plan for, all add up to the restaurant number
    expect(v.byCategory.map((c) => c.code)).toEqual([
      "kuda",
      "oz",
      "nagashy",
      "dos",
      "ariptes",
      "korshi",
      "synyp",
      "baska",
    ]);
    expect(v.byCategory.reduce((n, c) => n + c.seats, 0)).toBe(173);
    expect(v.byCategory[0]).toMatchObject({ label: "Құдалар", seats: 28 });
    // funnel: 65 families, sent = has sent_at, answered = responded_at (incl. phone answers); nobody opened yet
    expect(v.funnel).toEqual({ total: 65, sent: expect.any(Number), opened: 0, answered: 56 });
    const sent = await db().select({ s: families.sentAt }).from(families).where(eq(families.eventId, s.eventId));
    expect(v.funnel!.sent).toBe(sent.filter((r) => r.s).length);
    // lists: Әкесі · Серік (owner, own list) / Анасы / Жастар — families and seats add up to the event
    expect(v.byList.map((l) => l.title)).toEqual(["Әкесі · Серік", "Анасы · Гүлжан", "Жастар · Айбек, Дана"]);
    expect(v.byList.reduce((n, l) => n + l.families, 0)).toBe(65);
    expect(v.byList.reduce((n, l) => n + l.seats, 0)).toBe(173);
    expect(v.byList[0]!.isMe).toBe(true);
    expect(v.budget).toBe(true);
    expect(v.version).toBe(await seatingVersion(db(), await principal(DEMO_PHONES.ake), s.eventId));
  });

  it("ru labels; «Жастар» (list only): no funnel, no budget card", async () => {
    const s = await seedSample(db(), NOW);
    const jas = await principal(DEMO_PHONES.jas, s.memberIds.jas);
    const v = await summaryView(db(), jas, s.eventId, { locale: "ru" });
    expect(v.funnel).toBeNull();
    expect(v.budget).toBe(false);
    expect(v.restaurant).toEqual({ people: 173, tables: 15 });
    expect(v.byCategory[0]!.label).toBe("Сваты");
    expect(v.byList.find((l) => l.isMe)!.title).toBe("Молодые · Айбек, Дана");
  });

  it("a stranger gets 403 (summary and version polling)", async () => {
    const s = await seedSample(db(), NOW);
    const stranger = await principal("+77019990000");
    await expect(summaryView(db(), stranger, s.eventId, { locale: "kk" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(seatingVersion(db(), stranger, s.eventId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("without a hall: only «N адам» (tables null); without guests: empty", async () => {
    const s = await seedSample(db(), NOW);
    await db().update(events).set({ hallColumns: null, tablesCount: null }).where(eq(events.id, s.eventId));
    const v = await summaryView(db(), await principal(DEMO_PHONES.ake), s.eventId, { locale: "kk" });
    expect(v.restaurant).toEqual({ people: 173, tables: null });

    const e = await seedEmpty(db());
    const w = await summaryView(db(), await principal(EMPTY_OWNER_PHONE), e.eventId, { locale: "kk" });
    expect(w).toMatchObject({
      empty: true,
      restaurant: { people: 0, tables: null },
      tiles: { yes: { families: 0, seats: 0 }, pending: { families: 0, seats: 0, notSent: 0 }, no: { families: 0 } },
      byCategory: [],
      funnel: { total: 0, sent: 0, opened: 0, answered: 0 },
    });
  });

  it("a guest answer grows the version, and the numbers follow", async () => {
    const s = await seedSample(db(), NOW);
    const ake = await principal(DEMO_PHONES.ake);
    const v0 = await summaryView(db(), ake, s.eventId, { locale: "kk" });
    const pending = (await db().select().from(families).where(eq(families.eventId, s.eventId))).find(
      (r) => r.rsvp === "pending" && r.sentAt,
    )!;
    expect(await answerAsGuest(db(), pending.token, { attending: false }, { now: NOW })).toMatchObject({ ok: true });
    const v1 = await summaryView(db(), ake, s.eventId, { locale: "kk" });
    expect(v1.version).toBe(v0.version + 1);
    expect(v1.tiles.no.families).toBe(v0.tiles.no.families + 1);
    expect(v1.tiles.pending.families).toBe(v0.tiles.pending.families - 1);
    expect(v1.restaurant.people).toBe(v0.restaurant.people - pending.expectedCount);
    expect(v1.funnel!.answered).toBe(v0.funnel!.answered + 1);
  });

  it("RA Л2: the version route also reports activity — an opening changes `activity`, not `version`", async () => {
    const s = await seedSample(db(), NOW);
    const ake = await principal(DEMO_PHONES.ake);
    const p0 = await pollState(db(), ake, s.eventId);
    expect(p0.activity).not.toBeNull();
    const [f] = await db().select().from(families).where(eq(families.eventId, s.eventId)).limit(1);
    const later = new Date(Date.now() + 60_000);
    await pingGuest(db(), f!.token, "opened", later);
    const p1 = await pollState(db(), ake, s.eventId);
    expect(p1.version).toBe(p0.version);
    expect(p1.activity).toBe(later.toISOString());
    expect((await summaryView(db(), ake, s.eventId, { locale: "kk" })).activity).toBe(later.toISOString());
  });

  it("RA Л7: demo activity — openings for most sent invitations, a few phone answers; the numbers of 5.2 stay", async () => {
    const s = await seedSample(db(), NOW);
    const d = await addDemoActivity(db(), s.eventId);
    const v = await summaryView(db(), await principal(DEMO_PHONES.ake), s.eventId, { locale: "kk" });
    expect(v.funnel!.opened).toBe(d.opened);
    expect(d.opened).toBeGreaterThan(45);
    expect(d.byPhone).toBeGreaterThan(0);
    expect(v.funnel!.answered).toBe(56);
    expect(v.funnel!.answered).toBeGreaterThan(v.funnel!.opened); // phone answers (summary.funnel.hint)
    expect(v.restaurant).toEqual({ people: 173, tables: 15 });
    expect(v.tiles.pending).toEqual({ families: 9, seats: 23, notSent: 2 });
  });
});
