import { z } from "zod";

/**
 * Server environment (brief Ф0 3.3, plan 4.4).
 *
 * - Required variables: missing → a clear error that names the variable(s).
 * - Optional modules (SMS providers, S3, Sentry) are switched off when their variables are absent.
 * - Values are never printed: error messages contain variable names only.
 */

const empty = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optionalStr = z.preprocess(empty, z.string().optional());
const requiredStr = z.preprocess(empty, z.string({ error: "is required" }));
const secret = z.preprocess(
  empty,
  z.string({ error: "is required" }).min(32, { error: "must be at least 32 characters" }),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  APP_URL: z.preprocess(empty, z.url({ error: "is required (absolute URL)" })),
  // Part of the WebOTP line in sms.otp; ≤ 20 chars keeps the SMS in one segment (decision А2).
  APP_DOMAIN: z.preprocess(
    empty,
    z
      .string({ error: "is required" })
      .max(20, { error: "must be ≤ 20 characters (decision А2, sms.otp in one segment)" })
      .regex(/^[a-z0-9.-]+$/, { error: "must be a bare host name, e.g. toi-pilot.vercel.app" }),
  ),

  DATABASE_DRIVER: z.preprocess(empty, z.enum(["neon", "pg"]).default("neon")),
  DATABASE_URL: requiredStr,
  DATABASE_URL_UNPOOLED: optionalStr,

  SESSION_SECRET: secret,
  OTP_HMAC_SECRET: secret,
  CRON_SECRET: secret,

  SMS_PROVIDER: z.preprocess(empty, z.enum(["console", "smsc", "mobizon"]).default("console")),
  SMS_FALLBACK_PROVIDER: z.preprocess(empty, z.enum(["smsc", "mobizon"]).optional()),
  SMS_DAILY_LIMIT: z.preprocess(empty, z.coerce.number().int().positive().default(300)),
  SMS_TEST_ALLOWLIST: optionalStr,
  SMSC_LOGIN: optionalStr,
  SMSC_PASSWORD: optionalStr,
  SMSC_SENDER: optionalStr,
  MOBIZON_API_KEY: optionalStr,
  MOBIZON_API_DOMAIN: z.preprocess(empty, z.string().default("api.mobizon.kz")),

  S3_ENDPOINT: optionalStr,
  S3_REGION: z.preprocess(empty, z.string().default("auto")),
  S3_BUCKET: optionalStr,
  S3_ACCESS_KEY_ID: optionalStr,
  S3_SECRET_ACCESS_KEY: optionalStr,

  SENTRY_DSN: optionalStr,

  /** Set by Vercel: production | preview | development. */
  VERCEL_ENV: optionalStr,
});

type Raw = z.infer<typeof schema>;

export type SmscConfig = { login: string; password: string; sender: string | undefined };
export type MobizonConfig = { apiKey: string; apiDomain: string };
export type S3Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export type Env = Raw & {
  /** null = module switched off (its variables are not set). */
  smsc: SmscConfig | null;
  mobizon: MobizonConfig | null;
  s3: S3Config | null;
  sentryEnabled: boolean;
};

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}\n` +
        `See .env.example (local: .env.local; Vercel: Project → Settings → Environment Variables).`,
    );
    this.name = "EnvError";
  }
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Vercel Preview: each deployment has its own URL, so APP_URL may be left empty there.
  // Production must set APP_URL explicitly (Ф0 review Н3).
  const production = source.VERCEL_ENV === "production";
  const appUrl =
    source.APP_URL?.trim() || (!production && source.VERCEL_URL ? `https://${source.VERCEL_URL}` : undefined);
  const result = schema.safeParse({ ...source, APP_URL: appUrl });
  if (!result.success) {
    // Only variable names and rule descriptions — never values.
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new EnvError(issues);
  }
  const raw = result.data;
  if (production) {
    // ConsoleProvider writes the SMS text (with the code) to the log — never in production (Н3).
    if (raw.SMS_PROVIDER === "console") {
      throw new EnvError(["SMS_PROVIDER: console is not allowed in production (use smsc or mobizon)"]);
    }
  }

  const smsc =
    raw.SMSC_LOGIN && raw.SMSC_PASSWORD
      ? { login: raw.SMSC_LOGIN, password: raw.SMSC_PASSWORD, sender: raw.SMSC_SENDER }
      : null;
  const mobizon = raw.MOBIZON_API_KEY ? { apiKey: raw.MOBIZON_API_KEY, apiDomain: raw.MOBIZON_API_DOMAIN } : null;
  const s3 =
    raw.S3_ENDPOINT && raw.S3_BUCKET && raw.S3_ACCESS_KEY_ID && raw.S3_SECRET_ACCESS_KEY
      ? {
          endpoint: raw.S3_ENDPOINT,
          region: raw.S3_REGION,
          bucket: raw.S3_BUCKET,
          accessKeyId: raw.S3_ACCESS_KEY_ID,
          secretAccessKey: raw.S3_SECRET_ACCESS_KEY,
        }
      : null;

  return { ...raw, smsc, mobizon, s3, sentryEnabled: Boolean(raw.SENTRY_DSN) };
}

let cached: Env | undefined;

/** Validated server environment, parsed lazily on first use and cached. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
