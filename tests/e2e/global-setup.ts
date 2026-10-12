import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import type { World, WorldName } from "./worlds";

/**
 * e2e data (Ф6 review П1): migrate, then seed one **independent copy of the demo event per writing spec** — a
 * «world» with its own member phones, sessions and guest links. Specs that only read use `base` (the seed exactly
 * as in design_spec 5.2), so no spec depends on what another spec changed or on the order of specs.
 * Without DATABASE_URL: nothing (DB tests skip locally; in CI they fail — Ф0 review Н5).
 */

/** base = the demo phones (auth logs in with them); every other world: +7700{n}00000{1|2|3}. */
const WORLDS: WorldName[] = [
  "base",
  "events",
  "guests",
  "invite",
  "music",
  "perf",
  "summaryLive",
  "screensF3",
  "screensF4",
  "screensF5",
  // Ф7b «Зал» (separate block): one world per writing project + two-browser test + screenshots
  "hallMobile",
  "hallDesktop",
  "hallConcurrency",
  "screensF7b",
];

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    if (process.env.CI) throw new Error("e2e: DATABASE_URL is required in CI (Ф0 review Н5)");
    return;
  }
  const secret = () => randomBytes(32).toString("base64");
  process.env.APP_URL ??= "http://localhost:3100";
  process.env.APP_DOMAIN ??= "toi-pilot.vercel.app";
  process.env.DATABASE_DRIVER ??= "pg";
  process.env.SESSION_SECRET ??= secret();
  process.env.OTP_HMAC_SECRET ??= secret();
  process.env.CRON_SECRET ??= secret();
  const { migrateUrl } = await import("../../scripts/lib/migrate");
  const { seedSample, DEMO_PHONES } = await import("../../scripts/lib/seed-sample");
  const { db, closeDb } = await import("../../src/server/db");
  const { issueMemberLink } = await import("../../src/server/auth/loginLinks");
  const { upsertUser, createSession } = await import("../../src/server/auth/session");
  const { eventMembers, families, rateLimits, otpChallenges } = await import("../../src/server/schema");
  const { and, asc, eq, inArray, ne } = await import("drizzle-orm");
  await migrateUrl(process.env.DATABASE_URL);
  // Fresh limits for each run (a test database; repeated local runs would hit the 60 s per-number limit).
  await db().delete(rateLimits);
  await db().delete(otpChallenges);

  const worlds = {} as Record<WorldName, World>;
  for (const [i, name] of WORLDS.entries()) {
    const phones =
      name === "base"
        ? DEMO_PHONES
        : i < 10
          ? { ake: `+7700${i}000001`, ana: `+7700${i}000002`, jas: `+7700${i}000003` }
          : { ake: `+7701${i - 10}000001`, ana: `+7701${i - 10}000002`, jas: `+7701${i - 10}000003` }; // Ф7b worlds
    const s = await seedSample(db(), new Date(), { phones });
    const now = new Date();
    // Ready sessions (owner Әкесі; Жастар without the budget right; akeSwitch_*: other devices of the owner for the
    // Ф3 `#switch` test — those sessions are replaced there).
    const sessions = {} as World["sessions"];
    for (const who of ["ake", "jas", "akeSwitch_mobile", "akeSwitch_desktop"] as const) {
      const phone = phones[who.startsWith("akeSwitch") ? "ake" : (who as "ake" | "jas")];
      const u = await upsertUser(db(), { phone, locale: "kk", now, updateLocale: false });
      await db()
        .update(eventMembers)
        .set({ userId: u.id })
        .where(and(eq(eventMembers.eventId, s.eventId), eq(eventMembers.phone, phone)));
      sessions[who] = (
        await createSession(db(), { userId: u.id, method: "sms", scope: "all", userAgent: null, now })
      ).token;
    }
    // One member login link per project (links are one-time): Анасы for mobile, Жастар for desktop.
    const memberLinks = {
      mobile: new URL((await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now })).url).pathname,
      desktop: new URL((await issueMemberLink(db(), { memberId: s.memberIds.jas, createdBy: null, now })).url).pathname,
    };
    // Guest links of families from Анасы's and Жастар's lists, in seating order.
    const others = await db()
      .select({ token: families.token, name: families.name, rsvp: families.rsvp, sentAt: families.sentAt })
      .from(families)
      .where(and(eq(families.eventId, s.eventId), ne(families.addedByMemberId, s.memberIds.ake)))
      .orderBy(asc(families.seatSeq));
    let guests = others.map((g) => ({ token: g.token, name: g.name }));
    if (name === "invite") {
      // Ф5: every family of the pool has not answered yet, so each test starts from the envelope.
      await db()
        .update(families)
        .set({ rsvp: "pending", confirmedCount: null, respondedAt: null, answeredBy: null, firstOpenedAt: null })
        .where(
          and(
            eq(families.eventId, s.eventId),
            inArray(
              families.token,
              guests.map((g) => g.token),
            ),
          ),
        );
    }
    if (name === "summaryLive") {
      // sent and not answered yet: the guest answers in the test
      guests = others.filter((g) => g.rsvp === "pending" && g.sentAt).map((g) => ({ token: g.token, name: g.name }));
    }
    if (name === "perf") await realisticStatuses(s.eventId);
    worlds[name] = { eventId: s.eventId, sessions, memberLinks, guests, phones };
  }
  // Ф7b: a ready session of Анасы (seating right) for the «Зал» worlds — the two-browser test (мама и папа).
  for (const name of WORLDS.filter((n) => n.startsWith("hall") || n === "screensF7b")) {
    const i = WORLDS.indexOf(name);
    const phone = `+7701${i - 10}000002`;
    const now = new Date();
    const u = await upsertUser(db(), { phone, locale: "kk", now, updateLocale: false });
    await db()
      .update(eventMembers)
      .set({ userId: u.id })
      .where(and(eq(eventMembers.eventId, worlds[name].eventId), eq(eventMembers.phone, phone)));
    worlds[name].sessions.ana = (
      await createSession(db(), { userId: u.id, method: "sms", scope: "all", userAgent: null, now })
    ).token;
  }
  await closeDb();
  mkdirSync("playwright/.cache", { recursive: true });
  writeFileSync("playwright/.cache/e2e-seed.json", JSON.stringify(worlds));

  /**
   * Ф6 review П2: the S1 perf event — the 65 families with the mix of the first weeks before a toi (the heavy state
   * for S1: «Жіберілмеген» and «Жауап жоқ» cards carry more controls). Fixed by seating order: per 6 families —
   * 2 not sent, 2 sent without an answer, 2 answered «Келеді» (every 12th family «Келмейді» instead).
   */
  async function realisticStatuses(eventId: string) {
    const rows = await db()
      .select({ id: families.id, expected: families.expectedCount })
      .from(families)
      .where(eq(families.eventId, eventId))
      .orderBy(asc(families.seatSeq));
    const sent = new Date(Date.now() - 3 * 86_400_000);
    const answered = new Date(Date.now() - 86_400_000);
    for (const [i, f] of rows.entries()) {
      const k = i % 6;
      const set =
        k < 2
          ? { rsvp: "pending" as const, sentAt: null, respondedAt: null, confirmedCount: null, answeredBy: null }
          : k < 4
            ? { rsvp: "pending" as const, sentAt: sent, respondedAt: null, confirmedCount: null, answeredBy: null }
            : i % 12 === 5
              ? {
                  rsvp: "no" as const,
                  sentAt: sent,
                  respondedAt: answered,
                  confirmedCount: null,
                  answeredBy: "guest" as const,
                }
              : {
                  rsvp: "yes" as const,
                  sentAt: sent,
                  respondedAt: answered,
                  confirmedCount: f.expected,
                  answeredBy: "guest" as const,
                };
      await db().update(families).set(set).where(eq(families.id, f.id));
    }
  }
}
