import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { setLocale } from "@/server/actions/locale";
import { devUiAllowed } from "./guard";
import { Showcase } from "./Showcase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "UI · Той", robots: { index: false, follow: false } };

/** Ф1: every component in every state, kk and ru. Not available in production (brief Ф1 3.5). */
export default async function DevUiPage() {
  if (!devUiAllowed()) notFound();
  const locale = (await getLocale()) as "kk" | "ru";
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      <Showcase locale={locale} setLocaleAction={setLocale} />
    </NextIntlClientProvider>
  );
}
