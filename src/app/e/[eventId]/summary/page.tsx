import { getTranslations } from "next-intl/server";
import { requireMember } from "@/server/authz";
import { LinkRow, LinkRows } from "@/ui/components/Display";

/** «Қорытынды» — placeholder until Ф6. On phones «Шығындар» is a card here (only with the right, DESIGN_v2 4). */
export default async function SummaryPage({ params }: PageProps<"/e/[eventId]/summary">) {
  const { eventId } = await params;
  const m = await requireMember(eventId);
  const t = await getTranslations();
  const budget = m.role === "owner" || m.canManageBudget;
  return (
    <>
      <h1 className="t-h1 page desk-only">{t("meta.pages.summary")}</h1>
      {budget && (
        <div className="mob-only" style={{ marginTop: 16 }}>
          <LinkRows>
            <LinkRow href={`/e/${eventId}/budget`} icon="wallet" title={t("nav.budget")} />
          </LinkRows>
        </div>
      )}
    </>
  );
}
