import { getLocale, getTranslations } from "next-intl/server";
import { setLocale } from "@/server/actions/locale";
import { locales } from "@/i18n/config";

/**
 * Ф0 temporary page: proves that texts come from content/messages (kk default, ru by cookie).
 * Neutral styles on purpose — NOT design v2. Replaced in Ф1/Ф3.
 * Sample values below are test arguments, not UI copy.
 */
export default async function HomePage() {
  const t = await getTranslations();
  const locale = await getLocale();

  const samples: { key: string; text: string }[] = [
    { key: "common.actions.save", text: t("common.actions.save") },
    { key: "common.units.seats {count: 5}", text: t("common.units.seats", { count: 5 }) },
    {
      key: "events.kind.select {kind: kyz_uzatu}",
      text: t("events.kind.select", { kind: "kyz_uzatu" }),
    },
    {
      key: "guests.list.counters.yes {count: 3}",
      text: t("guests.list.counters.yes", { count: 3 }),
    },
  ];

  return (
    <main className="mx-auto max-w-xl p-4">
      <h1 className="mb-4 text-2xl font-semibold">{t("meta.appName")}</h1>

      <ul className="space-y-3" data-testid="samples">
        {samples.map((s) => (
          <li key={s.key} className="rounded border border-neutral-300 p-3">
            <code className="block text-xs text-neutral-500">{s.key}</code>
            <span className="whitespace-pre-line">{s.text}</span>
          </li>
        ))}
      </ul>

      <form action={setLocale} className="mt-6 flex items-center gap-2" aria-label={t("common.lang.label")}>
        <span>{t("common.lang.label")}:</span>
        {locales.map((l) => (
          <button
            key={l}
            type="submit"
            name="locale"
            value={l}
            aria-pressed={l === locale}
            className="min-h-12 min-w-12 rounded border border-neutral-400 px-3 aria-pressed:bg-neutral-900 aria-pressed:text-white"
          >
            {t(`common.lang.${l}`)}
          </button>
        ))}
      </form>

      <p className="mt-6">
        <a className="underline" href="/api/health">
          /api/health
        </a>
      </p>
    </main>
  );
}
