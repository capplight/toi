import { and, isNotNull, lt, or } from "drizzle-orm";
import type { Db } from "./db";
import { loginLinks, otpChallenges, rateLimits, sessions } from "./schema";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * Retention of service data (plan 6.7, Ф2 review Б3), run daily by `/api/cron/cleanup`:
 * - otp_challenges older than 24 h (phone and IP, also of unknown numbers);
 * - rate_limits windows older than 2 days;
 * - login_links used, revoked or expired more than 30 days ago;
 * - sessions revoked or expired more than 30 days ago (session_events go by cascade).
 */
export async function cleanup(db: Db, now: Date) {
  const d1 = new Date(now.getTime() - DAY);
  const d2 = new Date(now.getTime() - 2 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  return db.transaction(async (tx) => {
    const otp = await tx
      .delete(otpChallenges)
      .where(lt(otpChallenges.createdAt, d1))
      .returning({ id: otpChallenges.id });
    const limits = await tx.delete(rateLimits).where(lt(rateLimits.windowStart, d2)).returning({ key: rateLimits.key });
    const links = await tx
      .delete(loginLinks)
      .where(
        or(
          and(isNotNull(loginLinks.usedAt), lt(loginLinks.usedAt, d30)),
          and(isNotNull(loginLinks.revokedAt), lt(loginLinks.revokedAt, d30)),
          lt(loginLinks.expiresAt, d30),
        ),
      )
      .returning({ h: loginLinks.tokenHash });
    const sess = await tx
      .delete(sessions)
      .where(or(and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, d30)), lt(sessions.expiresAt, d30)))
      .returning({ id: sessions.id });
    return { otpChallenges: otp.length, rateLimits: limits.length, loginLinks: links.length, sessions: sess.length };
  });
}
