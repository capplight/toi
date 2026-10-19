import { and, asc, eq, gt, inArray, isNull, notExists, sql } from "drizzle-orm";
import { sessionToken, sha256Hex } from "../crypto";
import type { DbOrTx } from "../db";
import { sessionEvents, sessions, users } from "../schema";
import { deviceLabel } from "./device";

/** Plan 6.1 / 9: 180 days, sliding (renewed at most once a day), at most 3 active sessions per scope. */
export const SESSION_DAYS = 180;
export const MAX_SESSIONS = 3;
export const SESSION_COOKIE = "toi_session";
const DAY_MS = 24 * 60 * 60 * 1000;

export type Scope = "all" | "events";

export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  expires,
});

export type NewSession = { token: string; id: string; expiresAt: Date };

const activeOf = (userId: string, now: Date) =>
  and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now));

/**
 * Create a session (plan 6.1 v1.5 «Область доступа сессии»).
 * - scope 'all' (SMS, founder's owner link): at most 3 active 'all' sessions; the oldest is revoked.
 * - scope 'events' (member link) with `eventId`: one `session_events` row; at most 3 active 'events'
 *   sessions per event — the oldest loses that event (and is revoked when no events are left).
 *   Link sessions never push out SMS sessions and vice versa.
 */
export async function createSession(
  db: DbOrTx,
  input: {
    userId: string;
    method: "link" | "sms";
    scope: Scope;
    eventId?: string;
    userAgent: string | null;
    now: Date;
  },
): Promise<NewSession> {
  if (input.scope === "events" && !input.eventId) throw new Error("scope 'events' needs an eventId");
  const token = sessionToken();
  const id = sha256Hex(token);
  const expiresAt = new Date(input.now.getTime() + SESSION_DAYS * DAY_MS);
  await db.insert(sessions).values({
    id,
    userId: input.userId,
    createdAt: input.now,
    lastSeenAt: input.now,
    expiresAt,
    authMethod: input.method,
    scope: input.scope,
    deviceLabel: deviceLabel(input.userAgent),
    userAgent: input.userAgent?.slice(0, 400) ?? null,
  });

  if (input.scope === "all") {
    const active = await db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(activeOf(input.userId, input.now), eq(sessions.scope, "all")))
      .orderBy(asc(sessions.createdAt), asc(sessions.id));
    const excess = active.filter((s) => s.id !== id).slice(0, Math.max(0, active.length - MAX_SESSIONS));
    if (excess.length) {
      await db
        .update(sessions)
        .set({ revokedAt: input.now })
        .where(
          inArray(
            sessions.id,
            excess.map((s) => s.id),
          ),
        );
    }
  } else {
    await db.insert(sessionEvents).values({ sessionId: id, eventId: input.eventId! });
    await enforceEventCap(db, input.userId, input.eventId!, input.now, id);
  }
  return { token, id, expiresAt };
}

/** At most 3 active 'events' sessions of a user per event; the oldest ones lose that event. */
async function enforceEventCap(db: DbOrTx, userId: string, eventId: string, now: Date, keepId: string) {
  const active = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(sessionEvents, eq(sessionEvents.sessionId, sessions.id))
    .where(and(activeOf(userId, now), eq(sessions.scope, "events"), eq(sessionEvents.eventId, eventId)))
    .orderBy(asc(sessions.createdAt), asc(sessions.id));
  const excess = active.filter((s) => s.id !== keepId).slice(0, Math.max(0, active.length - MAX_SESSIONS));
  if (!excess.length) return;
  const ids = excess.map((s) => s.id);
  await db.delete(sessionEvents).where(and(inArray(sessionEvents.sessionId, ids), eq(sessionEvents.eventId, eventId)));
  await revokeEmptyEventSessions(db, userId, now);
}

/** Revoke a user's 'events' sessions that have no events left. */
async function revokeEmptyEventSessions(db: DbOrTx, userId: string, now: Date): Promise<number> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(sessions.userId, userId),
        eq(sessions.scope, "events"),
        isNull(sessions.revokedAt),
        notExists(
          db
            .select({ one: sql`1` })
            .from(sessionEvents)
            .where(eq(sessionEvents.sessionId, sessions.id)),
        ),
      ),
    )
    .returning({ id: sessions.id });
  return rows.length;
}

