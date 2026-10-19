import { safeEqualHex, sha256Hex } from "@/server/crypto";
import { cleanup } from "@/server/cleanup";
import { db } from "@/server/db";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";

/**
 * Daily retention job (plan 4.4 item 6, 6.7; Ф2 review Б3). Vercel Cron calls it with
 * `Authorization: Bearer $CRON_SECRET`; in KZ a systemd timer + curl does the same.
 * Answers only counts — no data.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const given = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  // Compare hashes in constant time (lengths differ freely).
  if (!given || !safeEqualHex(sha256Hex(given), sha256Hex(env().CRON_SECRET))) {
    return Response.json({ ok: false }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const deleted = await cleanup(db(), new Date());
  return Response.json({ ok: true, deleted }, { headers: { "cache-control": "no-store" } });
}
