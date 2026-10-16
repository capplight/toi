import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

// Throw-away values for the test server only (never real secrets).
const testSecret = () => randomBytes(32).toString("base64");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  // Migrates and seeds the demo event once (needs DATABASE_URL; in CI it is required — Н5).
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Local fallback when the bundled Chromium cannot be downloaded: E2E_CHANNEL=chrome uses installed Chrome.
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
  projects: [
    {
      name: "mobile",
      testIgnore: /invite-small\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
    },
    {
      name: "desktop",
      testIgnore: /invite-small\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    // Ф1: smallest supported phone, UI checks only; Ф5 review: guest page at 320 px.
    {
      name: "small",
      testMatch: /(ui|invite-small|legal)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    // Ф0 review Н6: the standalone server that ships in Docker (`pnpm build` first), not `next start`.
    command: "node scripts/start-standalone.mjs",
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PORT: String(PORT),
      APP_URL: baseURL,
      APP_DOMAIN: process.env.APP_DOMAIN || "toi-pilot.vercel.app",
      DATABASE_DRIVER: process.env.DATABASE_DRIVER ?? "pg",
      // Without a DB the app still starts; DB-dependent tests are skipped locally and fail in CI (Н5).
      DATABASE_URL: process.env.DATABASE_URL || "postgres://e2e:e2e@127.0.0.1:1/none",
      // Local runs use PGlite (one backend session): one pooled connection; CI (Postgres 16) — the default 10
      DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX || (process.env.CI ? "10" : "1"),
      SESSION_SECRET: process.env.SESSION_SECRET || testSecret(),
      OTP_HMAC_SECRET: process.env.OTP_HMAC_SECRET || testSecret(),
      CRON_SECRET: process.env.CRON_SECRET || testSecret(),
      SMS_PROVIDER: "console",
    },
  },
});
