import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("appName") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // <html lang> follows the current language (CONTENT_REVIEW 6.13).
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body>{children}</body>
    </html>
  );
}
