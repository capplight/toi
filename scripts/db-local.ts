/**
 * Local database without Docker: `pnpm db:local` → PGlite on 127.0.0.1:5433, data in `.pglite/`.
 * Then in .env.local:
 *   DATABASE_DRIVER=pg
 *   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable
 *   DATABASE_URL_UNPOOLED=<same>
 * and `pnpm db:migrate`, `pnpm db:seed`. The Neon `dev` branch remains the primary option (README).
 * Options: --port 5433, --memory (no data dir).
 */
import { parseArgs } from "node:util";
import { startLocalPg } from "./lib/pglite-server";

const { values } = parseArgs({ options: { port: { type: "string", default: "5433" }, memory: { type: "boolean" } } });
const pg = await startLocalPg({ port: Number(values.port), dataDir: values.memory ? undefined : ".pglite" });
console.log(`PGlite listening: ${pg.url}`);
console.log("Ctrl+C to stop.");
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
