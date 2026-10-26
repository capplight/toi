import type { Metadata } from "next";
import { translator } from "@/i18n/messages";
import { siteCormorant, siteOnest } from "@/site/fonts";
import { NotFoundView } from "@/site/ui/templates";
import "@/site/site.css";

/**
 * SEO-16: the 404 for every unmatched URL (the app has several root layouts — `(app)`, `(site)/kk`, `(site)/ru` — so
 * Next needs one global page). Static: built once, Kazakh first with the Russian text below. Status 404, noindex.
 */
export const metadata: Metadata = {
  title: `${translator("kk")("site.notFound.title")} · ${translator("ru")("site.notFound.title")}`,
};

export default function GlobalNotFound() {
  return (
    <html lang="kk" className={`${siteOnest.variable} ${siteCormorant.variable}`}>
      <body>
        <NotFoundView />
      </body>
    </html>
  );
}
