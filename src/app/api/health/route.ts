import { pingDb } from "@/server/db";

export const dynamic = "force-dynamic";

/** GET /api/health → { ok, commit, db, time }. No secrets, no error details. */
export async function GET() {
  const db = await pingDb();
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? "dev").slice(0, 7);
  const body = { ok: db === "ok", commit, db, time: new Date().toISOString() };
  return Response.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
