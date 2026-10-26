import type { Locale } from "@/i18n/config";
import { getPage, isPublished, type SitePage, type ToiType } from "./content/pages";

/** Site navigation (SITE_DESIGN §3, CONTENT_PLAN 2.1). Labels come from `site.nav.*` messages. */
export type NavKey = "invites" | "tilek" | "traditions" | "seating" | "prices";

export const MENU: Record<Locale, { key: NavKey; href: string; soon?: boolean }[]> = {
  kk: [
    { key: "invites", href: "/kk/shaqyru" },
    { key: "tilek", href: "/kk/tilekter" },
    { key: "traditions", href: "/kk/dastur" },
    { key: "seating", href: "/kk/otyrgyzu-jospary" },
    { key: "prices", href: "/kk/baga", soon: true },
  ],
  ru: [
    { key: "invites", href: "/ru/priglashenie" },
    { key: "seating", href: "/ru/rassadka-gostei" },
    { key: "traditions", href: "/ru/traditsii" },
    { key: "prices", href: "/ru/tseny", soon: true },
  ],
};

export const FAQ_URL: Record<Locale, string> = { kk: "/kk/suraqtar", ru: "/ru/voprosy" };

/** Toi types under «Шақыру» in the mobile menu (only published pages are shown). */
export const MENU_TOI: Record<Locale, string[]> = {
  kk: ["/kk/shaqyru/uilenu-toi", "/kk/shaqyru/qyz-uzatu", "/kk/shaqyru/sundet-toi", "/kk/shaqyru/mereitoi"],
  ru: ["/ru/priglashenie/kyz-uzatu", "/ru/priglashenie/sundet-toi", "/ru/priglashenie/yubilei"],
};

export type FooterLink = { key: string; href: string };
export const FOOTER: Record<Locale, { sections: FooterLink[]; useful: FooterLink[] }> = {
  kk: {
    sections: [
      { key: "invites", href: "/kk/shaqyru" },
      { key: "tilek", href: "/kk/tilekter" },
      { key: "traditions", href: "/kk/dastur" },
      { key: "seatingPlan", href: "/kk/otyrgyzu-jospary" },
    ],
    useful: [
      { key: "faq", href: "/kk/suraqtar" },
      { key: "guests", href: "/kk/qonaqtar-tizimi" },
      { key: "budget", href: "/kk/toi-shygyny" },
      { key: "about", href: "/kk/biz-turaly" },
      { key: "contacts", href: "/kk/bailanys" },
    ],
  },
  ru: {
    sections: [
      { key: "invites", href: "/ru/priglashenie" },
      { key: "seatingPlan", href: "/ru/rassadka-gostei" },
      { key: "traditions", href: "/ru/traditsii" },
      { key: "tilek", href: "/ru/pozdravleniya-na-kazakhskom" },
    ],
    useful: [
      { key: "faq", href: "/ru/voprosy" },
      { key: "guests", href: "/ru/spisok-gostei" },
      { key: "budget", href: "/ru/byudzhet-toya" },
      { key: "about", href: "/ru/o-nas" },
      { key: "contacts", href: "/ru/kontakty" },
    ],
  },
};

