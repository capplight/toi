import { z } from "zod";
import { ForbiddenError, UnauthorizedError } from "@/server/auth/access";
import { requireUser } from "@/server/authz";
import { db } from "@/server/db";
import { finalizeUpload } from "@/server/media/music";

/**
 * `finalizeUpload` (plan 6.2, brief §2): synchronous ffmpeg processing in a route (`maxDuration` 60 s on Vercel —
 * [ПРОВЕРИТЬ] the function size with the ffmpeg binary). Body `{ assetId }`; the owner's session cookie.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const p = z.object({ assetId: z.uuid() }).safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  try {
    const user = await requireUser();
    const r = await finalizeUpload(db(), user, p.data.assetId);
    return Response.json(r, { status: r.ok ? 200 : r.error === "rateLimited" ? 429 : 422 });
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof UnauthorizedError)
      return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
    throw e;
  }
}
