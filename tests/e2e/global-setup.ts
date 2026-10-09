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
  await closeDb();
  mkdirSync("playwright/.cache", { recursive: true });
  writeFileSync("playwright/.cache/e2e-seed.json", JSON.stringify({ eventId: s.eventId }));
}
