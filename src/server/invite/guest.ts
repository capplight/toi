import { and, eq, isNull, sql } from "drizzle-orm";
import { rsvpClosesAt } from "@/domain/invitations/dates";
import { setRsvp } from "@/domain/seating";
import { MAX_FAMILY_SEATS } from "@/domain/seating/family";
import { sha256Hex } from "../crypto";
import type { Db } from "../db";
import type { AnswerSummary } from "../guests/service";
import { hit } from "../ratelimit";
import { activityLog, events, families, mediaAssets } from "../schema";
import { doorOpened } from "../door/service";
import { withSeating } from "../seating/adapter";

/**
 * Ф5 guest side (plan 6.4): the page data by token, the answer through the seating adapter (actor `guest`),
 * opening pings. The token is the only credential — unknown / deleted → `null` (the route answers 404).
 */
const TOKEN_RE = /^[0-9A-Za-z]{22}$/;
export const RSVP_PER_HOUR = 10;
export const NOT_FOUND_PER_MINUTE = 30;

export type GuestPage = {
  token: string;
  family: {
    id: string;
    name: string;
    rsvp: "pending" | "yes" | "no";
    expected: number;
    confirmed: number | null;
    answeredByGuest: boolean;
    openedBefore: boolean;
  };
  event: {
    id: string;
    kind: string;
    title: string;
    hostsLine: string | null;
    startsOn: string;
    startsAt: string | null;
    tz: string;
    venueName: string | null;
    venueAddress: string | null;
    mapUrl: string | null;
    textKk: string | null;
    textRu: string | null;
    templateId: string;
    defaultLocale: "kk" | "ru";
    closesAt: Date;
  };
  musicKey: string | null;
  /**
   * Ф8 «Сіздің үстеліңіз»: only when the owner switched `show_table_numbers` on. `tableNo` null → «әлі
   * белгіленбеген»; `hall` for the mini-map; `doorOpened` — the helper's link was opened (invite.table.hint).
   */
  table: {
    tableNo: number | null;
    hall: { columns: 2 | 4; tables: number; seatsPerTable: number } | null;
    doorOpened: boolean;
  } | null;
};

export async function loadGuestPage(db: Db, token: string): Promise<GuestPage | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [r] = await db
    .select({ f: families, e: events, music: mediaAssets })
    .from(families)
    .innerJoin(events, eq(events.id, families.eventId))
    .leftJoin(mediaAssets, and(eq(mediaAssets.id, events.musicAssetId), eq(mediaAssets.status, "ready")))
    .where(and(eq(families.token, token), isNull(families.deletedAt), isNull(events.deletedAt)));
  if (!r) return null;
  return {
    token,
    family: {
      id: r.f.id,
      name: r.f.name,
      rsvp: r.f.rsvp,
      expected: r.f.expectedCount,
      confirmed: r.f.confirmedCount,
      answeredByGuest: r.f.answeredBy === "guest",
      openedBefore: Boolean(r.f.firstOpenedAt),
    },
    event: {
      id: r.e.id,
      kind: r.e.kind,
      title: r.e.title,
      hostsLine: r.e.hostsLine,
      startsOn: r.e.startsOn,
      startsAt: r.e.startsAt,
      tz: r.e.tz,
      venueName: r.e.venueName,
      venueAddress: r.e.venueAddress,
      mapUrl: r.e.mapUrl,
      textKk: r.e.invitationTextKk,
      textRu: r.e.invitationTextRu,
      templateId: r.e.templateId,
      defaultLocale: r.e.defaultLocale,
      closesAt: rsvpClosesAt(r.e.startsOn, r.e.rsvpClosesAt, r.e.tz),
    },
    musicKey: r.music?.storageKey ?? null,
    table:
      r.e.showTableNumbers && r.f.rsvp !== "no"
        ? {
            tableNo: r.f.tableNo,
            hall:
              r.e.hallColumns && r.e.tablesCount
                ? { columns: r.e.hallColumns as 2 | 4, tables: r.e.tablesCount, seatsPerTable: r.e.seatsPerTable }
                : null,
            doorOpened: await doorOpened(db, r.e.id),
          }
        : null,
  };
}

/** 404 limiter: 30 unknown tokens per minute per IP (brief §2). Returns false when over the limit. */
export async function notFoundAllowed(db: Db, ip: string | null, now: Date): Promise<boolean> {
  const r = await hit(
    db,
    { key: `inv404:ip:${sha256Hex(ip ?? "unknown")}`, windowSec: 60, max: NOT_FOUND_PER_MINUTE },
    now,
  );
  return r.ok;
}

