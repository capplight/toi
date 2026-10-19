import { sql } from "drizzle-orm";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from "drizzle-orm/pg-core";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { Pool as NeonPool } from "@neondatabase/serverless";
import pg from "pg";
import { env } from "./env";
import * as schema from "./schema";

/**
 * The only module that talks to the database (plan 4.4, item 2).
 * DATABASE_DRIVER=neon → @neondatabase/serverless (Vercel), DATABASE_DRIVER=pg → node-postgres (Docker/KZ, CI, local PGlite).
 * Both pools are created lazily on first use, so importing this module never opens a connection.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = PgTransaction<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;
export type DbOrTx = Db | Tx;

let instance: Db | undefined;
let closer: (() => Promise<void>) | undefined;

export function db(): Db {
  if (instance) return instance;
  const { DATABASE_DRIVER, DATABASE_URL, DATABASE_POOL_MAX } = env();
  if (DATABASE_DRIVER === "neon") {
    const pool = new NeonPool({ connectionString: DATABASE_URL });
    instance = drizzleNeon({ client: pool, schema }) as unknown as Db;
    closer = () => pool.end();
  } else {
    const pool = new pg.Pool({ connectionString: DATABASE_URL, max: DATABASE_POOL_MAX });
    instance = drizzlePg({ client: pool, schema }) as unknown as Db;
    closer = () => pool.end();
  }
  return instance;
}

/** Close the pool (scripts and tests). */
export async function closeDb(): Promise<void> {
  const c = closer;
  instance = undefined;
  closer = undefined;
  if (c) await c();
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
