import { createTranslator } from "next-intl";
import kk from "../../content/messages/kk.json" with { type: "json" };
import ru from "../../content/messages/ru.json" with { type: "json" };
import type { Locale } from "./config";

/** Messages from content/messages (decision Д5) for server code outside a request (SMS, wa.me texts, seeds). */
export const messagesByLocale = { kk, ru } as const;

export function translator(locale: Locale) {
  return createTranslator({ locale, messages: messagesByLocale[locale] });
}
