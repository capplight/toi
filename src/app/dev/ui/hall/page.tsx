import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";
import { setLocale } from "@/server/actions/locale";
import { devUiAllowed } from "../guard";
import { HallDemo } from "./HallDemo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "UI · Зал · Той", robots: { index: false, follow: false } };

/** Design review criterion B1 on demo data (DESIGN_v2 8.7): all problems + a toast; ТӨР and row 1 visible. */
export default async function DevHallPage() {
  if (!devUiAllowed()) notFound();
  return (
    <NextIntlClientProvider messages={await getMessages()}>
      <HallDemo actions={{ setLocale, logout: logoutAction }} />
    </NextIntlClientProvider>
  );
}
