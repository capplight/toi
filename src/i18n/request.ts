import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

// UI texts come only from content/messages/*.json (decisions Д5, А1) — no copies in src/.
// Explicit imports (not a template path) so the bundler does not pick up _keys.json/_context.json.
const loaders: Record<Locale, () => Promise<{ default: Record<string, unknown> }>> = {
  kk: () => import("../../content/messages/kk.json"),
  ru: () => import("../../content/messages/ru.json"),
};

export default getRequestConfig(async () => {
  const store = await cookies();
  const fromCookie = store.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(fromCookie) ? fromCookie : defaultLocale;

  return {
    locale,
    timeZone: "Asia/Almaty",
    messages: (await loaders[locale]()).default,
  };
});
