import { cookies } from "next/headers";
import { isLocale } from "@/i18n/config";
import { NotFoundError } from "@/server/auth/access";
import { db } from "@/server/db";
import { doorSnapshot } from "@/server/door/service";

/**
 * Ф8 door helper: the snapshot for offline search (plan 6.6). No phones; never cached (the helper's device keeps
 * it in IndexedDB). Unknown or rotated token → 404.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/door/[token]/snapshot">) {
  const { token } = await ctx.params;
  const raw = (await cookies()).get("locale")?.value;
  try {
    const snap = await doorSnapshot(db(), token, { locale: raw && isLocale(raw) ? raw : "kk" });
    return Response.json(snap, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof NotFoundError) return Response.json({ error: "notFound" }, { status: 404 });
    throw e;
  }
}
