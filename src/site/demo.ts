import type { Locale } from "@/i18n/config";
import { translator } from "@/i18n/messages";
import type { GuestPage } from "@/server/invite/guest";
import { renderInvite } from "@/server/invite/render";
import { siteOrigin } from "@/server/env";
import { normalizeTpl } from "./content/parse";
import { SITE_CONFIG } from "./config";

/**
 * T4 demo (SEO-08): the real guest-page renderer of `/i/{token}` in preview mode (no form actions, no pings, no
 * music) with fictional data — no database. Served as a static route handler `…/ulgi/{slug}/demo` (noindex) and
 * shown in an iframe on the template page.
 */
export const DEMO_SLUGS: Record<Locale, string[]> = {
  kk: ["ak-shanyraq", "kok-tun", "qyzgaldak"],
  ru: ["ak-shanyrak", "kok-tun", "kyzgaldak"],
};

const KIND: Record<string, string> = { "ak-shanyrak": "uilenu_toi", "kok-tun": "uilenu_toi", kyzgaldak: "kyz_uzatu" };

export function demoHtml(locale: Locale, slug: string): string | null {
  if (!DEMO_SLUGS[locale].includes(slug)) return null;
  const id = normalizeTpl(slug);
  const t = translator(locale);
  const startsOn = "2027-05-15";
  const page: GuestPage = {
    token: "demo",
    family: {
      id: "demo",
      name: t("site.art.family1"),
      rsvp: "pending",
      expected: 4,
      confirmed: null,
      answeredByGuest: false,
      openedBefore: true,
    },
    event: {
      id: "demo",
      kind: KIND[id] ?? "uilenu_toi",
      title: t("site.demo.names"),
      hostsLine: null,
      startsOn,
      startsAt: "18:00",
      tz: "Asia/Almaty",
      venueName: t("site.demo.venue"),
      venueAddress: t("site.demo.address"),
      mapUrl: null,
      textKk: null,
      textRu: null,
      templateId: id,
      defaultLocale: locale,
      closesAt: new Date("2027-05-08T00:00:00+05:00"),
    },
    musicKey: null,
    table: null,
  };
  return renderInvite(page, {
    locale,
    nonce: "",
    now: new Date("2026-11-01T12:00:00+05:00"),
    open: true,
    view: "form",
    appUrl: siteOrigin() ?? SITE_CONFIG.fallbackOrigin,
    preview: true,
  });
}

export function demoResponse(locale: Locale, slug: string): Response {
  const html = demoHtml(locale, slug);
  if (!html) return new Response("Not found", { status: 404 });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, follow",
      "cache-control": "public, max-age=3600",
    },
  });
}
