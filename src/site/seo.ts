import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";
import { translator } from "@/i18n/messages";
import { SITE_CONFIG } from "./config";
import { plain } from "./content/inline";
import { absolute, allPages, eachInline, getPage, type SitePage } from "./content/pages";
import type { Node } from "./content/parse";
import { fillBrand, phText } from "./ui/ctx";

/** Metadata, hreflang and JSON-LD of site pages (SEO_PLAN 5.4–5.6, SEO-04, SEO-06). */

const OG_LOCALE: Record<Locale, string> = { kk: "kk_KZ", ru: "ru_KZ" };

export function alternates(page: SitePage): Record<string, string> | undefined {
  if (!page.pair) return undefined;
  const kk = page.locale === "kk" ? page.url : page.pair;
  const ru = page.locale === "ru" ? page.url : page.pair;
  return { "kk-KZ": absolute(kk), "ru-KZ": absolute(ru), "x-default": absolute(kk) };
}

export function pageMeta(page: SitePage): Metadata {
  const t = translator(page.locale);
  const brand = SITE_CONFIG.placeholders.BRAND ?? "";
  const soon = page.template === "soon";
  const title = soon ? t("site.soonPage.title") : fillBrand(page.title);
  const description = soon ? t("site.soonPage.description", { brand }) : fillBrand(page.description);
  return {
    title,
    description,
    alternates: { canonical: absolute(page.url), languages: alternates(page) },
    robots: page.published ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title: `${title} · ${brand}`,
      description,
      url: absolute(page.url),
      siteName: brand,
      locale: OG_LOCALE[page.locale],
      type: ["tilek", "dastur", "feature"].includes(page.template) ? "article" : "website",
    },
  };
}

export function nodesText(nodes: Node[]): string {
  const parts: string[] = [];
  eachInline(nodes, (c) => parts.push(plain(c, phText)));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export type Crumb = { label: string; href?: string };

export function jsonLd(page: SitePage, crumbs: Crumb[] | null, selfLabel: string): object[] {
  const brand = SITE_CONFIG.placeholders.BRAND ?? "";
  const out: object[] = [];
  const org = { "@type": "Organization", name: brand, url: absolute(`/${page.locale}`) };
  if (page.template === "landing") {
    out.push({ "@context": "https://schema.org", ...org });
    out.push({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: brand,
      url: absolute(`/${page.locale}`),
      inLanguage: page.locale,
    });
  }
  if (crumbs) {
    const items = [...crumbs.filter((c) => c.href), { label: selfLabel, href: page.url }];
    out.push({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: items.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.label,
        item: absolute(c.href!),
      })),
    });
  }
  const faqs = page.doc.body.flatMap((n) => (n.t === "faq" ? n.groups.flatMap((g) => g.items) : []));
  if (faqs.length) {
    out.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: plain(f.q, phText),
        acceptedAnswer: { "@type": "Answer", text: nodesText(f.a) },
      })),
    });
  }
  if (["tilek", "dastur", "feature"].includes(page.template)) {
    const updated = page.doc.fm.updated;
    const reviewer = page.doc.fm.reviewedBy;
    out.push({
      "@context": "https://schema.org",
      "@type": "Article",
      headline: fillBrand(page.h1),
      description: fillBrand(page.description),
      inLanguage: page.locale,
      mainEntityOfPage: absolute(page.url),
      author: org,
      publisher: org,
      ...(updated ? { datePublished: updated, dateModified: updated } : {}),
      ...(reviewer && !/\{/.test(reviewer) ? { reviewedBy: { "@type": "Person", name: reviewer } } : {}),
    });
  }
  return out;
}

/** Published pages for sitemap.xml. */
export function sitemapPages(): SitePage[] {
  return [...allPages().values()].filter((p) => p.published);
}

export function imagesOf(page: SitePage): string[] {
  const out = new Set<string>();
  const visit = (nodes: Node[]) => {
    for (const n of nodes) {
      if (n.t === "demo" || n.t === "templates") {
        const ids = n.t === "demo" ? [n.tpl] : ["ak-shanyrak", "kok-tun", "kyzgaldak"];
        for (const id of ids) out.add(absolute(`/site/toiga-shaqyru-${id}.svg`));
      }
      if (n.t === "hall")
        out.add(absolute(page.locale === "kk" ? "/site/otyrgyzu-sxemasy.svg" : "/site/rassadka-gostei-shema.svg"));
    }
  };
  visit(page.doc.body);
  return [...out];
}

export { getPage };
