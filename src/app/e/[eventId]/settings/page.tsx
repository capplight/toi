import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ForbiddenError, requireOwner } from "@/server/authz";

/** «Баптаулар» — placeholder until Ф3 (owner only). */
export default async function SettingsPage({ params }: PageProps<"/e/[eventId]/settings">) {
  const { eventId } = await params;
  try {
    await requireOwner(eventId);
  } catch (err) {
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const t = await getTranslations("meta.pages");
  return <h1 className="t-h1 page desk-only">{t("settings")}</h1>;
}
