import { and, eq, sql } from "drizzle-orm";
import type { DbOrTx } from "./db";
import { rateLimits } from "./schema";

/**
 * Fixed-window rate limits stored in Postgres (plan 4.4 item 5, plan 9):
 * `insert … on conflict do update set count = count + 1 returning count`.
 * Keys never contain a raw phone number (callers pass a hash).
 */
export type Limit = { key: string; windowSec: number; max: number };
export type LimitResult = { ok: boolean; count: number; retryAfterSec: number };

function windowStart(now: Date, windowSec: number): Date {
  const ms = windowSec * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

function retryAfter(now: Date, windowSec: number): number {
  const start = windowStart(now, windowSec).getTime();
  return Math.max(1, Math.ceil((start + windowSec * 1000 - now.getTime()) / 1000));
}

/** Count one hit; `ok` = still within the limit after counting it. */
export async function hit(db: DbOrTx, limit: Limit, now: Date): Promise<LimitResult> {
  const ws = windowStart(now, limit.windowSec);
  const [row] = await db
    .insert(rateLimits)
    .values({ key: limit.key, windowStart: ws, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const count = row?.count ?? 1;
  return { ok: count <= limit.max, count, retryAfterSec: retryAfter(now, limit.windowSec) };
}

/** Current count without counting (for «N failures per hour» checks). */
export async function peek(db: DbOrTx, limit: Limit, now: Date): Promise<LimitResult> {
  const ws = windowStart(now, limit.windowSec);
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, limit.key), eq(rateLimits.windowStart, ws)));
  const count = row?.count ?? 0;
  return { ok: count < limit.max, count, retryAfterSec: retryAfter(now, limit.windowSec) };
}
