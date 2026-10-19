import { and, eq, gt, isNull, sql, TransactionRollbackError } from "drizzle-orm";
import { translator } from "@/i18n/messages";
import { randomToken, sha256Hex } from "../crypto";
import type { Db, DbOrTx } from "../db";
import { env } from "../env";
import { hit, peek } from "../ratelimit";
import { allowedOwners, eventMembers, events, loginLinks, users } from "../schema";
import { addEventToSession, createSession, upsertUser } from "./session";

/** Plan 6.1 flow 1: one-time link, 72 hours, only sha256 stored, a new link revokes older unused ones. */
export const LINK_HOURS = 72;
const HOUR_MS = 60 * 60 * 1000;
export const LINKS_PER_EVENT_PER_DAY = 20;
export const JOIN_FAILURES_PER_HOUR = 10;

const TOKEN_RE = /^[0-9A-Za-z]{22}$/;

export class LinkLimitError extends Error {
  constructor() {
    super("login link limit reached");
    this.name = "LinkLimitError";
  }
}

export type IssuedLink = { token: string; url: string; waUrl: string; expiresAt: Date };

const waDigits = (phone: string) => phone.replace(/\D/g, "");

/**
 * `issueLoginLink(memberId)` — called by the owner (authz `requireOwner` in the action).
 * Revokes the member's previous unused links. 20 links per event per day.
 */
export async function issueMemberLink(
  db: Db,
  input: { memberId: string; createdBy: string | null; now: Date },
): Promise<IssuedLink> {
  return db.transaction(async (tx) => {
    const [m] = await tx
      .select({
        id: eventMembers.id,
        phone: eventMembers.phone,
        eventId: events.id,
        title: events.title,
        locale: events.defaultLocale,
      })
      .from(eventMembers)
      .innerJoin(events, eq(events.id, eventMembers.eventId))
      .where(and(eq(eventMembers.id, input.memberId), isNull(eventMembers.removedAt), isNull(events.deletedAt)));
    if (!m) throw new Error("member not found");

    const limit = await hit(
      tx,
      { key: `link:event:${m.eventId}`, windowSec: 86_400, max: LINKS_PER_EVENT_PER_DAY },
      input.now,
    );
    if (!limit.ok) throw new LinkLimitError();

    await tx
      .update(loginLinks)
      .set({ revokedAt: input.now })
      .where(and(eq(loginLinks.memberId, m.id), isNull(loginLinks.usedAt), isNull(loginLinks.revokedAt)));

    const token = randomToken();
    const expiresAt = new Date(input.now.getTime() + LINK_HOURS * HOUR_MS);
    await tx.insert(loginLinks).values({
      tokenHash: sha256Hex(token),
      phone: m.phone,
      memberId: m.id,
      purpose: "member",
      createdBy: input.createdBy,
      createdAt: input.now,
      expiresAt,
    });
    const url = `${env().APP_URL.replace(/\/$/, "")}/join/${token}`;
    const text = translator(m.locale)("wa.memberLogin", { eventTitle: m.title, link: url });
    const waUrl = `https://wa.me/${waDigits(m.phone)}?text=${encodeURIComponent(text)}`;
    return { token, url, waUrl, expiresAt };
  });
}

/**
 * Plan 6.1 flow 4: owner bootstrap link for the pilot family (CLI `pnpm admin:owner-link`).
 * Adds the phone to `allowed_owners` and revokes earlier unused bootstrap links of that phone.
 */
