import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { setLocale } from "@/server/actions/locale";
import { Mark, Shanyraq } from "@/ui/ornaments/generated";
import { AuthLanguageSwitch } from "./AuthLanguageSwitch";

/**
 * Mockup 09 frame for /join and /login: night panel (mark, visible ҚАЗ | РУС — allowed here by Д3,
 * drawing шаңырақ, event title as the owner typed it) + the ivory card.
 */
export async function AuthFrame({
  eventTitle,
  eventLine,
  children,
}: {
  eventTitle?: string;
  eventLine?: string;
  children: ReactNode;
}) {
  const t = await getTranslations("meta");
  const locale = (await getLocale()) as "kk" | "ru";
  return (
    <div className="auth">
      <section className="auth-art">
        <div className="wm-row">
          <span className="wm">
            <Mark />
            {t("appName")}
          </span>
          <AuthLanguageSwitch value={locale} action={setLocale} />
        </div>
        <Shanyraq className="shanyraq draw" />
        {eventTitle && (
          <p className="ev">
            {eventTitle}
            {eventLine && <small>{eventLine}</small>}
          </p>
        )}
      </section>
      <main className="auth-card">{children}</main>
    </div>
  );
}
