import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "@/server/env";

const secret = "x".repeat(44);
const base = {
  APP_URL: "http://localhost:3000",
  APP_DOMAIN: "toi-pilot.vercel.app",
  DATABASE_URL: "postgres://user:SuperSecretPassword@localhost:5432/toi",
  SESSION_SECRET: secret,
  OTP_HMAC_SECRET: secret,
  CRON_SECRET: secret,
};

describe("env", () => {
  it("parses a minimal valid env with safe defaults; optional modules are off", () => {
    const e = parseEnv(base);
    expect(e.DATABASE_DRIVER).toBe("neon");
    expect(e.SMS_PROVIDER).toBe("console");
    expect(e.SMS_DAILY_LIMIT).toBe(300);
    expect(e.smsc).toBeNull();
    expect(e.mobizon).toBeNull();
    expect(e.s3).toBeNull();
    expect(e.sentryEnabled).toBe(false);
  });

  it("treats empty strings (as in .env.example) as missing", () => {
    expect(() => parseEnv({ ...base, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
  });

  it("names the missing variable and never prints values", () => {
    const rest: Partial<typeof base> = { ...base };
    delete rest.DATABASE_URL;
    try {
      parseEnv({ ...rest, SESSION_SECRET: "short-secret-value" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      const msg = (err as Error).message;
      expect(msg).toContain("DATABASE_URL");
      expect(msg).toContain("SESSION_SECRET");
      expect(msg).not.toContain("short-secret-value");
      expect(msg).not.toContain("SuperSecretPassword");
    }
  });

  it("rejects APP_DOMAIN longer than 20 chars (decision А2)", () => {
    expect(() => parseEnv({ ...base, APP_DOMAIN: "toi-pilot-1.vercel.app" })).toThrow(/APP_DOMAIN/);
  });

  it("switches modules on when their variables are present", () => {
    const e = parseEnv({
      ...base,
      SMSC_LOGIN: "l",
      SMSC_PASSWORD: "p",
      MOBIZON_API_KEY: "k",
      S3_ENDPOINT: "https://x.r2.cloudflarestorage.com",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "a",
      S3_SECRET_ACCESS_KEY: "s",
      SENTRY_DSN: "https://k@o.ingest.sentry.io/1",
    });
    expect(e.smsc).not.toBeNull();
    expect(e.mobizon?.apiDomain).toBe("api.mobizon.kz");
    expect(e.s3?.region).toBe("auto");
    expect(e.sentryEnabled).toBe(true);
  });
});
