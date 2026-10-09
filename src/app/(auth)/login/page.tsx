import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { env } from "@/server/env";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Plan 6.1 flows 2–3 (temporary neutral styles; design v2 in Ф1). */
export default async function LoginPage() {
  const messages = await getMessages();
  // Only the namespaces the client form needs (not all 757 strings).
  const subset = {
    auth: messages.auth,
    errors: messages.errors,
    wa: { requestLink: (messages.wa as Record<string, string>).requestLink },
  };
  return (
    <main className="mx-auto max-w-md p-4">
      <NextIntlClientProvider messages={subset}>
        <LoginForm consoleMode={env().SMS_PROVIDER === "console"} />
      </NextIntlClientProvider>
    </main>
  );
}
