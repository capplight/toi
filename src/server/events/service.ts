import { and, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { isKzMobile, maskPhone, normalizePhone } from "@/domain/guests/phone";
import { hasPlaceholder } from "@/domain/invitations/presets";
import { setupHall as engineSetupHall } from "@/domain/seating";
import type { Locale } from "@/i18n/config";
import { messagesByLocale } from "@/i18n/messages";
import { authorize, defaultRights, ForbiddenError, type Principal } from "../auth/access";
import { deviceLabel } from "../auth/device";
import { issueMemberLink, LinkLimitError } from "../auth/loginLinks";
import { revokeMemberEventAccess } from "../auth/session";
import { defaultCategories } from "../categories";
import { randomToken } from "../crypto";
import type { Db } from "../db";
import { allowedOwners, categories, eventMembers, events, loginLinks, sessionEvents, sessions, users } from "../schema";
import { withSeating, writeHallRows } from "../seating/adapter";

/**
 * Ф3: events and members (plan 6.2). Each function: authz → validation → transaction / adapter.
 * Expected outcomes are values; access errors throw `ForbiddenError` (403).
 */

export const EVENT_KINDS = ["uilenu_toi", "kyz_uzatu", "sundet", "besik", "merey", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];
export const TEMPLATE_IDS = ["ak-shanyrak", "kok-tun", "kyzgaldak"] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];
export const HALL_LIMITS = { tables: { min: 1, max: 60 }, seats: { min: 6, max: 16 } } as const;
const DAY = 86_400_000;
const HOUR = 3_600_000;

export type EventInput = {
  kind: EventKind;
  title: string;
  hostsLine?: string | null;
  startsOn: string; // YYYY-MM-DD
  startsAt?: string | null; // HH:MM
  venueName?: string | null;
  venueAddress?: string | null;
  mapUrl?: string | null;
  invitationTextKk?: string | null;
  invitationTextRu?: string | null;
  templateId: TemplateId;
};

export type EventField =
  "title" | "hostsLine" | "date" | "time" | "venueName" | "venueAddress" | "mapUrl" | "textKk" | "textRu";

const TEXT_MAX = 600;
const trimOrNull = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);

/** Validation shared by `createEvent` and `updateEvent`. */
export type EventInvalid = { ok: false; field: EventField; error?: "placeholderLeft" };

export function validateEvent(input: EventInput): { ok: true; value: EventInput } | EventInvalid {
  const title = input.title.trim();
  if (!title || title.length > 120) return { ok: false, field: "title" };
  const hostsLine = trimOrNull(input.hostsLine);
  if (hostsLine && hostsLine.length > 120) return { ok: false, field: "hostsLine" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn) || Number.isNaN(Date.parse(`${input.startsOn}T00:00:00Z`))) {
    return { ok: false, field: "date" };
  }
  const startsAt = trimOrNull(input.startsAt);
  if (startsAt && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startsAt)) return { ok: false, field: "time" };
  const venueName = trimOrNull(input.venueName);
  if (venueName && venueName.length > 120) return { ok: false, field: "venueName" };
  const venueAddress = trimOrNull(input.venueAddress);
  if (venueAddress && venueAddress.length > 200) return { ok: false, field: "venueAddress" };
  const mapUrl = trimOrNull(input.mapUrl);
  if (mapUrl && (!/^https:\/\/\S+$/.test(mapUrl) || mapUrl.length > 500)) return { ok: false, field: "mapUrl" };
  const kk = trimOrNull(input.invitationTextKk);
  if (kk && kk.length > TEXT_MAX) return { ok: false, field: "textKk" };
  // А6: a sample in [ ] left in the invitation text is never saved (it goes to every guest).
  if (hasPlaceholder(kk)) return { ok: false, field: "textKk", error: "placeholderLeft" };
  const ru = trimOrNull(input.invitationTextRu);
  if (ru && ru.length > TEXT_MAX) return { ok: false, field: "textRu" };
  if (hasPlaceholder(ru)) return { ok: false, field: "textRu", error: "placeholderLeft" };
  return {
    ok: true,
    value: {
      kind: input.kind,
      title,
      hostsLine,
      startsOn: input.startsOn,
      startsAt,
      venueName,
      venueAddress,
      mapUrl,
      invitationTextKk: kk,
      invitationTextRu: ru,
      templateId: input.templateId,
    },
  };
}

