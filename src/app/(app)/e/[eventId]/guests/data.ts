import { getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { ForbiddenError, requireMember, UnauthorizedError } from "@/server/authz";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { guestsData } from "@/server/guests/queries";

/** Access check shared by the guest pages (layouts and pages render in parallel — each checks itself). */
export async function memberOr404(eventId: string) {
  try {
    return await requireMember(eventId);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
}

export async function guestsPageData(eventId: string, listMemberId: string | null) {
  const m = await memberOr404(eventId);
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "kk";
  return guestsData(db(), m, { listMemberId, locale, appUrl: env().APP_URL });
}
