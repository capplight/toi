"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { AppShell } from "@/ui/components/AppShell";

/** Picks the phone top-bar title from the current section (texts from content/messages). */
export function EventShell(props: Omit<ComponentProps<typeof AppShell>, "title">) {
  const t = useTranslations("nav");
  const tm = useTranslations("meta.pages");
  const path = usePathname();
  const section = path.split("/")[3] ?? "guests";
  const title =
    section === "hall"
      ? t("hall")
      : section === "summary"
        ? t("summary")
        : section === "budget"
          ? t("budget")
          : section === "settings"
            ? t("settings")
            : tm("guests");
  const known = ["guests", "hall", "summary", "budget", "settings"] as const;
  const current = (known as readonly string[]).includes(section) ? (section as (typeof known)[number]) : undefined;
  return <AppShell {...props} title={title} section={current} />;
}
