import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";

/**
 * `/` → the public site home in the visitor's language (SEO_PLAN 5.1, SEO-02): cookie `locale`, then
 * `Accept-Language` (kk / ru), otherwise kk. 307, so x-default stays `/kk`. The app itself is entered from the site
 * CTA (`/e/new` → `/login` without a session), `/login`, `/e` — unchanged.
 */
export const dynamic = "force-dynamic";

export default async function RootRedirect() {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) redirect(`/${fromCookie}`);
  const accept = ((await headers()).get("accept-language") ?? "").toLowerCase();
  const kk = accept.indexOf("kk");
  const ru = accept.indexOf("ru");
  redirect(ru >= 0 && (kk < 0 || ru < kk) ? "/ru" : "/kk");
}
