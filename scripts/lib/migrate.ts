import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Apply db/migrations to a database URL (tests; `pnpm db:migrate` uses drizzle-kit). */
export async function migrateUrl(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: resolve(process.cwd(), "db/migrations") });
  } finally {
    await pool.end();
  }
}
