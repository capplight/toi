/**
 * Test SMS delivery (brief Ф0 3.6).
 *
 *   pnpm sms:test --provider smsc|mobizon --to +77011234567 [--lang kk|ru] [--operator Kcell]
 *
 * - Only numbers listed in SMS_TEST_ALLOWLIST are accepted.
 * - Text = sms.otp from content/messages/{lang}.json with a random code and APP_DOMAIN.
 * - Polls delivery status for up to 90 s, then prints one Markdown report row.
 * - The phone is masked in all output; credentials are never printed.
 */
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import nextEnv from "@next/env"; // CJS package: no named ESM exports
import { createTranslator } from "next-intl";
import { maskPhone, normalizePhone } from "../src/domain/guests/phone";
import { MobizonProvider } from "../src/server/sms/mobizon";
import { SmscKzProvider } from "../src/server/sms/smsc";
import type { SmsProvider, SmsStatus } from "../src/server/sms/types";

const POLL_TOTAL_MS = 90_000;
const POLL_EVERY_MS = 5_000;

function fail(message: string): never {
  console.error(`sms:test: ${message}`);
  process.exit(1);
}

function buildProvider(name: string): SmsProvider {
  const e = process.env;
  if (name === "smsc") {
    if (!e.SMSC_LOGIN || !e.SMSC_PASSWORD) fail("SMSC_LOGIN / SMSC_PASSWORD are not set (.env.local)");
    return new SmscKzProvider({ login: e.SMSC_LOGIN, password: e.SMSC_PASSWORD, sender: e.SMSC_SENDER || undefined });
  }
  if (name === "mobizon") {
    if (!e.MOBIZON_API_KEY) fail("MOBIZON_API_KEY is not set (.env.local)");
    return new MobizonProvider({ apiKey: e.MOBIZON_API_KEY, apiDomain: e.MOBIZON_API_DOMAIN || "api.mobizon.kz" });
  }
  fail(`--provider must be smsc or mobizon, got "${name}"`);
}

export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((p) => normalizePhone(p))
      .filter((p): p is string => p !== null),
  );
}

export function otpText(lang: "kk" | "ru", code: string, domain: string, root = process.cwd()): string {
  const messages = JSON.parse(readFileSync(resolve(root, "content/messages", `${lang}.json`), "utf8"));
  const t = createTranslator({ locale: lang, messages });
  return t("sms.otp", { code, domain });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const almatyTime = (d: Date) => d.toLocaleTimeString("ru-RU", { timeZone: "Asia/Almaty", hour12: false });

async function main() {
  nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });

  const { values } = parseArgs({
    options: {
      provider: { type: "string" },
      to: { type: "string" },
      lang: { type: "string", default: "kk" },
      operator: { type: "string", default: "?" },
    },
  });

  const provider = buildProvider(values.provider ?? "");
  const to = normalizePhone(values.to);
  if (!to) fail("--to must be a Kazakhstan number, e.g. +77011234567");
  const lang = values.lang === "ru" ? "ru" : values.lang === "kk" ? "kk" : fail("--lang must be kk or ru");

  const allow = parseAllowlist(process.env.SMS_TEST_ALLOWLIST);
  if (!allow.has(to)) fail(`${maskPhone(to)} is not in SMS_TEST_ALLOWLIST — refusing to send`);

  const domain = process.env.APP_DOMAIN;
  if (!domain) fail("APP_DOMAIN is not set (.env.local)");

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const text = otpText(lang, code, domain);
  console.log(`Sending via ${provider.name} to ${maskPhone(to)} (${lang}, ${text.length} chars), code ${code}`);

  const sentAt = new Date();
  const sent = await provider.send(to, text);
  let status: SmsStatus = sent.status;
  let deliveredAfter: number | null = null;

  const deadline = Date.now() + POLL_TOTAL_MS;
  while (Date.now() < deadline && status !== "delivered" && status !== "failed") {
    await sleep(POLL_EVERY_MS);
    try {
      status = await provider.status(sent.providerMsgId, to);
    } catch (err) {
      console.error(`status check failed: ${(err as Error).message}`);
    }
    process.stdout.write(`  ${Math.round((Date.now() - sentAt.getTime()) / 1000)} s: ${status}\n`);
    if (status === "delivered") deliveredAfter = Math.round((Date.now() - sentAt.getTime()) / 1000);
  }

  const cost = sent.cost === null ? "—" : `${sent.cost} ₸`;
  console.log("\n| оператор | провайдер | отправлено | статус | доставлено через, с | стоимость | id |");
  console.log("|---|---|---|---|---|---|---|");
  console.log(
    `| ${values.operator} | ${provider.name} | ${almatyTime(sentAt)} | ${status} | ${deliveredAfter ?? "—"} | ${cost} | ${sent.providerMsgId} |`,
  );
  console.log(`\nТелефон: ${maskPhone(to)}. Отметьте у человека: пришло / не пришло, через сколько секунд.`);
}

// Run only as a CLI (the helpers above are unit-tested).
if (process.argv[1] && resolve(process.argv[1]).endsWith("sms-test.ts")) {
  main().catch((err: unknown) => fail(err instanceof Error ? err.message : "unexpected error"));
}