export async function issueOwnerBootstrapLink(
  db: Db,
  input: { phone: string; note?: string; now: Date },
): Promise<{ token: string; url: string; expiresAt: Date }> {
  return db.transaction(async (tx) => {
    await tx
      .insert(allowedOwners)
      .values({ phone: input.phone, note: input.note ?? null })
      .onConflictDoNothing({ target: allowedOwners.phone });
    await tx
      .update(loginLinks)
      .set({ revokedAt: input.now })
      .where(
        and(
          eq(loginLinks.phone, input.phone),
          eq(loginLinks.purpose, "owner_bootstrap"),
          isNull(loginLinks.usedAt),
          isNull(loginLinks.revokedAt),
        ),
      );
    const token = randomToken();
    const expiresAt = new Date(input.now.getTime() + LINK_HOURS * HOUR_MS);
    await tx.insert(loginLinks).values({
      tokenHash: sha256Hex(token),
      phone: input.phone,
      memberId: null,
      purpose: "owner_bootstrap",
      createdBy: null,
      createdAt: input.now,
      expiresAt,
    });
    return { token, url: `${env().APP_URL.replace(/\/$/, "")}/join/${token}`, expiresAt };
  });
}

export type LinkView =
  | {
      status: "valid";
      purpose: "member" | "owner_bootstrap";
      phone: string;
      label: string | null;
      event: {
        id: string;
        title: string;
        kind: string;
        startsOn: string;
        startsAt: string | null;
        venue: string | null;
      } | null;
    }
  | { status: "expired"; ownerPhone: string | null; label: string | null };

/**
 * `GET /join/{token}`: read-only — WhatsApp and other bots open links for previews, so nothing is spent.
 */
export async function inspectLink(db: DbOrTx, token: string, now: Date): Promise<LinkView> {
  if (!TOKEN_RE.test(token)) return { status: "expired", ownerPhone: null, label: null };
  const [row] = await db
    .select({
      purpose: loginLinks.purpose,
      phone: loginLinks.phone,
      usedAt: loginLinks.usedAt,
      revokedAt: loginLinks.revokedAt,
      expiresAt: loginLinks.expiresAt,
      label: eventMembers.label,
      removedAt: eventMembers.removedAt,
      eventId: events.id,
      title: events.title,
      kind: events.kind,
      startsOn: events.startsOn,
      startsAt: events.startsAt,
      venue: events.venueName,
      eventDeletedAt: events.deletedAt,
      ownerPhone: users.phone,
    })
    .from(loginLinks)
    .leftJoin(eventMembers, eq(eventMembers.id, loginLinks.memberId))
    .leftJoin(events, eq(events.id, eventMembers.eventId))
    .leftJoin(users, eq(users.id, events.ownerId))
    .where(eq(loginLinks.tokenHash, sha256Hex(token)));
  if (!row) return { status: "expired", ownerPhone: null, label: null };
  const usable =
    !row.usedAt &&
    !row.revokedAt &&
    row.expiresAt > now &&
    !row.removedAt &&
    !row.eventDeletedAt &&
    (row.purpose === "owner_bootstrap" || row.eventId !== null);
  if (!usable) return { status: "expired", ownerPhone: row.ownerPhone, label: row.label };
  return {
    status: "valid",
    purpose: row.purpose as "member" | "owner_bootstrap",
    phone: row.phone,
    label: row.label,
    event: row.eventId
      ? {
          id: row.eventId,
          title: row.title!,
          kind: row.kind!,
          startsOn: row.startsOn!,
          startsAt: row.startsAt,
          venue: row.venue,
        }
      : null,
  };
}

export type ConsumeResult =
  | { ok: true; sessionToken: string; expiresAt: Date; redirectTo: string; userId: string }
  | { ok: false; reason: "expired" | "tooManyAttempts" };

/**
 * «Кіру» (POST): atomic `update … where used_at is null and revoked_at is null and expires_at > now returning`,
 * user by the link's phone, membership joined, session created. 10 failures per hour per IP.
 */
