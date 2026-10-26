import { asLocale, formatDayMonth } from "@/domain/format";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { consumeLoginLinkAction } from "@/server/actions/auth";
import { inspectLink } from "@/server/auth/loginLinks";
import { currentUser } from "@/server/authz";
import { db } from "@/server/db";
import { Icon } from "@/ui/components/Icon";
import { AuthFrame } from "../../AuthFrame";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Plan 6.1 flow 1 (mockup 09): GET shows the greeting and «Кіру»; nothing is spent until the POST. */
export default async function JoinPage({ params, searchParams }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const { limit } = await searchParams;
  const t = await getTranslations();
  const locale = asLocale(await getLocale());

  if (limit) {
    return (
      <AuthFrame>
        <h1>{t("auth.join.expired.title")}</h1>
        <p role="alert">{t("auth.join.tooManyAttempts")}</p>
      </AuthFrame>
    );
  }

  const view = await inspectLink(db(), token, new Date());

  if (view.status === "expired") {
    const ask = view.ownerPhone
      ? `https://wa.me/${view.ownerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(
          t("wa.requestLink", { label: view.label ?? "" }),
        )}`
      : null;
    return (
      <AuthFrame>
        <div data-testid="join-expired">
          <h1>{t("auth.join.expired.title")}</h1>
          <p>{t("auth.join.expired.body")}</p>
          <div className="btns">
            {ask && (
              <a className="btn wa" href={ask}>
                <Icon name="wa" />
                {t("auth.join.expired.askOwner")}
              </a>
            )}
            <Link className="btn secondary" href="/login">
              <Icon name="sms" />
              {t("auth.join.expired.smsLogin")}
            </Link>
          </div>
        </div>
      </AuthFrame>
    );
  }

  const ev = view.event;
  // Ф3 #switch: another person is signed in on this device — ask before replacing them (safe choice first).
  const signedIn = await currentUser();
  const switching = Boolean(signedIn && signedIn.phone !== view.phone);
  const eventLine = ev
    ? t("auth.join.eventKindLine", {
        eventKind: t("events.kind.select", { kind: ev.kind }),
        date: formatDayMonth(ev.startsOn, locale),
        time: ev.startsAt?.slice(0, 5) ?? "",
        venue: ev.venue ?? "",
      })
    : undefined;
  return (
    <AuthFrame eventTitle={ev?.title} eventLine={eventLine}>
      {switching ? (
        <div data-testid="join-switch">
          <h1>{t("auth.join.switchUser.title")}</h1>
          <p>{t("auth.join.switchUser.body")}</p>
          <p className="t-muted">{t("auth.join.switchUser.note")}</p>
          <div className="btns">
            <Link className="btn primary" href="/e" autoFocus>
              {t("auth.join.switchUser.cancel")}
            </Link>
            <form action={consumeLoginLinkAction}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="switch" value="1" />
              <button type="submit" className="btn secondary">
                <Icon name="login" />
                {t("auth.join.switchUser.confirm")}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div data-testid="join-valid">
          <h1>{t("auth.join.greeting")}</h1>
          {view.label && <p>{t("auth.join.addedAs", { label: view.label })}</p>}
          <p>{t("auth.join.body")}</p>
          <form action={consumeLoginLinkAction} className="btns">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="btn primary">
              <Icon name="login" />
              {t("auth.join.submit")}
            </button>
          </form>
        </div>
      )}
    </AuthFrame>
  );
}
