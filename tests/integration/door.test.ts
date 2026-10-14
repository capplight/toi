import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Principal } from "@/server/auth/access";
import { NotFoundError } from "@/server/auth/access";
import { db } from "@/server/db";
import { DOOR_OPS_PER_HOUR, doorOpened, doorSnapshot, recordCheckins } from "@/server/door/service";
import { rotateDoorToken } from "@/server/events/service";
import { hit } from "@/server/ratelimit";
import { doorCheckins, eventMembers, events, families, users } from "@/server/schema";
import { sha256Hex } from "@/server/crypto";
import { markTableSent, restartTableQueue, setShowTableNumbers, tableQueueView } from "@/server/tableQueue/service";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

beforeEach(resetDb);
const NOW = new Date("2026-11-15T12:00:00Z");

async function setup() {
  const s = await seedSample(db(), new Date("2026-10-11T08:00:00Z"));
  const [ev] = await db().select({ token: events.doorToken }).from(events).where(eq(events.id, s.eventId));
  const [u] = await db().select({ id: users.id }).from(users).where(eq(users.phone, DEMO_PHONES.ake));
  const owner: Principal = { userId: u!.id, scope: "all", sessionId: "n/a" };
  return { s, token: ev!.token, owner };
}

const op = (familyId: string, arrived: boolean, clientAt: string) => ({ opId: randomUUID(), familyId, arrived, clientAt });

