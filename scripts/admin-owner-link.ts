/**
 * `pnpm admin:owner-link +77011234567 [--note "pilot family"]` — plan 6.1 flow 4.
 * Adds the number to `allowed_owners` and prints a one-time 72-hour login link (`owner_bootstrap`).
 * Founder only: needs the production env. Send the link from your own WhatsApp.
 */
import { parseArgs } from "node:util";
import { loadEnv } from "./lib/cli-env";

loadEnv();
const { normalizePhone, maskPhone } = await import("../src/domain/guests/phone");
const { db, closeDb } = await import("../src/server/db");
const { issueOwnerBootstrapLink } = await import("../src/server/auth/loginLinks");

const { values, positionals } = parseArgs({ options: { note: { type: "string" } }, allowPositionals: true });
const phone = normalizePhone(positionals[0]);
if (!phone) {
  console.error("admin:owner-link: give a phone number, e.g. pnpm admin:owner-link +77011234567");
  process.exit(1);
}
try {
  const link = await issueOwnerBootstrapLink(db(), { phone, note: values.note, now: new Date() });
  console.log(`owner link for ${maskPhone(phone)} (valid until ${link.expiresAt.toISOString()}):`);
  console.log(link.url);
} finally {
  await closeDb();
}
