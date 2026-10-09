/**
 * `pnpm db:seed [--links]` — demo event «Айбек пен Дана» from tests/fixtures/sample-event.ts (plan 11.5).
 * Local and preview only. `--links` also prints one-time login links for Әкесі / Анасы / Жастар.
 */
import { loadEnv } from "./lib/cli-env";

loadEnv();
const { seedSample, DEMO_PHONES } = await import("./lib/seed-sample");
const { db, closeDb } = await import("../src/server/db");
const { issueMemberLink } = await import("../src/server/auth/loginLinks");
const { maskPhone } = await import("../src/domain/guests/phone");

try {
  const r = await seedSample(db());
  console.log(`seed: event ${r.eventId} — 65 families, 16 tables, history h1–h6`);
  for (const [k, phone] of Object.entries(DEMO_PHONES)) console.log(`  ${k}: ${maskPhone(phone)} (demo number)`);
  if (process.argv.includes("--links")) {
    for (const k of ["ake", "ana", "jas"] as const) {
      const link = await issueMemberLink(db(), { memberId: r.memberIds[k], createdBy: null, now: new Date() });
      console.log(`  ${k} login link (72 h, one-time): ${link.url}`);
    }
  }
} finally {
  await closeDb();
}
