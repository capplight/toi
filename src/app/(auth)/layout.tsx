import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

/** Client strings for /join and /login: language switch and the login form (not all 757 keys). */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const all = await getMessages();
  const wa = all.wa as Record<string, string>;
  const messages = { auth: all.auth, errors: all.errors, common: all.common, wa: { requestLink: wa.requestLink } };
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