/** Who may create events (plan 6.2, pilot): a session with scope 'all' and the phone in `allowed_owners`. */
export async function canCreateEvents(db: Db, who: Principal): Promise<"ok" | "needFullLogin" | "notAllowed"> {
  if (who.scope !== "all") return "needFullLogin";
  const [u] = await db
    .select({ phone: users.phone, allowed: allowedOwners.phone })
    .from(users)
    .leftJoin(allowedOwners, eq(allowedOwners.phone, users.phone))
    .where(eq(users.id, who.userId));
  return u?.allowed ? "ok" : "notAllowed";
}

export type CreateEventResult = { ok: true; eventId: string } | EventInvalid;

/**
 * `createEvent` (plan 6.2): one transaction — the event, `door_token`, the owner in `event_members`
 * (full rights), 8 default categories (labels = `category.names.*` at creation time), `purge_after` = date + 90 days.
 */
export async function createEvent(
  db: Db,
  who: Principal,
  input: EventInput,
  opts: { locale: Locale; ownerName?: string | null } = { locale: "kk" },
): Promise<CreateEventResult> {
  if ((await canCreateEvents(db, who)) !== "ok") throw new ForbiddenError();
  const v = validateEvent(input);
  if (!v.ok) return v;
  const e = v.value;
  return db.transaction(async (tx) => {
    const [u] = await tx.select({ phone: users.phone, name: users.name }).from(users).where(eq(users.id, who.userId));
    if (!u) throw new ForbiddenError();
    const purge = new Date(Date.parse(`${e.startsOn}T00:00:00Z`) + 90 * DAY).toISOString().slice(0, 10);
    const [ev] = await tx
      .insert(events)
      .values({
        ownerId: who.userId,
        kind: e.kind,
        title: e.title,
        hostsLine: e.hostsLine,
        startsOn: e.startsOn,
        startsAt: e.startsAt,
        tz: "Asia/Almaty",
        venueName: e.venueName,
        venueAddress: e.venueAddress,
        mapUrl: e.mapUrl,
        invitationTextKk: e.invitationTextKk,
        invitationTextRu: e.invitationTextRu,
        defaultLocale: opts.locale,
        templateId: e.templateId,
        doorToken: randomToken(),
        purgeAfter: purge,
      })
      .returning({ id: events.id });
    const eventId = ev!.id;
    const cats = await tx
      .insert(categories)
      .values(defaultCategories().map((c) => ({ ...c, eventId })))
      .returning({ id: categories.id, code: categories.code });
    await tx.insert(eventMembers).values({
      eventId,
      userId: who.userId,
      phone: u.phone,
      role: "owner",
      label: messagesByLocale[opts.locale].roles.owner.slice(0, 30),
      displayName: trimOrNull(opts.ownerName ?? u.name)?.slice(0, 40) ?? null,
      memberKind: "parent",
      canEditSeating: true,
      canManageBudget: true,
      defaultCategoryId: cats.find((c) => c.code === "oz")?.id ?? null,
      invitedAt: new Date(),
      joinedAt: new Date(),
    });
    return { ok: true as const, eventId };
  });
}

export type UpdateEventResult =
  { ok: true; version: number } | { ok: false; field: EventField } | { ok: false; conflict: "version" };

