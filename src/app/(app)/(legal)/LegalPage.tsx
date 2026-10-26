import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";
import { LEGAL } from "./legal.generated";

/**
 * `/privacy` and `/terms` for the pilot (RA Л5): the content lead's drafts (`content/legal/*.md`, CONTENT_REVIEW §8)
 * rendered to HTML at build time (`scripts/build-legal.ts`), shown as they are — with the draft plate and the
 * `[ЮРИСТ: …]` notes — until the lawyer's text. Language from the same `locale` cookie as the UI. Public; no JS.
 */
export async function legalMetadata(page: "privacy" | "terms"): Promise<Metadata> {
  const t = await getTranslations(`legal.${page}`);
  return { title: t("title"), robots: { index: false, follow: false } };
}

export async function LegalPage({ page }: { page: "privacy" | "terms" }) {
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "kk";
  const t = await getTranslations("legal");
  const doc = LEGAL[page][locale];
  const other = page === "privacy" ? "terms" : "privacy";
  return (
    <main className="legal-page">
      <article className="legal-doc" lang={locale} dangerouslySetInnerHTML={{ __html: doc.html }} />
      <nav className="legal-nav" aria-label={t(`${page}.title`)}>
        <a href={`/${other}`}>{t(`${other}.title`)}</a>
      </nav>
    </main>
  );
}
