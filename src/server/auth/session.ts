import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { sessionToken, sha256Hex } from "../crypto";
import type { DbOrTx } from "../db";
import { sessions, users } from "../schema";
import { deviceLabel } from "./device";

/** Plan 6.1 / 9: 180 days, sliding (renewed at most once a day), at most 3 active sessions per person. */
export const SESSION_DAYS = 180;
export const MAX_SESSIONS = 3;
export const SESSION_COOKIE = "toi_session";
const DAY_MS = 24 * 60 * 60 * 1000;

export const sessionCookieOptions = (expires: Date) => ({
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  expires,
});

export type NewSession = { token: string; id: string; expiresAt: Date };

/** Create a session; the 4th active one revokes the oldest. Only sha256(token) is stored. */
export async function createSession(
  db: DbOrTx,
  input: { userId: string; method: "link" | "sms"; userAgent: string | null; now: Date },
): Promise<NewSession> {
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
    deviceLabel: deviceLabel(input.userAgent),
    userAgent: input.userAgent?.slice(0, 400) ?? null,
  });
  const active = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.userId, input.userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, input.now)))
    .orderBy(asc(sessions.createdAt), asc(sessions.id));
  const excess = active.filter((s) => s.id !== id).slice(0, Math.max(0, active.length - MAX_SESSIONS));
  for (const s of excess) {
    await db.update(sessions).set({ revokedAt: input.now }).where(eq(sessions.id, s.id));
  }
  return { token, id, expiresAt };
}

export type SessionUser = {
  sessionId: string;
  userId: string;
  phone: string;
  locale: "kk" | "ru";
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
  return { sessionId: row.sessionId, userId: row.userId, phone: row.phone, locale: row.locale, expiresAt, renewed };
}

export async function revokeSessionByToken(db: DbOrTx, token: string, now: Date): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.id, sha256Hex(token)), isNull(sessions.revokedAt)));
}

/** Revoke every active session of a user (owner's «Шығару» for a member). Returns how many. */
export async function revokeUserSessions(db: DbOrTx, userId: string, now: Date): Promise<number> {
  const rows = await db
    .update(sessions)
    .set({ revokedAt: now })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  return rows.length;
}

/** Find or create a user by phone; update locale and last login. */
export async function upsertUser(
  db: DbOrTx,
  input: { phone: string; locale: "kk" | "ru"; now: Date },
): Promise<{ id: string }> {
  const [row] = await db
    .insert(users)
    .values({ phone: input.phone, locale: input.locale, lastLoginAt: input.now })
    .onConflictDoUpdate({ target: users.phone, set: { locale: input.locale, lastLoginAt: input.now } })
    .returning({ id: users.id });
  return row!;
}