/**
 * Member link on a device that already has an 'events' session of the same user: add the event to it
 * (plan 6.1 v1.5). Returns null if the token is not such a session.
 */
export async function addEventToSession(
  db: DbOrTx,
  input: { token: string | undefined; userId: string; eventId: string; now: Date },
): Promise<{ token: string; expiresAt: Date } | null> {
  if (!input.token || input.token.length > 100) return null;
  const id = sha256Hex(input.token);
  const [s] = await db
    .select({ expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.id, id), activeOf(input.userId, input.now), eq(sessions.scope, "events")));
  if (!s) return null;
  await db.insert(sessionEvents).values({ sessionId: id, eventId: input.eventId }).onConflictDoNothing();
  await enforceEventCap(db, input.userId, input.eventId, input.now, id);
  return { token: input.token, expiresAt: s.expiresAt };
}

export type SessionUser = {
  sessionId: string;
  userId: string;
  phone: string;
  locale: "kk" | "ru";
  scope: Scope;
  expiresAt: Date;
  /** True when the expiry was extended now — the caller re-sets the cookie. */
  renewed: boolean;
};

/** Validate a cookie token; extend the expiry at most once a day (sliding). */
export async function validateSession(db: DbOrTx, token: string | undefined, now: Date): Promise<SessionUser | null> {
  if (!token || token.length > 100) return null;
  const id = sha256Hex(token);
  const [row] = await db
    .select({
      sessionId: sessions.id,
      userId: users.id,
      phone: users.phone,
      locale: users.locale,
      scope: sessions.scope,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)));
  if (!row) return null;
  let expiresAt = row.expiresAt;
  let renewed = false;
  if (now.getTime() - row.lastSeenAt.getTime() >= DAY_MS) {
    expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS);
    renewed = true;
    await db.update(sessions).set({ lastSeenAt: now, expiresAt }).where(eq(sessions.id, id));
  }
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    phone: row.phone,
    locale: row.locale,
    scope: row.scope as Scope,
    expiresAt,
    renewed,
  };
}

/** Event ids a session may see: null = all of the user's events (scope 'all'). */
export async function sessionEventIds(
  db: DbOrTx,
  s: Pick<SessionUser, "sessionId" | "scope">,
): Promise<string[] | null> {
  if (s.scope === "all") return null;
  const rows = await db
    .select({ eventId: sessionEvents.eventId })
    .from(sessionEvents)
    .where(eq(sessionEvents.sessionId, s.sessionId));
  return rows.map((r) => r.eventId);
}

export async function revokeSessionByToken(db: DbOrTx, token: string, now: Date): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sha256Hex(token)), isNull(sessions.revokedAt)));
}

/** Revoke every active session of a user (all scopes) — e.g. the person's own «exit everywhere». */
export async function revokeUserSessions(db: DbOrTx, userId: string, now: Date): Promise<number> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length;
}

/**
 * Owner's «Шығару» for a member (plan 6.1 v1.5): only access to THIS event is removed — the event is
 * dropped from the person's 'events' sessions, sessions left without events are revoked.
 * 'all' sessions (SMS) are never touched; the owner closes them for the event by removing the member.
 */
export async function revokeMemberEventAccess(
  db: DbOrTx,
  input: { userId: string; eventId: string; now: Date },
): Promise<{ removed: number; revoked: number }> {
  const own = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, input.userId), eq(sessions.scope, "events")));
  const removed = await db
    .delete(sessionEvents)
    .where(and(eq(sessionEvents.eventId, input.eventId), inArray(sessionEvents.sessionId, own)))
    .returning({ sessionId: sessionEvents.sessionId });
  const revoked = await revokeEmptyEventSessions(db, input.userId, input.now);
  return { removed: removed.length, revoked };
}

/**
 * Find or create a user by phone.
 * `updateLocale: true` (SMS — the phone is proven) updates the language; a link login never changes
 * an existing user's language (plan 6.1 v1.5).
 */
export async function upsertUser(
  db: DbOrTx,
  input: { phone: string; locale: "kk" | "ru"; now: Date; updateLocale: boolean },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(users)
    .values({ phone: input.phone, locale: input.locale, lastLoginAt: input.now })
    .onConflictDoUpdate({
      target: users.phone,
      set: input.updateLocale ? { locale: input.locale, lastLoginAt: input.now } : { lastLoginAt: input.now },
    })
    .returning({ id: users.id });
  return row!;
}
