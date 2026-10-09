import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { consumeLoginLinkAction } from "@/server/actions/auth";
import { inspectLink } from "@/server/auth/loginLinks";
import { db } from "@/server/db";

// Temporary neutral styles; design v2 screens arrive in Ф1 (brief Ф2).
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const btn = "block w-full min-h-12 rounded border border-neutral-900 px-4 py-3 text-center text-lg";

/** Plan 6.1 flow 1: GET shows the greeting and «Кіру»; nothing is spent until the POST. */
export default async function JoinPage({ params, searchParams }: PageProps<"/join/[token]">) {
  const { token } = await params;
  const { limit } = await searchParams;
  const t = await getTranslations();
  const format = await getFormatter();

  if (limit) {
    return (
      <main className="mx-auto max-w-md space-y-4 p-4">
        <p role="alert">{t("auth.join.tooManyAttempts")}</p>
      </main>
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
      <main className="mx-auto max-w-md space-y-4 p-4" data-testid="join-expired">
        <h1 className="text-2xl font-semibold">{t("auth.join.expired.title")}</h1>
        <p>{t("auth.join.expired.body")}</p>
        {ask && (
          <a className={btn} href={ask}>
            {t("auth.join.expired.askOwner")}
          </a>
        )}
        <Link className={btn} href="/login">
          {t("auth.join.expired.smsLogin")}
        </Link>
      </main>
    );
  }

  const ev = view.event;
  return (
    <main className="mx-auto max-w-md space-y-4 p-4" data-testid="join-valid">
      <h1 className="text-2xl font-semibold">{t("auth.join.greeting")}</h1>
      {ev && <p className="text-xl">{ev.title}</p>}
      {ev && (
        <p>
          {t("auth.join.eventKindLine", {
            eventKind: t("events.kind.select", { kind: ev.kind }),
            date: format.dateTime(new Date(`${ev.startsOn}T12:00:00Z`), { day: "numeric", month: "long" }),
            time: ev.startsAt?.slice(0, 5) ?? "",
            venue: ev.venue ?? "",
          })}
        </p>
      )}
      {view.label && <p>{t("auth.join.addedAs", { label: view.label })}</p>}
      <p>{t("auth.join.body")}</p>
      <form action={consumeLoginLinkAction}>
        <input type="hidden" name="token" value={token} />
        <button type="submit" className={btn}>
          {t("auth.join.submit")}
        </button>
      </form>
    </main>
  );
}
