import type { Metadata, Viewport } from "next";
import { siteTitleTemplate } from "@/site/route";
import { siteCormorant, siteOnest } from "@/site/fonts";
import "@/site/site.css";

// Root layout of the public site in ru (its own root layout: static, <html lang> from the URL, not the cookie).
export const metadata: Metadata = { title: { template: siteTitleTemplate, default: "ru" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f2e9" };

export default function SiteLayout({ children }: LayoutProps<"/ru">) {
  return (
    <html lang="ru" className={`${siteOnest.variable} ${siteCormorant.variable}`}>
      <body>{children}</body>
    </html>
  );
}
