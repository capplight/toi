import { useTranslations } from "next-intl";
import { Icon } from "./Icon";

/** «Тестовая версия» — shown only to the event owner (decision Д4/14). */
export function PilotBanner({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations("legal");
  if (!isOwner) return null;
  return (
    <p className="pilot-banner" role="note">
      <Icon name="alert" size="sm" />
      <span>{t("pilotBanner")}</span>
    </p>
  );
}
