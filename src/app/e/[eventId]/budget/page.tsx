import { asLocale, datePlate, formatDayMonth, formatNumericDay } from "@/domain/format";
import { getLocale, getTranslations } from "next-intl/server";
import { budgetView } from "@/server/budget/service";
import { ForbiddenError, requireUser } from "@/server/authz";
import { db } from "@/server/db";
import { ButtonLink } from "@/ui/components/Button";
import { Icon } from "@/ui/components/Icon";
import { memberOr404 } from "../guests/data";
import { type BudgetDates, BudgetScreen } from "./BudgetScreen";

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
  // Ф10 §4: the shared formatters (no `Intl` with kk)
  const locale = asLocale(await getLocale());
  const keys = new Set(v.items.flatMap((i) => [i.dueDate, i.changedAt.slice(0, 10)]).filter((d): d is string => !!d));
  const dates: BudgetDates = Object.fromEntries(
    [...keys].map((d) => [
      d,
      {
        ...datePlate(d, locale),
        short: formatNumericDay(d),
        long: formatDayMonth(d, locale),
      },
    ]),
  );
  return <BudgetScreen v={v} dates={dates} />;
}
