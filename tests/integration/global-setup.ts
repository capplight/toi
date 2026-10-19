import { randomBytes } from "node:crypto";
import { migrateUrl } from "../../scripts/lib/migrate";
import { type LocalPg, startLocalPg } from "../../scripts/lib/pglite-server";

let local: LocalPg | undefined;

/**
 * Integration DB: `TEST_DATABASE_URL` (CI: postgres:16 service) or an in-memory PGlite server.
 * Env for the server modules is set here and inherited by the test workers.
 */
export default async function setup() {
  let url = process.env.TEST_DATABASE_URL;
  if (!url) {
    local = await startLocalPg();
    url = local.url;
    console.info(`[integration] PGlite on port ${local.port} (set TEST_DATABASE_URL to use real Postgres)`);
  } else {
    console.info("[integration] using TEST_DATABASE_URL");
  }
  await migrateUrl(url);
  const secret = () => randomBytes(32).toString("base64");
  Object.assign(process.env, {
    DATABASE_DRIVER: "pg",
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
    APP_URL: "http://localhost:3100",
    APP_DOMAIN: "toi-pilot.vercel.app",
    SESSION_SECRET: secret(),
    OTP_HMAC_SECRET: secret(),
    CRON_SECRET: secret(),
    SMS_PROVIDER: "console",
    SMS_DAILY_LIMIT: "300",
    // PGlite: one pooled connection (concurrent extended-protocol messages mix on its single backend session)
    DATABASE_POOL_MAX: local ? "1" : "10",
  });
  return async () => {
    await local?.stop();
  };
}
