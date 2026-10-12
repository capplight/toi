import { ForbiddenError, UnauthorizedError } from "@/server/auth/access";
import { requireUser } from "@/server/authz";
import { db } from "@/server/db";
import { pollState } from "@/server/summary/queries";

/**
 * Polling of `seating_version` (plan 7.5, Ф6): a working screen asks every 15 s while the tab is visible and
 * re-renders on the server when the number changed. `{ version, activity }` — `activity` (RA Л2) is the latest
 * send / opening / answer, so «Қорытынды» follows those too. Members only; never cached.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/e/[eventId]/version">) {
  const { eventId } = await ctx.params;
  try {
    const user = await requireUser();
    return Response.json(await pollState(db(), user, eventId), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (e instanceof ForbiddenError) return Response.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }
}
