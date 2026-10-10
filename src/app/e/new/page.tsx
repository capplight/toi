import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/authz";
import { db } from "@/server/db";
import { canCreateEvents } from "@/server/events/service";
import { Icon } from "@/ui/components/Icon";
import { Wizard } from "./Wizard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const CLIENT_NAMESPACES = ["common", "wizard", "hall", "events", "legal", "roles", "meta", "errors"];

/**
 * `/e/new` — «Жаңа той» (Ф3, mockup 10). Who may create events: scope 'all' + `allowed_owners` (plan 6.2).
 * A link session (scope 'events') sees `wizard.needFullLogin` with «SMS-кодпен кіру» (mockup `#scope`).
 */
export default async function NewEventPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const can = await canCreateEvents(db(), user);
  if (can === "notAllowed") redirect("/e");
  const all = await getMessages();
  const messages = Object.fromEntries(CLIENT_NAMESPACES.map((k) => [k, all[k as keyof typeof all]]));
  if (can === "needFullLogin") {
    const t = await getTranslations();
    return (
      <main className="wz-body" data-testid="need-full-login">
        <section className="wz-step">
          <h1 className="t-h1">{t("wizard.needFullLogin.title")}</h1>
          <p className="intro">{t("wizard.needFullLogin.body")}</p>
          <a className="btn primary" href="/login">
            <Icon name="sms" />
            {t("auth.join.expired.smsLogin")}
          </a>
        </section>
      </main>
    );
  }
  return (
    <NextIntlClientProvider messages={messages}>
      <Wizard />
    </NextIntlClientProvider>
  );
}
