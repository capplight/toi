import { describe, expect, it } from "vitest";
import { isKzMobile } from "@/domain/guests/phone";
import { deviceLabel } from "@/server/auth/device";
import { hmacHex, otpCode, randomToken, safeEqualHex, sessionToken, sha256Hex } from "@/server/crypto";
import { parseEnv } from "@/server/env";

const secret = "x".repeat(44);
const base = {
  APP_URL: "https://toi-pilot.vercel.app",
  APP_DOMAIN: "toi-pilot.vercel.app",
  DATABASE_URL: "postgres://u:p@h/db",
  SESSION_SECRET: secret,
  OTP_HMAC_SECRET: secret,
  CRON_SECRET: secret,
  SMS_PROVIDER: "smsc",
};

describe("env in production (Ф0 review Н3)", () => {
  it("APP_URL is required explicitly — no VERCEL_URL fallback", () => {
    expect(() => parseEnv({ ...base, VERCEL_ENV: "production", APP_URL: "", VERCEL_URL: "x.vercel.app" })).toThrow(
      /APP_URL/,
    );
    expect(parseEnv({ ...base, VERCEL_ENV: "preview", APP_URL: "", VERCEL_URL: "x.vercel.app" }).APP_URL).toBe(
      "https://x.vercel.app",
    );
  });

  it("SMS_PROVIDER=console is refused in production", () => {
    expect(() => parseEnv({ ...base, VERCEL_ENV: "production", SMS_PROVIDER: "console" })).toThrow(
      /console is not allowed/,
    );
    expect(() => parseEnv({ ...base, VERCEL_ENV: "production", SMS_PROVIDER: "" })).toThrow(/console/); // default = console
    expect(parseEnv({ ...base, VERCEL_ENV: "production" }).SMS_PROVIDER).toBe("smsc");
    expect(parseEnv({ ...base, VERCEL_ENV: "preview", SMS_PROVIDER: "console" }).SMS_PROVIDER).toBe("console");
  });
});

describe("isKzMobile (Н4)", () => {
  it("only +7 7XX numbers", () => {
    expect(isKzMobile("+77011234567")).toBe(true);
    expect(isKzMobile("+77771234567")).toBe(true);
    expect(isKzMobile("+79051234567")).toBe(false);
    expect(isKzMobile("87011234567")).toBe(false); // E.164 expected
    // Note: KZ landlines (+7 7172…, +7 727…) also start with 7 — Н4 rule as specified; SMS to them just fails.
  });
});

describe("crypto (plan 9)", () => {
  it("tokens: 22-char base62, unique; session token 43-char base64url", () => {
    const set = new Set(Array.from({ length: 2000 }, () => randomToken()));
    expect(set.size).toBe(2000);
    for (const t of set) expect(t).toMatch(/^[0-9A-Za-z]{22}$/);
    expect(sessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("6-digit codes, sha256/hmac hex, constant-time compare", () => {
    for (let i = 0; i < 200; i++) expect(otpCode()).toMatch(/^\d{6}$/);
    expect(sha256Hex("a")).toHaveLength(64);
    const h = hmacHex("k", "v");
    expect(safeEqualHex(h, hmacHex("k", "v"))).toBe(true);
    expect(safeEqualHex(h, hmacHex("k", "w"))).toBe(false);
    expect(safeEqualHex(h, "")).toBe(false);
  });
});

describe("deviceLabel", () => {
  it.each([
    [
      "Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      "Android · Chrome",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Version/17.6 Mobile/15E148 Safari/604.1",
      "iOS · Safari",
    ],
    [
      "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
      "Android · Samsung Internet",
    ],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0", "Windows · Edge"],
    ["curl/8", null],
    [null, null],
  ])("%s → %s", (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });
});
