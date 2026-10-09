import { sql } from "drizzle-orm";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as NeonPool } from "@neondatabase/serverless";
import pg from "pg";
import { env } from "./env";
import * as schema from "./schema";

/**
 * The only module that talks to the database (plan 4.4, item 2).
 * DATABASE_DRIVER=neon → @neondatabase/serverless (Vercel), DATABASE_DRIVER=pg → node-postgres (Docker/KZ).
 * Both pools are created lazily on first use, so importing this module never opens a connection.
 */
export type Db = NeonDatabase<typeof schema> | NodePgDatabase<typeof schema>;

let instance: Db | undefined;

export function db(): Db {
  if (instance) return instance;
  const { DATABASE_DRIVER, DATABASE_URL } = env();
  instance =
    DATABASE_DRIVER === "neon"
      ? drizzleNeon({ client: new NeonPool({ connectionString: DATABASE_URL }), schema })
      : drizzlePg({
          client: new pg.Pool({ connectionString: DATABASE_URL, max: 10 }),
          schema,
        });
  return instance;
}

/** `select 1` with a timeout. Never throws; never exposes error details. */
export async function pingDb(timeoutMs = 5000): Promise<"ok" | "error"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("db ping timeout")), timeoutMs);
    });
    await Promise.race([db().execute(sql`select 1`), timeout]);
    return "ok";
  } catch {
    return "error";
  } finally {
    if (timer) clearTimeout(timer);
  }
}
