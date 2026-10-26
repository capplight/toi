import localFont from "next/font/local";

/**
 * Site fonts (SITE_DESIGN §6.2): the same designer subsets as the app (src/ui/fonts — Kazakh + Russian + Latin,
 * self-hosted, no Google request), `display: swap`. Only Onest is preloaded (body text and article H1 — the LCP
 * element on most pages); Cormorant (hero / hub H1 ≥ 34 px) loads on use.
 */
export const siteOnest = localFont({
  src: [
    { path: "../ui/fonts/onest-400-kk.woff2", weight: "400", style: "normal" },
    { path: "../ui/fonts/onest-600-kk.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-onest",
  display: "swap",
  preload: true,
});

export const siteCormorant = localFont({
  src: [{ path: "../ui/fonts/cormorant-garamond-600-kk.woff2", weight: "600", style: "normal" }],
  variable: "--font-cormorant",
  display: "swap",
  preload: false,
});
