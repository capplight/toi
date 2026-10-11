import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";

/**
 * e2e data: migrate + seed the demo event once per run. Without DATABASE_URL: nothing (DB tests skip
 * locally; in CI they fail — Ф0 review Н5).
 */
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
  const { seedSample } = await import("../../scripts/lib/seed-sample");
  const { db, closeDb } = await import("../../src/server/db");
  await migrateUrl(process.env.DATABASE_URL);
  // Fresh limits for each run (a test database; repeated local runs would hit the 60 s per-number limit).
  const { rateLimits, otpChallenges } = await import("../../src/server/schema");
  await db().delete(rateLimits);
  await db().delete(otpChallenges);
  const s = await seedSample(db());
  // One member login link per project (links are one-time): Анасы for mobile, Жастар for desktop.
  const { issueMemberLink } = await import("../../src/server/auth/loginLinks");
  const now = new Date();
  // Ready sessions for UI-shell checks (owner Әкесі; Жастар without the budget right).
  const { upsertUser, createSession } = await import("../../src/server/auth/session");
  const { eventMembers } = await import("../../src/server/schema");
  const { eq } = await import("drizzle-orm");
  const { DEMO_PHONES } = await import("../../scripts/lib/seed-sample");
  const sessions: Record<string, string> = {};
  for (const who of ["ake", "jas", "akeSwitch_mobile", "akeSwitch_desktop"] as const) {
    // akeSwitch_*: other devices of the owner for the Ф3 `#switch` test (those sessions are replaced there).
    const phone = DEMO_PHONES[who.startsWith("akeSwitch") ? "ake" : (who as "ake" | "jas")];
    const u = await upsertUser(db(), { phone, locale: "kk", now: new Date(), updateLocale: false });
    await db().update(eventMembers).set({ userId: u.id }).where(eq(eventMembers.phone, phone));
    sessions[who] = (
      await createSession(db(), { userId: u.id, method: "sms", scope: "all", userAgent: null, now: new Date() })
    ).token;
  }
  const memberLinks = {
    mobile: new URL((await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now })).url).pathname,
    desktop: new URL((await issueMemberLink(db(), { memberId: s.memberIds.jas, createdBy: null, now })).url).pathname,
  };
  // Ф5: guest links of families from Анасы's and Жастар's lists (Ф4 tests use the owner's list); each test takes
  // its own so projects do not collide.
  const { families } = await import("../../src/server/schema");
  const { and, asc, inArray, ne } = await import("drizzle-orm");
  const guests = (
    await db()
      .select({ token: families.token, name: families.name })
      .from(families)
      .where(and(eq(families.eventId, s.eventId), ne(families.addedByMemberId, s.memberIds.ake)))
      .orderBy(asc(families.seatSeq))
  )
    // Ф4 e2e relies on these two (duplicate by name / by phone): never used as Ф5 guests.
    .filter((g) => !/Ерлан|Күләш/.test(g.name))
    .map((g) => ({ token: g.token, name: g.name }));
  // …all of them not answered yet, so every test starts from the envelope.
  await db()
    .update(families)
    .set({ rsvp: "pending", confirmedCount: null, respondedAt: null, answeredBy: null, firstOpenedAt: null })
    .where(and(eq(families.eventId, s.eventId), inArray(families.token, guests.map((g) => g.token))));
  await closeDb();
  mkdirSync("playwright/.cache", { recursive: true });
  writeFileSync(
    "playwright/.cache/e2e-seed.json",
    JSON.stringify({ eventId: s.eventId, memberLinks, sessions, guests }),
  );
}
