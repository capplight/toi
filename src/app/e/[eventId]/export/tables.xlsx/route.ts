import { getLocale, getTranslations } from "next-intl/server";
import { asLocale } from "@/domain/format";
import { exportFileName } from "@/domain/print";
import { ForbiddenError, UnauthorizedError } from "@/server/auth/access";
import { requireUser } from "@/server/authz";
import { db } from "@/server/db";
import { buildWorkbook } from "@/server/export/xlsx";
import { logExport, printView } from "@/server/print/queries";

/**
 * `GET /e/{id}/export/tables.xlsx` (plan 6.7, Ф10 brief §3): any member of the event; never cached; no phones.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/e/[eventId]/export/tables.xlsx">) {
  const { eventId } = await ctx.params;
  try {
    const user = await requireUser();
    const locale = asLocale(await getLocale());
    const v = await printView(db(), user, eventId, locale);
    const t = await getTranslations("export");
    const ts = await getTranslations("common.status");
    const file = await buildWorkbook(v, {
      sheets: { tables: t("sheets.tables"), guests: t("sheets.guests"), categories: t("sheets.categories") },
      columns: {
        table: t("columns.table"),
        name: t("columns.name"),
        seats: t("columns.seats"),
        category: t("columns.category"),
        status: t("columns.status"),
        list: t("columns.list"),
        families: t("columns.families"),
        tables: t("columns.tables"),
      },
      status: { yes: ts("yes"), pending: ts("noAnswer") },
    });
    await logExport(db(), eventId, "xlsx");
    const name = exportFileName(v.event.title, v.event.startsOn);
    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof UnauthorizedError) return Response.json({ error: "unauthorized" }, { status: 401 });
    if (e instanceof ForbiddenError) return Response.json({ error: "forbidden" }, { status: 403 });
    throw e;
  }
}