export async function consumeLink(
  db: Db,
  input: {
    token: string;
    ip: string | null;
    userAgent: string | null;
    locale: "kk" | "ru";
    now: Date;
    /** The device's current session cookie, if any (to extend an existing 'events' session). */
    currentSessionToken?: string;
  },
): Promise<ConsumeResult> {
  const failKey = {
    key: `join:fail:ip:${sha256Hex(input.ip ?? "unknown")}`,
    windowSec: 3600,
    max: JOIN_FAILURES_PER_HOUR,
  };
  if (!(await peek(db, failKey, input.now)).ok) return { ok: false, reason: "tooManyAttempts" };

  const result = await db
    .transaction(async (tx): Promise<ConsumeResult | null> => {
      if (!TOKEN_RE.test(input.token)) return null;
      const [link] = await tx
        .update(loginLinks)
        .set({ usedAt: input.now })
        .where(
          and(
            eq(loginLinks.tokenHash, sha256Hex(input.token)),
            isNull(loginLinks.usedAt),
            isNull(loginLinks.revokedAt),
            gt(loginLinks.expiresAt, input.now),
          ),
        )
        .returning({
          tokenHash: loginLinks.tokenHash,
          phone: loginLinks.phone,
          memberId: loginLinks.memberId,
          purpose: loginLinks.purpose,
        });
      if (!link) return null;

      // Scope of access (plan 6.1 v1.5, Ф2 review Б1): the owner can see a member's link, so a member link
      // proves only that THIS owner admits the phone to THIS event.
      if (link.purpose === "member") {
        const [m] = await tx
          .select({ eventId: eventMembers.eventId })
          .from(eventMembers)
          .innerJoin(events, eq(events.id, eventMembers.eventId))
          .where(and(eq(eventMembers.id, link.memberId!), isNull(eventMembers.removedAt), isNull(events.deletedAt)));
        if (!m) tx.rollback();
        const eventId = m!.eventId;
        // A link never changes an existing user's language.
        const user = await upsertUser(tx, {
          phone: link.phone,
          locale: input.locale,
          now: input.now,
          updateLocale: false,
        });
        // Only the membership of the link is joined.
        await tx
          .update(eventMembers)
          .set({
            userId: user.id,
            joinedAt: sql`coalesce(${eventMembers.joinedAt}, ${input.now.toISOString()}::timestamptz)`,
          })
          .where(eq(eventMembers.id, link.memberId!));
        // Same person already has an 'events' session on this device → add the event to it.
        const existing = await addEventToSession(tx, {
          token: input.currentSessionToken,
          userId: user.id,
          eventId,
          now: input.now,
        });
        const session =
          existing ??
          (await createSession(tx, {
            userId: user.id,
            method: "link",
            scope: "events",
            eventId,
            userAgent: input.userAgent,
            now: input.now,
          }));
        const sessionId = sha256Hex(session.token);
        await tx.update(loginLinks).set({ usedSessionId: sessionId }).where(eq(loginLinks.tokenHash, link.tokenHash));
        return {
          ok: true,
          sessionToken: session.token,
          expiresAt: session.expiresAt,
          redirectTo: `/e/${eventId}`,
          userId: user.id,
        };
      }

      // owner_bootstrap (founder's link, plan 6.1 flow 4): the founder sends it to the owner's number → scope 'all'.
      const [allowed] = await tx.select().from(allowedOwners).where(eq(allowedOwners.phone, link.phone));
      if (!allowed) tx.rollback();
      const user = await upsertUser(tx, {
        phone: link.phone,
        locale: input.locale,
        now: input.now,
        updateLocale: false,
      });
      await tx
        .update(eventMembers)
        .set({
          userId: user.id,
          joinedAt: sql`coalesce(${eventMembers.joinedAt}, ${input.now.toISOString()}::timestamptz)`,
        })
        .where(and(eq(eventMembers.phone, link.phone), isNull(eventMembers.removedAt)));
      const session = await createSession(tx, {
        userId: user.id,
        method: "link",
        scope: "all",
        userAgent: input.userAgent,
        now: input.now,
      });
      await tx.update(loginLinks).set({ usedSessionId: session.id }).where(eq(loginLinks.tokenHash, link.tokenHash));
      return { ok: true, sessionToken: session.token, expiresAt: session.expiresAt, redirectTo: "/e", userId: user.id };
    })
    .catch((err: unknown) => {
      // tx.rollback() throws a TransactionRollbackError — treat as an unusable link.
      if (err instanceof TransactionRollbackError) return null;
      throw err;
    });

  if (result) return result;
  await hit(db, failKey, input.now);
  return { ok: false, reason: "expired" };
}
