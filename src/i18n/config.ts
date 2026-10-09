export const locales = ["kk", "ru"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "kk";
/** Language lives in a cookie, no URL prefix (plan section 2, next-intl without i18n routing). */
export const LOCALE_COOKIE = "locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
