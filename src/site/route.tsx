import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { SITE_CONFIG } from "./config";
import { allPages, getPage } from "./content/pages";
import { pageMeta } from "./seo";
import { SitePageView } from "./ui/templates";

/** Shared pieces of `src/app/(site)/{kk,ru}/[[...slug]]/page.tsx` (static, `dynamicParams = false`). */

export function staticParams(locale: Locale): { slug: string[] }[] {
  return [...allPages().values()].filter((p) => p.locale === locale).map((p) => ({ slug: p.slug }));
}

function urlOf(locale: Locale, slug?: string[]): string {
  return slug?.length ? `/${locale}/${slug.map(decodeURIComponent).join("/")}` : `/${locale}`;
}

export function siteMetadata(locale: Locale, slug?: string[]): Metadata {
  const page = getPage(urlOf(locale, slug));
  return page ? pageMeta(page) : {};
}

export function SiteRoute({ locale, slug }: { locale: Locale; slug?: string[] }) {
  const page = getPage(urlOf(locale, slug));
  if (!page) notFound();
  return <SitePageView page={page} />;
}

export const siteTitleTemplate = `%s · ${SITE_CONFIG.placeholders.BRAND ?? ""}`;
