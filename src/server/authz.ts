import { cookies } from "next/headers";
import { authorize, type Membership, UnauthorizedError } from "./auth/access";
import { SESSION_COOKIE, sessionCookieOptions, type SessionUser, validateSession } from "./auth/session";
import { db } from "./db";

export { doorByToken, ForbiddenError, guestByToken, NotFoundError, UnauthorizedError } from "./auth/access";

/**
 * Plan 5.3: every Server Action and route handler starts with one of these, then zod validation.
 * The session cookie is validated against the DB on every call; the sliding renewal re-sets the cookie.
 */
export async function currentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  const user = await validateSession(db(), token, new Date());
  if (user?.renewed && token) {
    try {
      store.set(SESSION_COOKIE, token, sessionCookieOptions(user.expiresAt));
    } catch {
      // Server Components cannot set cookies; the next action/route call renews it.
    }
  }
  return user;
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireMember(
  eventId: string,
  opts: { seating?: boolean } = {},
): Promise<Membership & { user: SessionUser }> {
  const user = await requireUser();
  const m = await authorize(db(), user.userId, eventId, opts.seating ? "seating" : "member");
  return { ...m, user };
}

export async function requireBudget(eventId: string): Promise<Membership & { user: SessionUser }> {
  const user = await requireUser();
  return { ...(await authorize(db(), user.userId, eventId, "budget")), user };
}

export async function requireOwner(eventId: string): Promise<Membership & { user: SessionUser }> {
  const user = await requireUser();
  return { ...(await authorize(db(), user.userId, eventId, "owner")), user };
}
