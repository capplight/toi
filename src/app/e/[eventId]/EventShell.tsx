"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";
import { AppShell } from "@/ui/components/AppShell";
import { Segment } from "@/ui/components/Controls";
import { setHallParams } from "./hall/hall-client";

type ShellProps = Omit<ComponentProps<typeof AppShell>, "title" | "subtitle" | "back" | "hideTabs" | "hasCta">;

/**
 * Picks the top-bar title, subtitle and «←» from the current route (texts from content/messages):
 * - guests: «Менің тізімім» + own list name, or another member's list name (`?list=`), sticky «Қонақ қосу»;
 * - guests/add: «Жаңа қонақ» / «Қонақты өзгерту» (`?edit=`), no tabs (S2);
 * - guests/no-answer: «Жауап бермегендер» with «←» (S5);
 * - hall: «Зал» + «Схема | Тізім» in the phone bar (DESIGN 8.7); `?move=` «Қай үстелге?» with ✕, no tabs (H4);
 *   hall/setup «Залды баптау» (form, no tabs), hall/order «Отырғызу реті», hall/history «Өзгерістер тарихы» with «←».
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
  const tmem = useTranslations("members");
  const ta = useTranslations("common.actions");
  const thall = useTranslations("hall");
  const tp = useTranslations("print");
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

  if (section === "hall") {
    const toHall = { href: `${base}/hall`, label: ta("back"), mobileOnly: true };
    if (sub === "setup" || sub === "order" || sub === "history") {
      const titles = { setup: thall("setup.title"), order: thall("order.title"), history: thall("history.title") };
      return (
        <AppShell
          {...props}
          title={titles[sub]}
          back={toHall}
          hideTabs={sub === "setup"}
          hasCta={sub === "setup"}
          section="hall"
        />
      );
    }
    if (query.get("move")) {
      return (
        <AppShell
          {...props}
          title={thall("move.title")}
          back={{ ...toHall, label: ta("close") }}
          hideTabs
          section="hall"
        />
      );
    }
    const view = query.get("view") === "list" ? "list" : "map";
    return (
      <AppShell
        {...props}
        title={t("hall")}
        section="hall"
        topRight={
          <Segment
            compact
            value={view}
            onChange={(v) => setHallParams({ view: v })}
            label={thall("map.view.label")}
            options={[
              { value: "map", label: thall("map.view.map"), icon: "grid" },
              { value: "list", label: thall("map.view.list"), icon: "list" },
            ]}
          />
        }
      />
    );
  }

  if (section === "print") {
    // Ф10: «Отырғызу жоспары» for print, «←» back to «Зал» on the phone
    return (
      <AppShell
        {...props}
        title={tp("title")}
        back={{ href: `${base}/hall`, label: ta("back"), mobileOnly: true }}
        section="hall"
      />
    );
  }

  if (section === "budget") {
    // Ф9 (mockup 13): on the phone «Шығындар» opens from «Қорытынды» — «←» goes back there; sticky «Шығын қосу»
    return (
      <AppShell
        {...props}
        title={t("budget")}
        back={{ href: `${base}/summary`, label: ta("back"), mobileOnly: true }}
        hasCta
        section="budget"
      />
    );
  }

  if (section === "settings" && sub === "members") {
    return (
      <AppShell
        {...props}
        title={tmem("title")}
        subtitle={t("settings")}
        back={{ href: `${base}/settings`, label: ta("back"), mobileOnly: true }}
        section="settings"
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
