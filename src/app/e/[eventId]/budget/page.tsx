import { getTranslations } from "next-intl/server";
import { budgetView } from "@/server/budget/service";
import { ForbiddenError, requireUser } from "@/server/authz";
import { db } from "@/server/db";
import { ButtonLink } from "@/ui/components/Button";
import { Icon } from "@/ui/components/Icon";
import { memberOr404 } from "../guests/data";
import { BudgetScreen } from "./BudgetScreen";

/**
 * «Шығындар» (Ф9, DESIGN 8.20, mockup 13). Owner and members with `can_manage_budget` (Р9); anybody else who opens
 * the address directly sees `#noright` (`errors.forbidden` + «Басты бетке өту») — the menu item is hidden for them.
 */
export default async function BudgetPage({ params }: PageProps<"/e/[eventId]/budget">) {
  const { eventId } = await params;
  await memberOr404(eventId);
  const user = await requireUser();
  let v;
  try {
    v = await budgetView(db(), user, eventId);
  } catch (err) {
    if (!(err instanceof ForbiddenError)) throw err;
  }
  if (!v) {
    const t = await getTranslations("errors");
    return (
      <div className="forbid" data-testid="budget-noright">
        <Icon name="lock" />
        <p>{t("forbidden")}</p>
        <ButtonLink href={`/e/${eventId}/summary`} variant="secondary">
          {t("goHome")}
        </ButtonLink>
      </div>
    );
  }
  return <BudgetScreen v={v} />;
}
