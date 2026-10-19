import type { Metadata, Viewport } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { cormorant, onest } from "@/ui/fonts";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("appName") };
}

// System zoom stays allowed (design_spec 7: no user-scalable=no).
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f7f2e9" };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // <html lang> follows the current language (CONTENT_REVIEW 6.13).
  const locale = await getLocale();
  return (
    <html lang={locale} className={`${onest.variable} ${cormorant.variable}`}>
      <body>{children}</body>
    </html>
  );
}
