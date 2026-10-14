import { z } from "zod";
import { NotFoundError } from "@/server/auth/access";
import { db } from "@/server/db";
import { DOOR_MAX_OPS, recordCheckins } from "@/server/door/service";

/**
 * Ф8 door helper: «Келді» marks from a device's outbox (plan 6.6). Idempotent by `opId`; the latest `clientAt`
 * wins; answers the current arrivals. 600 ops per hour per token (429); unknown / rotated token → 404.
 */
export const dynamic = "force-dynamic";

const body = z.object({
  deviceId: z.string().min(8).max(64),
  ops: z
    .array(
      z.object({
        opId: z.uuid(),
        familyId: z.uuid(),
        arrived: z.boolean(),
        clientAt: z.iso.datetime(),
      }),
    )
    .max(DOOR_MAX_OPS),
});

export async function POST(req: Request, ctx: RouteContext<"/api/door/[token]/checkins">) {
  const { token } = await ctx.params;
  const p = body.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ ok: false, error: "invalid" }, { status: 400 });
  try {
    const r = await recordCheckins(db(), token, p.data);
    if (!r.ok) return Response.json(r, { status: r.error === "rateLimited" ? 429 : 400 });
    return Response.json(r, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof NotFoundError) return Response.json({ error: "notFound" }, { status: 404 });
    throw e;
  }
}
