"use client";

import { useTranslations } from "next-intl";
import { daysAgo } from "@/domain/guests/status";

/** «3 күн бұрын жіберілді» / «Бүгін жіберілді» / «Кеше жіберілді» (event time zone). */
export function useSentAgo(tz: string) {
  const t = useTranslations("common.time");
  return (iso: string | null) => {
    if (!iso) return undefined;
    const d = daysAgo(new Date(iso), new Date(), tz);
    return d === 0 ? t("sentToday") : d === 1 ? t("sentYesterday") : t("sentDaysAgo", { days: d });
  };
}
