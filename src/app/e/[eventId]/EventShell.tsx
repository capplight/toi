"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { AppShell } from "@/ui/components/AppShell";

type ShellProps = Omit<ComponentProps<typeof AppShell>, "title" | "subtitle" | "back" | "hideTabs" | "hasCta">;

/**
 * Picks the top-bar title, subtitle and «←» from the current route (texts from content/messages):
 * - guests: «Менің тізімім» + own list name, or another member's list name (`?list=`), sticky «Қонақ қосу»;
 * - guests/add: «Жаңа қонақ» / «Қонақты өзгерту» (`?edit=`), no tabs (S2);
 * - guests/no-answer: «Жауап бермегендер» with «←» (S5).
 */
export function EventShell({
  lists,
  myMemberId,
  ...props
}: ShellProps & { lists: Record<string, string>; myMemberId: string }) {
  const t = useTranslations("nav");
  const tm = useTranslations("meta.pages");
  const tf = useTranslations("guestForm.title");
  const tn = useTranslations("noAnswer");
  const ta = useTranslations("common.actions");
  const path = usePathname();
  const query = useSearchParams();
  const parts = path.split("/");
  const section = parts[3] ?? "guests";
  const sub = parts[4];
  const known = ["guests", "hall", "summary", "budget", "settings"] as const;
  const current = (known as readonly string[]).includes(section) ? (section as (typeof known)[number]) : undefined;
  const base = `/e/${props.event.id}`;

  if (section === "guests" && (sub === "add" || sub === "no-answer")) {
    const list = query.get("list");
    const back = { href: `${base}/guests${list ? `?list=${encodeURIComponent(list)}` : ""}`, label: ta("back") };
    return (
      <AppShell
        {...props}
        title={sub === "add" ? (query.get("edit") ? tf("edit") : tf("new")) : tn("title")}
        back={back}
        hideTabs={sub === "add"}
        hasCta={sub === "add"}
        section={current}
      />
    );
  }

  if (section === "guests" || !current) {
    const list = query.get("list");
    const other = list && list !== myMemberId ? lists[list] : undefined;
    return (
      <AppShell
        {...props}
        title={other ?? tm("guests")}
        subtitle={other ? undefined : lists[myMemberId]}
        hasCta
        section="guests"
      />
    );
  }

  const title =
    section === "hall"
      ? t("hall")
      : section === "summary"
        ? t("summary")
        : section === "budget"
          ? t("budget")
          : t("settings");
  return <AppShell {...props} title={title} section={current} />;
}
