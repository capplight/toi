import { and, eq, isNull } from "drizzle-orm";
import type { DbOrTx } from "../db";
import { eventMembers, events, families, sessionEvents } from "../schema";

/** Plan 5.3. Errors map to HTTP 401 / 403 / 404 in actions and route handlers. */
export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(reason = "forbidden") {
    super(reason);
    this.name = "ForbiddenError";
  }
}
export class NotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("not found");
    this.name = "NotFoundError";
  }
}

export type Need = "member" | "seating" | "budget" | "owner";

/**
 * Who is asking: the user and the session's access area (plan 6.1 v1.5). 'all' — every event of the
 * user; 'events' — only the events in session_events of this session (member link login).
 */
export type Principal = { userId: string; scope: "all" | "events"; sessionId: string };

export type Membership = {
  memberId: string;
  eventId: string;
  role: "owner" | "editor";
  canEditSeating: boolean;
  canManageBudget: boolean;
  label: string;
};

/**
 * Core of `requireMember` / `requireBudget` / `requireOwner` for a known user id.
 * - member: active membership (`removed_at is null`) in a live event;
 * - seating: + owner or `can_edit_seating`;
 * - budget: owner or `can_manage_budget`;
 * - owner: `role = 'owner'`.
 * A stranger gets 403 whether the event exists or not (no existence oracle).
 * A session with scope 'events' passes only for the events listed in session_events (Ф2 review Б1).
 */
export async function authorize(db: DbOrTx, who: Principal, eventId: string, need: Need): Promise<Membership> {
  if (!/^[0-9a-f-]{36}$/i.test(eventId)) throw new ForbiddenError();
  const userId = who.userId;
  if (who.scope !== "all") {
    const [allowed] = await db
      .select({ eventId: sessionEvents.eventId })
      .from(sessionEvents)
      .where(and(eq(sessionEvents.sessionId, who.sessionId), eq(sessionEvents.eventId, eventId)));
    if (!allowed) throw new ForbiddenError("not in session scope");
  }
  const [m] = await db
    .select({
      memberId: eventMembers.id,
      eventId: eventMembers.eventId,
      role: eventMembers.role,
      canEditSeating: eventMembers.canEditSeating,
      canManageBudget: eventMembers.canManageBudget,
      label: eventMembers.label,
    })
    .from(eventMembers)
    .innerJoin(events, eq(events.id, eventMembers.eventId))
    .where(
      and(
        eq(eventMembers.eventId, eventId),
        eq(eventMembers.userId, userId),
        isNull(eventMembers.removedAt),
        isNull(events.deletedAt),
      ),
    );
  if (!m) throw new ForbiddenError("not a member");
  const owner = m.role === "owner";
  if (need === "seating" && !(owner || m.canEditSeating)) throw new ForbiddenError("seating");
  if (need === "budget" && !(owner || m.canManageBudget)) throw new ForbiddenError("budget");
  if (need === "owner" && !owner) throw new ForbiddenError("owner");
  return m;
}

/** Default rights by member kind (plan 5.3; decision Р9). */
export function defaultRights(kind: "parent" | "couple" | "other") {
  return kind === "parent"
    ? { canEditSeating: true, canManageBudget: true }
    : { canEditSeating: false, canManageBudget: false };
}

const TOKEN_RE = /^[0-9A-Za-z]{22}$/;

/** Guest page: the family with this token, event not deleted, family not deleted. */
export async function guestByToken(db: DbOrTx, token: string) {
  if (!TOKEN_RE.test(token)) throw new NotFoundError();
  const [row] = await db
    .select({ familyId: families.id, eventId: families.eventId })
    .from(families)
    .innerJoin(events, eq(events.id, families.eventId))
    .where(and(eq(families.token, token), isNull(families.deletedAt), isNull(events.deletedAt)));
  if (!row) throw new NotFoundError();
  return row;
}

/** Door helper: the event with this `door_token`. */
export async function doorByToken(db: DbOrTx, token: string) {
  if (!TOKEN_RE.test(token)) throw new NotFoundError();
  const [row] = await db
    .select({ eventId: events.id })
    .from(events)
    .where(and(eq(events.doorToken, token), isNull(events.deletedAt)));
  if (!row) throw new NotFoundError();
  return row;
}