/** «Осы тойға қатысты» clusters (SEO-13, `toiType`), in display priority. */
export const CLUSTERS: Record<ToiType, string[]> = {
  uilenu_toi: [
    "/kk/dastur/uilenu-toi",
    "/kk/dastur/betashar",
    "/kk/shaqyru/uilenu-toi",
    "/kk/tilekter/uilenu-toi",
    "/kk/tilekter/kelinge",
    "/kk/tilekter/bata",
    "/kk/shaqyru/ulgi/ak-shanyraq",
    "/ru/traditsii/betashar",
    "/ru/priglashenie",
    "/ru/pozdravleniya-na-kazakhskom",
    "/ru/priglashenie/shablon/ak-shanyrak",
    "/ru/rassadka-gostei",
  ],
  kyz_uzatu: [
    "/kk/dastur/qyz-uzatu",
    "/kk/shaqyru/qyz-uzatu",
    "/kk/tilekter/qyz-uzatu",
    "/kk/tilekter/qudalarga",
    "/kk/dastur/syrga-salu",
    "/kk/dastur/qudalyq",
    "/kk/shaqyru/ulgi/qyzgaldaq",
    "/ru/traditsii/kyz-uzatu",
    "/ru/priglashenie/kyz-uzatu",
    "/ru/traditsii/syrga-salu",
    "/ru/traditsii/kudalyk",
    "/ru/pozdravleniya-na-kazakhskom",
    "/ru/priglashenie/shablon/kyzgaldak",
  ],
  sundet: [
    "/kk/dastur/sundet-toi",
    "/kk/shaqyru/sundet-toi",
    "/kk/tilekter/sundet-toi",
    "/kk/tilekter/bata",
    "/kk/tilekter/besik-toi",
    "/ru/traditsii/sundet-toi",
    "/ru/priglashenie/sundet-toi",
    "/ru/pozdravleniya-na-kazakhskom",
  ],
  merey: [
    "/kk/shaqyru/mereitoi",
    "/kk/tilekter/mereitoi",
    "/kk/tilekter/50-jas",
    "/kk/tilekter/70-jas",
    "/kk/tilekter/bata",
    "/ru/priglashenie/yubilei",
    "/ru/pozdravleniya-na-kazakhskom",
  ],
  besik: [
    "/kk/dastur/besik-toi",
    "/kk/tilekter/besik-toi",
    "/kk/dastur/shildekhana",
    "/kk/dastur/tusaukeser",
    "/kk/tilekter/bata",
    "/ru/traditsii/tusau-keser",
    "/ru/pozdravleniya-na-kazakhskom",
  ],
  seating: [
    "/kk/otyrgyzu-jospary",
    "/kk/qonaqtar-tizimi",
    "/kk/toi-shygyny",
    "/kk/shaqyru",
    "/kk/shaqyru/uilenu-toi",
    "/ru/priglashenie",
    "/ru/spisok-gostei",
    "/ru/traditsii/kyz-uzatu",
    "/ru/rassadka-gostei",
    "/ru/byudzhet-toya",
  ],
};

export type RelatedKind = "dastur" | "shaqyru" | "tilek" | "feature";
export function kindOf(url: string): RelatedKind {
  if (/\/(dastur|traditsii)(\/|$)/.test(url)) return "dastur";
  if (/\/(shaqyru|priglashenie)(\/|$)/.test(url)) return "shaqyru";
  if (/\/(tilekter|pozdravleniya)/.test(url)) return "tilek";
  return "feature";
}

/** Short card title: H1 before the colon. */
export function shortTitle(p: SitePage): string {
  return p.h1.split(":")[0]!.trim();
}

export function related(page: SitePage, toi?: string, max = 4): SitePage[] {
  const key = (toi && toi in CLUSTERS ? toi : page.toi) as ToiType | undefined;
  if (!key) return [];
  return CLUSTERS[key]
    .filter((u) => u.startsWith(`/${page.locale}`) && u !== page.url && isPublished(u))
    .map((u) => getPage(u)!)
    .slice(0, max);
}

/** Language switch target: published pair, else nearest published hub of the other language, else its home. */
export function langTarget(page: SitePage | undefined, to: Locale): string {
  if (page?.pair) return page.pair;
  if (page?.pairDeclared && isPublished(page.pairDeclared)) return page.pairDeclared;
  const kind = page ? kindOf(page.url) : "feature";
  const candidates: Record<Locale, Record<RelatedKind, string>> = {
    kk: { dastur: "/kk/dastur", shaqyru: "/kk/shaqyru", tilek: "/kk/tilekter", feature: "/kk" },
    ru: {
      dastur: "/ru/traditsii",
      shaqyru: "/ru/priglashenie",
      tilek: "/ru/pozdravleniya-na-kazakhskom",
      feature: "/ru",
    },
  };
  const hub = candidates[to][kind];
  return isPublished(hub) ? hub : `/${to}`;
}
