import { getLocale } from "next-intl/server";
import { isLocale } from "@/i18n/config";
import { db } from "@/server/db";
import { hallView } from "@/server/seating/view";
import { memberOr404 } from "../guests/data";

/** «Зал» data for a page (access: any member; actions check the seating right on the server). */
export async function hallPageData(eventId: string) {
  const m = await memberOr404(eventId);
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "kk";
  return hallView(db(), m.user, eventId, { locale });
}