/** `updateEvent` (plan 6.2): owner only, optimistic lock by `events.version` (409). */
export async function updateEvent(
  db: Db,
  who: Principal,
  input: { eventId: string; version: number; patch: EventInput },
): Promise<UpdateEventResult> {
  await authorize(db, who, input.eventId, "owner");
  const v = validateEvent(input.patch);
  if (!v.ok) return v;
  const e = v.value;
  const purge = new Date(Date.parse(`${e.startsOn}T00:00:00Z`) + 90 * DAY).toISOString().slice(0, 10);
  const [row] = await db
    .update(events)
    .set({
      kind: e.kind,
      title: e.title,
      hostsLine: e.hostsLine,
      startsOn: e.startsOn,
      startsAt: e.startsAt,
      venueName: e.venueName,
      venueAddress: e.venueAddress,
      mapUrl: e.mapUrl,
      invitationTextKk: e.invitationTextKk,
      invitationTextRu: e.invitationTextRu,
      templateId: e.templateId,
      purgeAfter: purge,
      version: sql`${events.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(events.id, input.eventId), eq(events.version, input.version), isNull(events.deletedAt)))
    .returning({ version: events.version });
  if (!row) return { ok: false, conflict: "version" };
  return { ok: true, version: row.version };
}

export type HallInput = { columns: 2 | 4; tables: number; seatsPerTable: number };

export function validateHallInput(h: HallInput): boolean {
  return (
    (h.columns === 2 || h.columns === 4) &&
    Number.isInteger(h.tables) &&
    h.tables >= HALL_LIMITS.tables.min &&
    h.tables <= HALL_LIMITS.tables.max &&
    Number.isInteger(h.seatsPerTable) &&
    h.seatsPerTable >= HALL_LIMITS.seats.min &&
    h.seatsPerTable <= HALL_LIMITS.seats.max
  );
}

/**
 * «Залды баптау» (wizard step 7, H1 in Ф7b): `setupHall` of the engine through `withSeating` (seating right).
 * The step writes the hall settings and `hall_tables` itself; seats of families come from the engine deltas.
 * `seatingVersion` — the version the form was opened with (409 if seating changed meanwhile).
 */
export async function setupHall(
  db: Db,
  who: Principal,
  input: { eventId: string; hall: HallInput; seatingVersion?: number },
): Promise<
  | { ok: true; seatingVersion: number; historyId: number | null }
  | { ok: false; field: "hall" }
  | { ok: false; conflict: "version" }
> {
  const m = await authorize(db, who, input.eventId, "seating");
  if (!validateHallInput(input.hall)) return { ok: false, field: "hall" };
  const h = input.hall;
  class Stale extends Error {}
  try {
    const out = await withSeating(
      db,
      input.eventId,
      { kind: "member", memberId: m.memberId },
      async ({ tx, state }) => {
        if (input.seatingVersion !== undefined) {
          const [ev] = await tx.select({ v: events.seatingVersion }).from(events).where(eq(events.id, input.eventId));
          if (ev!.v !== input.seatingVersion) throw new Stale();
        }
        // Tables beyond the new count: families there lose the table (FK on delete set null); the engine re-seats them.
        await writeHallRows(tx, input.eventId, h);
        const result = engineSetupHall(state, { columns: h.columns, tables: h.tables, seatsPerTable: h.seatsPerTable });
        return {
          result,
          action: "hall" as const,
          summary: { columns: h.columns, tables: h.tables, seatsPerTable: h.seatsPerTable },
          value: null,
          record: true,
        };
      },
    );
    return { ok: true, seatingVersion: out.seatingVersion, historyId: out.historyId ?? null };
  } catch (e) {
    if (e instanceof Stale) return { ok: false, conflict: "version" };
    throw e;
  }
}

/* ------------------------------------------------------------------ members */

export type WhoKind = "father" | "mother" | "couple" | "other";
export type MemberInput = {
  eventId: string;
  phone: string;
  who: WhoKind;
  customLabel?: string | null;
  name?: string | null;
  canEditSeating?: boolean;
  canManageBudget?: boolean;
  defaultCategoryId?: string | null;
};
export type MemberField = "phone" | "label" | "name" | "category";

/** «Кім?» → label, kind and rights by default (brief Ф3 §2, plan 5.3). */
export function memberDefaults(who: WhoKind, customLabel: string | null | undefined, locale: Locale) {
  const r = messagesByLocale[locale].roles;
  const kind = who === "father" || who === "mother" ? "parent" : who === "couple" ? "couple" : "other";
  const label =
    who === "father"
      ? r.father
      : who === "mother"
        ? r.mother
        : who === "couple"
          ? r.couple
          : (customLabel ?? "").trim();
  const category = who === "father" ? "oz" : who === "mother" ? "nagashy" : who === "couple" ? "dos" : "baska";
  return { kind, label, rights: defaultRights(kind), category } as const;
}

export type AddMemberResult =
  | { ok: true; memberId: string; waUrl: string; url: string }
  | { ok: false; field: MemberField }
  | { ok: false; error: "alreadyMember" | "linkLimit" };

/** `addMember` (plan 6.2): owner only; the login link is issued at once and its wa.me URL returned. */
export async function addMember(
  db: Db,
  who: Principal,
  input: MemberInput,
  opts: { locale: Locale; now?: Date } = { locale: "kk" },
): Promise<AddMemberResult> {
  await authorize(db, who, input.eventId, "owner");
  const phone = normalizePhone(input.phone);
  if (!phone || !isKzMobile(phone)) return { ok: false, field: "phone" };
  const d = memberDefaults(input.who, input.customLabel, opts.locale);
  if (!d.label || d.label.length > 30) return { ok: false, field: "label" };
  const name = trimOrNull(input.name);
  if (name && name.length > 40) return { ok: false, field: "name" };
  const cats = await db
    .select({ id: categories.id, code: categories.code })
    .from(categories)
    .where(eq(categories.eventId, input.eventId));
  const categoryId = input.defaultCategoryId ?? cats.find((c) => c.code === d.category)?.id ?? null;
  if (categoryId && !cats.some((c) => c.id === categoryId)) return { ok: false, field: "category" };
  const [dup] = await db
    .select({ id: eventMembers.id })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, input.eventId), eq(eventMembers.phone, phone)));
  if (dup) return { ok: false, error: "alreadyMember" };
  let memberId: string;
  try {
    const [row] = await db
      .insert(eventMembers)
      .values({
        eventId: input.eventId,
        phone,
        role: "editor",
        label: d.label,
        displayName: name,
        memberKind: d.kind,
        canEditSeating: input.canEditSeating ?? d.rights.canEditSeating,
        canManageBudget: input.canManageBudget ?? d.rights.canManageBudget,
        defaultCategoryId: categoryId,
      })
      .returning({ id: eventMembers.id });
    memberId = row!.id;
  } catch (e) {
    if (typeof e === "object" && e !== null && (e as { code?: string }).code === "23505") {
      return { ok: false, error: "alreadyMember" };
    }
    throw e;
  }
  try {
    const link = await issueMemberLink(db, { memberId, createdBy: who.userId, now: opts.now ?? new Date() });
    return { ok: true, memberId, waUrl: link.waUrl, url: link.url };
  } catch (e) {
    if (e instanceof LinkLimitError) return { ok: false, error: "linkLimit" };
    throw e;
  }
}

async function memberOf(db: Db, memberId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) throw new ForbiddenError();
  const [m] = await db.select().from(eventMembers).where(eq(eventMembers.id, memberId));
  if (!m) throw new ForbiddenError();
  return m;
}

/** `updateMember`: rights, default category, name (owner only; the owner's own role does not change). */
export async function updateMember(
  db: Db,
  who: Principal,
  input: {
    memberId: string;
    canEditSeating?: boolean;
    canManageBudget?: boolean;
    defaultCategoryId?: string | null;
    name?: string | null;
  },
) {
  const m = await memberOf(db, input.memberId);
  await authorize(db, who, m.eventId, "owner");
  if (m.role === "owner") return { ok: false as const, error: "owner" as const };
  const name = input.name === undefined ? undefined : trimOrNull(input.name);
  if (name && name.length > 40) return { ok: false as const, field: "name" as const };
  await db
    .update(eventMembers)
    .set({
      ...(input.canEditSeating === undefined ? {} : { canEditSeating: input.canEditSeating }),
      ...(input.canManageBudget === undefined ? {} : { canManageBudget: input.canManageBudget }),
      ...(input.defaultCategoryId === undefined ? {} : { defaultCategoryId: input.defaultCategoryId }),
      ...(name === undefined ? {} : { displayName: name }),
    })
    .where(eq(eventMembers.id, m.id));
  return { ok: true as const, eventId: m.eventId };
}

/**
 * «Тойдан алып тастау»: `removed_at`, unused login links revoked, the event removed from the person's
 * link sessions. The owner cannot be removed; guests they added stay (`added_by_member_id` unchanged).
 */
export async function removeMember(db: Db, who: Principal, memberId: string, now = new Date()) {
  const m = await memberOf(db, memberId);
  await authorize(db, who, m.eventId, "owner");
  if (m.role === "owner") return { ok: false as const, error: "ownerCannotRemove" as const, eventId: m.eventId };
  if (m.removedAt) return { ok: true as const, eventId: m.eventId };
  await db.transaction(async (tx) => {
    await tx.update(eventMembers).set({ removedAt: now }).where(eq(eventMembers.id, m.id));
    await tx
      .update(loginLinks)
      .set({ revokedAt: now })
      .where(and(eq(loginLinks.memberId, m.id), isNull(loginLinks.usedAt), isNull(loginLinks.revokedAt)));
    if (m.userId) await revokeMemberEventAccess(tx, { userId: m.userId, eventId: m.eventId, now });
  });
  return { ok: true as const, eventId: m.eventId };
}

/** «Құрылғылардан шығару» (plan 6.1 `revokeMemberSessions`): only access to THIS event. */
export async function signOutMember(db: Db, who: Principal, memberId: string, now = new Date()) {
  const m = await memberOf(db, memberId);
  await authorize(db, who, m.eventId, "owner");
  if (!m.userId || m.role === "owner") return { ok: true as const, eventId: m.eventId, revoked: 0 };
  const r = await revokeMemberEventAccess(db, { userId: m.userId, eventId: m.eventId, now });
  return { ok: true as const, eventId: m.eventId, revoked: r.revoked };
}

/** «Жаңа сілтеме» for a member (old unused link closes). */
export async function newMemberLink(db: Db, who: Principal, memberId: string, now = new Date()) {
  const m = await memberOf(db, memberId);
  await authorize(db, who, m.eventId, "owner");
  if (m.removedAt) throw new ForbiddenError();
  try {
    const link = await issueMemberLink(db, { memberId: m.id, createdBy: who.userId, now });
    return { ok: true as const, eventId: m.eventId, waUrl: link.waUrl, expiresAt: link.expiresAt };
  } catch (e) {
    if (e instanceof LinkLimitError) return { ok: false as const, eventId: m.eventId, error: "linkLimit" as const };
    throw e;
  }
}

/** `rotateDoorToken` (plan 6.2): the old door link stops working. */
export async function rotateDoorToken(db: Db, who: Principal, eventId: string) {
  await authorize(db, who, eventId, "owner");
  const token = randomToken();
  await db.update(events).set({ doorToken: token, updatedAt: new Date() }).where(eq(events.id, eventId));
  return { ok: true as const, token };
}

/* ------------------------------------------------------------------ members screen data */

export type MemberStatus =
  | { kind: "joined"; device: string | null; at: string | null }
  | { kind: "notJoined"; hoursLeft: number }
  | { kind: "linkExpired" };

export type MemberView = {
  id: string;
  role: "owner" | "editor";
  label: string;
  name: string | null;
  phoneMasked: string;
  canEditSeating: boolean;
  canManageBudget: boolean;
  defaultCategoryId: string | null;
  status: MemberStatus;
};

/**
 * Members of an event for the owner. The «Кірді · device · time» status comes only from sessions to which
 * THIS event is available (scope 'all', or the event in `session_events`) — devices a person uses for other
 * events are never shown to this owner (brief Ф3 §2).
 */
export async function membersView(db: Db, who: Principal, eventId: string, now = new Date()): Promise<MemberView[]> {
  await authorize(db, who, eventId, "owner");
  const rows = await db
    .select({ m: eventMembers, userName: users.name })
    .from(eventMembers)
    .leftJoin(users, eq(users.id, eventMembers.userId))
    .where(and(eq(eventMembers.eventId, eventId), isNull(eventMembers.removedAt)))
    .orderBy(sql`case when ${eventMembers.role} = 'owner' then 0 else 1 end`, eventMembers.invitedAt);
  const userIds = rows.map((r) => r.m.userId).filter((x): x is string => Boolean(x));
  const sess = userIds.length
    ? await db
        .select({
          userId: sessions.userId,
          ua: sessions.userAgent,
          label: sessions.deviceLabel,
          at: sessions.lastSeenAt,
        })
        .from(sessions)
        .leftJoin(sessionEvents, and(eq(sessionEvents.sessionId, sessions.id), eq(sessionEvents.eventId, eventId)))
        .where(
          and(
            inArray(sessions.userId, userIds),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, now),
            or(eq(sessions.scope, "all"), eq(sessionEvents.eventId, eventId)),
          ),
        )
        .orderBy(desc(sessions.lastSeenAt))
    : [];
  const links = await db
    .select({ memberId: loginLinks.memberId, expiresAt: loginLinks.expiresAt })
    .from(loginLinks)
    .where(
      and(
        inArray(
          loginLinks.memberId,
          rows.map((r) => r.m.id),
        ),
        isNull(loginLinks.usedAt),
        isNull(loginLinks.revokedAt),
        gt(loginLinks.expiresAt, now),
      ),
    );
  return rows.map(({ m, userName }) => {
    const s = m.userId ? sess.find((x) => x.userId === m.userId) : undefined;
    const link = links
      .filter((l) => l.memberId === m.id)
      .sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0];
    const status: MemberStatus =
      m.joinedAt && s
        ? { kind: "joined", device: s.label ?? deviceLabel(s.ua), at: s.at.toISOString() }
        : link
          ? { kind: "notJoined", hoursLeft: Math.max(1, Math.ceil((link.expiresAt.getTime() - now.getTime()) / HOUR)) }
          : m.joinedAt
            ? { kind: "joined", device: null, at: null }
            : { kind: "linkExpired" };
    return {
      id: m.id,
      role: m.role,
      label: m.label,
      name: m.displayName ?? userName ?? null,
      phoneMasked: maskPhone(m.phone),
      canEditSeating: m.role === "owner" || m.canEditSeating,
      canManageBudget: m.role === "owner" || m.canManageBudget,
      defaultCategoryId: m.defaultCategoryId,
      status,
    };
  });
}
