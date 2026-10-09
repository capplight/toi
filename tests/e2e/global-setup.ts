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
  for (const who of ["ake", "jas"] as const) {
    const u = await upsertUser(db(), { phone: DEMO_PHONES[who], locale: "kk", now: new Date(), updateLocale: false });
    await db().update(eventMembers).set({ userId: u.id }).where(eq(eventMembers.phone, DEMO_PHONES[who]));
    sessions[who] = (
      await createSession(db(), { userId: u.id, method: "sms", scope: "all", userAgent: null, now: new Date() })
    ).token;
  }
  const memberLinks = {
    mobile: new URL((await issueMemberLink(db(), { memberId: s.memberIds.ana, createdBy: null, now })).url).pathname,
    desktop: new URL((await issueMemberLink(db(), { memberId: s.memberIds.jas, createdBy: null, now })).url).pathname,
  };
  await closeDb();
  mkdirSync("playwright/.cache", { recursive: true });
  writeFileSync("playwright/.cache/e2e-seed.json", JSON.stringify({ eventId: s.eventId, memberLinks, sessions }));
}
