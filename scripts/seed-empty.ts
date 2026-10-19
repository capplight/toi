/** `pnpm db:seed-empty` — an empty event for the first-run check (plan 11.5). Local and preview only. */
import { loadEnv } from "./lib/cli-env";

loadEnv();
const { seedEmpty } = await import("./lib/seed-sample");
const { db, closeDb } = await import("../src/server/db");
try {
  const r = await seedEmpty(db());
  console.log(`seed-empty: event ${r.eventId} (owner +7 700 *** ** 09, no hall, no families)`);
} finally {
  await closeDb();
}
