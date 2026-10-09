import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  authorize,
  defaultRights,
  doorByToken,
  ForbiddenError,
  guestByToken,
  type Need,
  NotFoundError,
} from "@/server/auth/access";
import { db } from "@/server/db";
import { eventMembers, events, families, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

beforeEach(resetDb);

/**
 * Plan 5.3 matrix: authz function × role × action. Actions per plan 6.2–6.7 grouped by the check they use.
 * true = allowed, false = 403.
 */
const MATRIX: Record<Need, Record<"owner" | "parent" | "couple" | "stranger", boolean>> = {
  member: { owner: true, parent: true, couple: true, stranger: false }, // guests, summary, hall view
  seating: { owner: true, parent: true, couple: false, stranger: false }, // move, order, hall, full re-seat, undo
  budget: { owner: true, parent: true, couple: false, stranger: false }, // expenses (Р9)
  owner: { owner: true, parent: false, couple: false, stranger: false }, // settings, members, links, door, delete
};

async function setup() {
  const s = await seedSample(db());
  // Users for every member (as after login) + a stranger with a session-less user row.
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
  return { s, user: { owner: ids.ake!, parent: ids.ana!, couple: ids.jas!, stranger: ids.stranger! } };
}

describe("authz 403 matrix (plan 5.3)", () => {
  it("every function × role", async () => {
    const { s, user } = await setup();
    for (const need of Object.keys(MATRIX) as Need[]) {
      for (const role of Object.keys(MATRIX[need]) as (keyof (typeof MATRIX)["member"])[]) {
        const run = authorize(db(), user[role], s.eventId, need);
        if (MATRIX[need][role]) await expect(run, `${need} × ${role}`).resolves.toMatchObject({ eventId: s.eventId });
        else await expect(run, `${need} × ${role}`).rejects.toBeInstanceOf(ForbiddenError);
      }
    }
  });

  it("acceptance: «Тек тізім» → seating 403; «Жастар» → budget 403; stranger → event 403", async () => {
    const { s, user } = await setup();
    await expect(authorize(db(), user.couple, s.eventId, "seating")).rejects.toMatchObject({ status: 403 });
    await expect(authorize(db(), user.couple, s.eventId, "budget")).rejects.toMatchObject({ status: 403 });
    await expect(authorize(db(), user.stranger, s.eventId, "member")).rejects.toMatchObject({ status: 403 });
  });

  it("owner can grant rights: «Тек тізім» with can_edit_seating passes seating", async () => {
    const { s, user } = await setup();
    await db().update(eventMembers).set({ canEditSeating: true }).where(eq(eventMembers.id, s.memberIds.jas));
    await expect(authorize(db(), user.couple, s.eventId, "seating")).resolves.toBeTruthy();
  });

  it("removed member and deleted event → 403; unknown/garbage event id → 403 (no existence oracle)", async () => {
    const { s, user } = await setup();
    await db().update(eventMembers).set({ removedAt: new Date() }).where(eq(eventMembers.id, s.memberIds.ana));
    await expect(authorize(db(), user.parent, s.eventId, "member")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(authorize(db(), user.owner, "00000000-0000-0000-0000-000000000000", "member")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(authorize(db(), user.owner, "x' or 1=1 --", "member")).rejects.toBeInstanceOf(ForbiddenError);
    await db().update(events).set({ deletedAt: new Date() }).where(eq(events.id, s.eventId));
    await expect(authorize(db(), user.owner, s.eventId, "owner")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("default rights by member kind (Р9)", () => {
    expect(defaultRights("parent")).toEqual({ canEditSeating: true, canManageBudget: true });
    expect(defaultRights("couple")).toEqual({ canEditSeating: false, canManageBudget: false });
    expect(defaultRights("other")).toEqual({ canEditSeating: false, canManageBudget: false });
  });
});

describe("token access: guestByToken, doorByToken", () => {
  it("guest token finds the family; deleted family or event → 404; malformed → 404", async () => {
    const { s } = await setup();
    const [f] = await db()
      .select()
      .from(families)
      .where(eq(families.id, s.familyIds.get("f01")!));
    await expect(guestByToken(db(), f!.token)).resolves.toEqual({ familyId: f!.id, eventId: s.eventId });
    await expect(guestByToken(db(), "short")).rejects.toBeInstanceOf(NotFoundError);
    await db().update(families).set({ deletedAt: new Date() }).where(eq(families.id, f!.id));
    await expect(guestByToken(db(), f!.token)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("door token finds the event; deleted event → 404", async () => {
    const { s } = await setup();
    const [ev] = await db().select().from(events).where(eq(events.id, s.eventId));
    await expect(doorByToken(db(), ev!.doorToken)).resolves.toEqual({ eventId: s.eventId });
    await db().update(events).set({ deletedAt: new Date() }).where(eq(events.id, s.eventId));
    await expect(doorByToken(db(), ev!.doorToken)).rejects.toBeInstanceOf(NotFoundError);
    await expect(doorByToken(db(), "A".repeat(23))).rejects.toBeInstanceOf(NotFoundError);
  });
});
