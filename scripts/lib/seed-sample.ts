/**
 * Seeds (plan 11.5) from the shared fixture tests/fixtures/sample-event.ts (also the Ф7a golden test).
 * Demo numbers +7700000000X — local and preview only.
 */
import { eq } from "drizzle-orm";
import { presets } from "@/domain/invitations/presets";
import { fullReseat, type SeatingState } from "@/domain/seating";
import { buildDiff } from "@/domain/seating/undo";
import { messagesByLocale } from "@/i18n/messages";
import { defaultRights } from "@/server/auth/access";
import { defaultCategories } from "@/server/categories";
import { randomToken } from "@/server/crypto";
import type { Db } from "@/server/db";
import {
  allowedOwners,
  categories,
  eventMembers,
  events,
  families,
  hallTables,
  seatingChanges,
  users,
} from "@/server/schema";
import { sampleEvent, sampleFamilies } from "../../tests/fixtures/sample-event";

const DAY = 86_400_000;

/** Demo member phones (plan 11.5): Әкесі = owner. */
export const DEMO_PHONES = { ake: "+77000000001", ana: "+77000000002", jas: "+77000000003" } as const;
export const EMPTY_OWNER_PHONE = "+77000000009";

const KIND_BY_MEMBER = { ake: "parent", ana: "parent", jas: "couple" } as const;

export function assertNotProduction(): void {
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Seeds with demo numbers are for local and preview only (VERCEL_ENV=production).");
  }
}

/** Remove events of a demo owner (idempotent re-seed). */
async function dropOwnerEvents(db: Db, phone: string): Promise<void> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (u) await db.delete(events).where(eq(events.ownerId, u.id));
}

export type SeededSample = {
  eventId: string;
  memberIds: Record<"ake" | "ana" | "jas", string>;
  familyIds: Map<string, string>;
};

/**
 * «Айбек пен Дана» (design_spec 5.2): 3 members, 8 categories, 65 families, hall 4 × 16 × 12,
 * locks on tables 7 and 12, seating = full re-seat 6.1 (golden), history h1–h6.
 */
