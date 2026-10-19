import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ForbiddenError, requireBudget } from "@/server/authz";

/** «Шығындар» — placeholder until Ф9. Hidden without `can_manage_budget` (404, plan 5.3). */
export default async function BudgetPage({ params }: PageProps<"/e/[eventId]/budget">) {
  const { eventId } = await params;
  try {
    await requireBudget(eventId);
  } catch (err) {
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const t = await getTranslations("meta.pages");
  return <h1 className="t-h1 page desk-only">{t("budget")}</h1>;
}
