import type { Locale } from "@/i18n/config";
import { translator } from "@/i18n/messages";
import { SITE_CONFIG } from "../config";
import type { SitePage } from "../content/pages";

/** Render context of one site page (no request APIs: pages are static). */
export type Ctx = {
  locale: Locale;
  t: ReturnType<typeof translator>;
  page?: SitePage;
  brand: string;
  /** `/e/new` with the page's toi kind (SEO-14a parameters; the wizard ignores unknown ones). */
  ctaHref: string;
};

const KIND: Record<string, string> = {
  sundet: "sundet",
  kyz_uzatu: "kyz_uzatu",
  uilenu_toi: "uilenu_toi",
  merey: "merey",
  besik: "besik",
};

export function makeCtx(locale: Locale, page?: SitePage): Ctx {
  const kind = page?.toi ? KIND[page.toi] : undefined;
  return {
    locale,
    t: translator(locale),
    page,
    brand: SITE_CONFIG.placeholders.BRAND ?? "{BRAND}",
    ctaHref: kind ? `/e/new?kind=${kind}` : "/e/new",
  };
}

/** Placeholder text for plain-text contexts (meta, JSON-LD, copy). */
export function phText(name: string): string {
  return SITE_CONFIG.placeholders[name] ?? `{${name}}`;
}

export function fillBrand(s: string): string {
  return s.replace(/\{([A-Z_]+)\}/g, (m, n: string) => SITE_CONFIG.placeholders[n] ?? m);
}