export type GuestAnswer = { attending: boolean; seats?: number | null; consent?: boolean };
export type GuestAnswerResult =
  | { ok: true; rsvp: "yes" | "no"; seats: number | null }
  | { ok: false; error: "notFound" | "closed" | "rateLimited" | "seats" | "consent" };

/**
 * «Жіберу» (plan 6.4, brief §2): through `withSeating` — actor `guest`, action `answer`, `record: true`,
 * `summary.from / to`, engine `setRsvp`; `answered_by = 'guest'`, `responded_at`. 10 per hour per token;
 * after `rsvp_closes_at` → `closed` (409): a cheap check first, then again inside the `withSeating` step (Н1). With `requireConsent` the box must be ticked (`rsvp_consent_at`).
 */
export async function answerAsGuest(
  db: Db,
  token: string,
  input: GuestAnswer,
  opts: { now?: Date; requireConsent?: boolean } = {},
): Promise<GuestAnswerResult> {
  const now = opts.now ?? new Date();
  const page = await loadGuestPage(db, token);
  if (!page) return { ok: false, error: "notFound" };
  if (now >= page.event.closesAt) return { ok: false, error: "closed" };
  const seats = input.attending ? Number(input.seats ?? page.family.expected) : null;
  if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > MAX_FAMILY_SEATS)) {
    return { ok: false, error: "seats" };
  }
  if (opts.requireConsent && !input.consent) return { ok: false, error: "consent" };
  const limit = await hit(db, { key: `rsvp:token:${sha256Hex(token)}`, windowSec: 3600, max: RSVP_PER_HOUR }, now);
  if (!limit.ok) return { ok: false, error: "rateLimited" };

  const rsvp = input.attending ? ("yes" as const) : ("no" as const);
  const closed = Symbol("closed");
  try {
    await withSeating(db, page.event.id, { kind: "guest", memberId: null }, async ({ tx, state }) => {
      // Ф5 review Н1: the deadline is re-read under the event lock — the owner may have moved it after the page loaded.
      const [ev] = await tx
        .select({ startsOn: events.startsOn, closesAt: events.rsvpClosesAt, tz: events.tz })
        .from(events)
        .where(eq(events.id, page.event.id));
      if (!ev || now >= rsvpClosesAt(ev.startsOn, ev.closesAt, ev.tz)) throw closed;
      const [cur] = await tx.select().from(families).where(eq(families.id, page.family.id));
      await tx
        .update(families)
        .set({
          rsvp,
          confirmedCount: seats,
          respondedAt: now,
          answeredBy: "guest",
          answeredByMemberId: null,
          ...(opts.requireConsent ? { rsvpConsentAt: now } : {}),
          version: sql`${families.version} + 1`,
          updatedAt: now,
        })
        .where(eq(families.id, page.family.id));
      const summary: AnswerSummary = {
        names: [cur!.name],
        familyId: cur!.id,
        by: "guest",
        from: {
          rsvp: cur!.rsvp,
          confirmed: cur!.confirmedCount,
          respondedAt: cur!.respondedAt?.toISOString() ?? null,
          answeredBy: cur!.answeredBy,
          answeredByMemberId: cur!.answeredByMemberId,
        },
        to: { rsvp, confirmed: seats },
      };
      return {
        result: setRsvp(state, cur!.id, rsvp, { confirmed: seats }),
        action: "answer",
        summary,
        value: null,
        record: true,
      };
    });
  } catch (e) {
    if (e === closed) return { ok: false, error: "closed" };
    throw e;
  }
  return { ok: true, rsvp, seats };
}

/** `sendBeacon` pings: `opened` (page shown) and `envelope` («Ашу»). First opening is remembered on the family. */
export async function pingGuest(
  db: Db,
  token: string,
  kind: "opened" | "envelope",
  now = new Date(),
): Promise<boolean> {
  const page = await loadGuestPage(db, token);
  if (!page) return false;
  await db.insert(activityLog).values({
    eventId: page.event.id,
    familyId: page.family.id,
    kind: kind === "opened" ? "invite_opened" : "envelope_opened",
    at: now,
  });
  if (kind === "opened") {
    await db
      .update(families)
      .set({ firstOpenedAt: sql`coalesce(${families.firstOpenedAt}, ${now.toISOString()}::timestamptz)` })
      .where(eq(families.id, page.family.id));
  }
  return true;
}
