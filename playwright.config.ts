import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/** True when a real Postgres is available for the smoke run (CI service or local Neon `dev`). */
export const hasDatabase = Boolean(process.env.DATABASE_URL);

// Throw-away values for the test server only (never real secrets).
const testSecret = () => randomBytes(32).toString("base64");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    // Local fallback when the bundled Chromium cannot be downloaded: E2E_CHANNEL=chrome uses installed Chrome.
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true },
    },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // Runs the production build (`pnpm build` first).
    command: `pnpm start --port ${PORT}`,
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_URL: baseURL,
      APP_DOMAIN: process.env.APP_DOMAIN || "toi-pilot.vercel.app",
      DATABASE_DRIVER: hasDatabase ? (process.env.DATABASE_DRIVER ?? "pg") : "pg",
      // Without a DB the app still starts; /api/health then reports db:"error" and that test is skipped.
      DATABASE_URL: process.env.DATABASE_URL || "postgres://e2e:e2e@127.0.0.1:1/none",
      SESSION_SECRET: process.env.SESSION_SECRET || testSecret(),
      OTP_HMAC_SECRET: process.env.OTP_HMAC_SECRET || testSecret(),
      CRON_SECRET: process.env.CRON_SECRET || testSecret(),
      SMS_PROVIDER: "console",
    },
  },
});