export async function seedSample(db: Db, now: Date = new Date()): Promise<SeededSample> {
  assertNotProduction();
  await dropOwnerEvents(db, DEMO_PHONES.ake);

  return db.transaction(async (tx) => {
    await tx.insert(allowedOwners).values({ phone: DEMO_PHONES.ake, note: "demo seed" }).onConflictDoNothing();
    const [owner] = await tx
      .insert(users)
      .values({ phone: DEMO_PHONES.ake, name: "Серік", locale: "kk" })
      .onConflictDoUpdate({ target: users.phone, set: { name: "Серік" } })
      .returning({ id: users.id });

    const hall = sampleEvent.hall;
    const startsOn = sampleEvent.date;
    const [ev] = await tx
      .insert(events)
      .values({
        ownerId: owner!.id,
        kind: sampleEvent.kind,
        title: sampleEvent.title,
        startsOn,
        startsAt: sampleEvent.time,
        tz: sampleEvent.timeZone,
        venueName: sampleEvent.venue,
        venueAddress: "Атырау қ., Абай даңғылы, 15",
        mapUrl: "https://2gis.kz/atyrau",
        hostsLine: "Серік — Гүлжан",
        templateId: "ak-shanyrak",
        // Ф5: a ready text from content/invitation-presets.json (А6: no names inside).
        invitationTextKk: presets("uilenu_toi", "kk")[0]!.text,
        invitationTextRu: presets("uilenu_toi", "ru")[0]!.text,
        hallColumns: hall.columns,
        tablesCount: hall.tables,
        seatsPerTable: hall.seatsPerTable,
        doorToken: randomToken(),
        seatingVersion: 6,
        purgeAfter: new Date(new Date(`${startsOn}T00:00:00Z`).getTime() + 90 * DAY).toISOString().slice(0, 10),
      })
      .returning({ id: events.id });
    const eventId = ev!.id;

    await tx
      .insert(hallTables)
      .values(Array.from({ length: hall.tables }, (_, i) => ({ eventId, no: i + 1, capacity: hall.seatsPerTable })));

    const cats = await tx
      .insert(categories)
      .values(defaultCategories().map((c) => ({ ...c, eventId })))
      .returning({ id: categories.id, code: categories.code });
    const catId = new Map(cats.map((c) => [c.code!, c.id]));

    const memberIds = {} as Record<"ake" | "ana" | "jas", string>;
    for (const m of sampleEvent.members) {
      const kind = KIND_BY_MEMBER[m.id];
      const [row] = await tx
        .insert(eventMembers)
        .values({
          eventId,
          userId: m.id === "ake" ? owner!.id : null,
          phone: DEMO_PHONES[m.id],
          role: m.id === "ake" ? "owner" : "editor",
          label: m.label,
          memberKind: kind,
          ...defaultRights(kind),
          defaultCategoryId: catId.get(m.defaultCategoryId)!,
          invitedAt: new Date(now.getTime() - 10 * DAY),
          joinedAt: m.id === "ake" ? new Date(now.getTime() - 10 * DAY) : null,
        })
        .returning({ id: eventMembers.id });
      memberIds[m.id] = row!.id;
    }

    // Seating = full re-seat on the fixture (identical to the Ф7a golden test).
    const state: SeatingState = {
      hall: { columns: hall.columns, tables: hall.tables, seatsPerTable: hall.seatsPerTable },
      categories: sampleEvent.categories.map((c) => ({ id: c.id, rank: c.rank })),
      families: sampleFamilies.map((f) => ({
        id: f.id,
        categoryId: f.categoryId,
        rsvp: f.rsvp,
        expected: f.expected,
        confirmed: f.confirmed,
        tableNo: f.tableNo,
        locked: f.locked,
        lockedBy: f.lockedBy,
        seq: f.seq,
      })),
    };
    const seated = new Map(fullReseat(state).state.families.map((f) => [f.id, f]));

    const rows = await tx
      .insert(families)
      .values(
        sampleFamilies.map((f) => {
          const s = seated.get(f.id)!;
          const answered = f.rsvp !== "pending";
          return {
            eventId,
            addedByMemberId: memberIds[f.memberId],
            name: f.name,
            phone: f.phone,
            categoryId: catId.get(f.categoryId)!,
            expectedCount: f.expected,
            rsvp: f.rsvp,
            confirmedCount: f.confirmed,
            respondedAt: answered ? new Date(now.getTime() - 2 * DAY) : null,
            answeredBy: answered ? ("guest" as const) : null,
            tableNo: s.tableNo,
            seatLocked: s.locked,
            lockedByMemberId: s.locked ? memberIds.ana : null,
            seatSeq: f.seq,
            token: randomToken(),
            sentAt: f.sentDaysAgo === null ? null : new Date(now.getTime() - f.sentDaysAgo * DAY),
          };
        }),
      )
      .returning({ id: families.id, name: families.name });
    const byName = new Map(rows.map((r) => [r.name, r.id]));
    if (byName.size !== sampleFamilies.length) throw new Error("fixture family names must be unique");
    const familyIds = new Map(sampleFamilies.map((f) => [f.id, byName.get(f.name)!]));

    // History h1–h6 (design_spec 5.2): manual moves by Анасы and one guest answer.
    const fid = (id: string) => familyIds.get(id)!;
    const move = (ids: string[], from: number, to: number) => ({
      families: ids.map((id) => ({
        id: fid(id),
        before: { tableNo: null, locked: false, lockedBy: null },
        after: { tableNo: to, locked: true, lockedBy: memberIds.ana },
      })),
      _from: from,
    });
    const nameOf = (id: string) => sampleFamilies.find((f) => f.id === id)!.name;
    const at = (daysAgo: number, hh: number, mm: number) => {
      const d = new Date(now.getTime() - daysAgo * DAY);
      d.setUTCHours(hh - 5, mm, 0, 0); // Asia/Almaty = UTC+5
      return d;
    };
    const history = [
      { ids: ["f31"], from: 8, to: 7, at: at(1, 14, 32) },
      { ids: ["f32"], from: 10, to: 7, at: at(1, 14, 33) },
      { ids: ["f35"], from: 11, to: 7, at: at(1, 14, 35) },
      { ids: ["f40", "f39", "f38"], from: 13, to: 12, at: at(1, 15, 10) },
      { ids: ["f42", "f43"], from: 14, to: 12, at: at(1, 15, 12) },
    ];
    let version = 0;
    for (const h of history) {
      const { _from, ...diff } = move(h.ids, h.from, h.to);
      await tx.insert(seatingChanges).values({
        eventId,
        actorKind: "member",
        actorMemberId: memberIds.ana,
        action: "move",
        summary: { names: h.ids.map(nameOf), from: _from, to: h.to },
        diff,
        seatingVersionAfter: ++version,
        createdAt: h.at,
      });
    }
    await tx.insert(seatingChanges).values({
      eventId,
      actorKind: "guest",
      action: "answer",
      summary: { names: [nameOf("f40")], fromN: 3, toN: 4, warnTable: 12, warnN: 1 },
      diff: buildDiff(state, state),
      seatingVersionAfter: ++version,
      createdAt: at(0, 9, 15),
    });

    return { eventId, memberIds, familyIds };
  });
}

/** `seed-empty`: an empty event for the first-run check (owner only, default categories, no hall). */
export async function seedEmpty(db: Db): Promise<{ eventId: string }> {
  assertNotProduction();
  await dropOwnerEvents(db, EMPTY_OWNER_PHONE);
  return db.transaction(async (tx) => {
    await tx.insert(allowedOwners).values({ phone: EMPTY_OWNER_PHONE, note: "demo seed-empty" }).onConflictDoNothing();
    const [owner] = await tx
      .insert(users)
      .values({ phone: EMPTY_OWNER_PHONE, locale: "kk" })
      .onConflictDoUpdate({ target: users.phone, set: { locale: "kk" } })
      .returning({ id: users.id });
    const [ev] = await tx
      .insert(events)
      .values({
        ownerId: owner!.id,
        kind: "uilenu_toi",
        title: "Сынақ той",
        startsOn: "2026-12-20",
        doorToken: randomToken(),
      })
      .returning({ id: events.id });
    await tx.insert(categories).values(defaultCategories().map((c) => ({ ...c, eventId: ev!.id })));
    await tx.insert(eventMembers).values({
      eventId: ev!.id,
      userId: owner!.id,
      phone: EMPTY_OWNER_PHONE,
      role: "owner",
      label: messagesByLocale.kk.roles.owner,
      memberKind: "parent",
      ...defaultRights("parent"),
    });
    return { eventId: ev!.id };
  });
}
