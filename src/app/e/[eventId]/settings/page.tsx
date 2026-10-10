import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ForbiddenError, requireOwner } from "@/server/authz";
import { LinkRow, LinkRows } from "@/ui/components/Display";

/** «Баптаулар» (owner only). Ф3: «Тізімді кім толтырады»; event fields and the rest of the settings follow later. */
export default async function SettingsPage({ params }: PageProps<"/e/[eventId]/settings">) {
  const { eventId } = await params;
  try {
    await requireOwner(eventId);
  } catch (err) {
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const t = await getTranslations();
  return (
    <div className="page-narrow">
      <h1 className="t-h1 page desk-only">{t("meta.pages.settings")}</h1>
      <LinkRows>
        <LinkRow href={`/e/${eventId}/settings/members`} icon="users" title={t("settings.sections.members")} />
      </LinkRows>
    </div>
  );
}
