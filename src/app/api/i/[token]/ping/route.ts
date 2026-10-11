import { db } from "@/server/db";
import { pingGuest } from "@/server/invite/guest";

/** `sendBeacon` from the guest page: `opened` / `envelope` → activity_log (+ families.first_opened_at). */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const kind = (await req.text()).trim();
  if (kind !== "opened" && kind !== "envelope") return new Response(null, { status: 400 });
  const ok = await pingGuest(db(), token, kind);
  return new Response(null, { status: ok ? 204 : 404, headers: { "cache-control": "no-store" } });
}