describe("Ф8 door helper: snapshot", () => {
  it("all families, no phones, tables and categories; first open is remembered for the guest page hint", async () => {
    const { s, token } = await setup();
    expect(await doorOpened(db(), s.eventId)).toBe(false);
    const snap = await doorSnapshot(db(), token, { locale: "kk", now: NOW });
    expect(snap.families).toHaveLength(65);
    expect(JSON.stringify(snap)).not.toMatch(/\+7\d{10}|phone/);
    const erlan = snap.families.find((f) => f.name === "Ерлан ағай отбасы")!;
    expect(erlan).toMatchObject({ tableNo: expect.any(Number), seats: 4, categoryLabel: "Нағашылар", rsvp: "yes" });
    expect(await doorOpened(db(), s.eventId)).toBe(true);
  });

  it("unknown or rotated token → 404 (NotFoundError)", async () => {
    const { s, token, owner } = await setup();
    await expect(doorSnapshot(db(), "x".repeat(22), { locale: "kk" })).rejects.toBeInstanceOf(NotFoundError);
    await rotateDoorToken(db(), owner, s.eventId);
    await expect(doorSnapshot(db(), token, { locale: "kk" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordCheckins(db(), token, { deviceId: "device-01", ops: [] })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("Ф8 door helper: «Келді» marks", () => {
  it("idempotent by opId; arrived_at set; unmark clears", async () => {
    const { s, token } = await setup();
    const fam = s.familyIds.get("f30")!;
    const o = op(fam, true, "2026-11-15T13:00:00.000Z");
    const r1 = await recordCheckins(db(), token, { deviceId: "device-01", ops: [o] }, NOW);
    const r2 = await recordCheckins(db(), token, { deviceId: "device-01", ops: [o] }, NOW);
    expect(r1).toEqual(r2);
    expect(r1.ok && r1.arrivals).toEqual([{ familyId: fam, arrivedAt: "2026-11-15T13:00:00.000Z" }]);
    expect((await db().select().from(doorCheckins)).length).toBe(1);
    await recordCheckins(db(), token, { deviceId: "device-01", ops: [op(fam, false, "2026-11-15T13:01:00.000Z")] }, NOW);
    const [f] = await db().select({ a: families.arrivedAt }).from(families).where(eq(families.id, fam));
    expect(f!.a).toBeNull();
  });

  it("two devices: the later clientAt wins whatever order they sync in", async () => {
    const { s, token } = await setup();
    const fam = s.familyIds.get("f31")!;
    // device B (later: unmark) syncs first, device A (earlier: mark) syncs after
    await recordCheckins(db(), token, { deviceId: "device-B", ops: [op(fam, false, "2026-11-15T13:05:00.000Z")] }, NOW);
    const r = await recordCheckins(
      db(),
      token,
      { deviceId: "device-A", ops: [op(fam, true, "2026-11-15T13:00:00.000Z")] },
      NOW,
    );
    expect(r.ok && r.arrivals.find((a) => a.familyId === fam)).toBeUndefined();
    // and the other way round for another family
    const fam2 = s.familyIds.get("f32")!;
    await recordCheckins(db(), token, { deviceId: "device-B", ops: [op(fam2, true, "2026-11-15T13:05:00.000Z")] }, NOW);
    const r2 = await recordCheckins(
      db(),
      token,
      { deviceId: "device-A", ops: [op(fam2, false, "2026-11-15T13:00:00.000Z")] },
      NOW,
    );
    expect(r2.ok && r2.arrivals.find((a) => a.familyId === fam2)?.arrivedAt).toBe("2026-11-15T13:05:00.000Z");
  });

  it("families of another event are ignored; 600 per hour per token → rateLimited", async () => {
    const { s, token } = await setup();
    const r = await recordCheckins(
      db(),
      token,
      { deviceId: "device-01", ops: [op(randomUUID(), true, "2026-11-15T13:00:00.000Z")] },
      NOW,
    );
    expect(r).toEqual({ ok: true, arrivals: [] });
    for (let i = 0; i < DOOR_OPS_PER_HOUR; i++)
      await hit(db(), { key: `door:${sha256Hex(token)}`, windowSec: 3600, max: DOOR_OPS_PER_HOUR }, NOW);
    const fam = s.familyIds.get("f30")!;
    expect(
      await recordCheckins(db(), token, { deviceId: "device-01", ops: [op(fam, true, "2026-11-15T13:00:00.000Z")] }, NOW),
    ).toEqual({ ok: false, error: "rateLimited" });
  });
});

describe("Ф8 table-number queue", () => {
  it("only seated families (not «no»), by table then name; resume from the first without table_sent_at; restart", async () => {
    const { s, owner } = await setup();
    const v = await tableQueueView(db(), owner, s.eventId, { locale: "kk", appUrl: "https://toi.test" });
    expect(v.items.length).toBeGreaterThan(50);
    const tables = v.items.map((i) => i.tableNo);
    expect(tables).toEqual([...tables].sort((a, b) => a - b));
    expect(v.items.every((i) => i.sentAt === null)).toBe(true);
    await markTableSent(db(), owner, v.items[0]!.id, NOW);
    await markTableSent(db(), owner, v.items[1]!.id, NOW);
    const v2 = await tableQueueView(db(), owner, s.eventId, { locale: "kk", appUrl: "https://toi.test" });
    expect(v2.items.findIndex((i) => !i.sentAt)).toBe(2);
    await restartTableQueue(db(), owner, s.eventId);
    const v3 = await tableQueueView(db(), owner, s.eventId, { locale: "kk", appUrl: "https://toi.test" });
    expect(v3.items.every((i) => !i.sentAt)).toBe(true);
  });

  it("«Жастар» (no seating right) gets 403; only the owner switches show_table_numbers", async () => {
    const { s } = await setup();
    const [u] = await db().insert(users).values({ phone: DEMO_PHONES.jas }).returning({ id: users.id });
    await db().update(eventMembers).set({ userId: u!.id }).where(eq(eventMembers.id, s.memberIds.jas));
    const jas: Principal = { userId: u!.id, scope: "all", sessionId: "n/a" };
    await expect(tableQueueView(db(), jas, s.eventId, { locale: "kk", appUrl: "x" })).rejects.toThrow();
    await expect(setShowTableNumbers(db(), jas, s.eventId, true)).rejects.toThrow();
  });
});
