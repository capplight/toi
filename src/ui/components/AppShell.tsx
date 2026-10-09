"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useState, useTransition } from "react";
import { cn } from "../lib/cn";
import { Mark, Shanyraq } from "../ornaments/generated";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { PilotBanner } from "./PilotBanner";
import { Dialog } from "./Sheet";
import { Toaster } from "./Toast";

export type ShellEvent = { id: string; title: string; dateLine: string };
export type ShellUser = { name: string; roleLabel: string; permissionLabel: string; initial: string };
/** Server Actions passed from the app layer (src/ui has no server or DB code). */
export type ShellActions = {
  setLocale: (formData: FormData) => Promise<void>;
  logout: () => Promise<void>;
};

type Section = "guests" | "hall" | "summary" | "budget";
const ICONS: Record<Section, IconName> = { guests: "users", hall: "grid", summary: "chart", budget: "wallet" };

/**
 * Working-screen frame in three navigation modes (DESIGN_v2 4):
 * - < 768: top bar 60 with «⋯», 3 bottom tabs (Қонақтар · Зал · Қорытынды); «Шығындар» is a card on «Қорытынды»;
 * - 768–1279: rail 104 px (all 4 sections, «⋯ Той мәзірі» at the bottom);
 * - ≥ 1280: sidebar 272 px with the event card and the user card.
 * Language is changed only in «⋯ Той мәзірі» (decision Д3).
 */
export function AppShell({
  event,
  user,
  isOwner,
  canManageBudget,
  hallAttention = false,
  title,
  topRight,
  hasCta = false,
  actions,
  children,
}: {
  actions: ShellActions;
  event: ShellEvent;
  user: ShellUser;
  isOwner: boolean;
  canManageBudget: boolean;
  hallAttention?: boolean;
  /** Screen title in the phone top bar. */
  title: string;
  /** Extra control in the top bar (e.g. «Схема | Тізім» on «Зал»). */
  topRight?: ReactNode;
  hasCta?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const tm = useTranslations("meta");
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const base = `/e/${event.id}`;
  const sections: Section[] = canManageBudget ? ["guests", "hall", "summary", "budget"] : ["guests", "hall", "summary"];
  const href = (s: Section) => `${base}/${s}`;
  const current = (s: Section) => pathname === href(s) || pathname.startsWith(`${href(s)}/`);
  const label = (s: Section) => t(s);

  return (
    <div className="shell" data-testid="event-page">
      <nav className="sidebar" aria-label={t("a11y.sidebar")}>
        <div className="brand">
          <Link href="/e" className="wordmark" aria-label={t("myEvents")}>
            <Mark />
            <b aria-hidden="true">{tm("appName")}</b>
          </Link>
        </div>
        <div className="event-mini">
          <Shanyraq />
          <div className="nm">{event.title}</div>
          <div className="meta">{event.dateLine}</div>
        </div>
        {sections.map((s) => (
          <Link key={s} href={href(s)} className="nav-item" aria-current={current(s) ? "page" : undefined}>
            <Icon name={ICONS[s]} />
            <span>{label(s)}</span>
            {s === "hall" && hallAttention && (
              <>
                <i className="dot" aria-hidden="true" />
                <span className="sr-only">{t("a11y.attention")}</span>
              </>
            )}
          </Link>
        ))}
        <div className="side-foot">
          <button type="button" className="nav-item" onClick={() => setMenu(true)} aria-haspopup="dialog">
            <span aria-hidden="true" style={{ fontWeight: 700, letterSpacing: 2 }}>
              ···
            </span>
            <span>{t("eventMenu")}</span>
          </button>
          <div className="who">
            <span className="avatar" aria-hidden="true">
              {user.initial}
            </span>
            <div>
              <div className="nm">{user.name}</div>
              <div className="rl">
                {user.roleLabel} · {user.permissionLabel}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="main">
        <header className="topbar desk-hide">
          <h1 className="t-h1">{title}</h1>
          {topRight}
          <Button
            variant="icon"
            className="menu-btn-mobile"
            aria-label={t("eventMenu")}
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
          >
            <span aria-hidden="true" style={{ fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>
              ···
            </span>
          </Button>
        </header>
        <main className="content">
          <PilotBanner isOwner={isOwner} />
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label={t("a11y.sections")} style={{ ["--tabs" as string]: 3 }}>
        {(["guests", "hall", "summary"] as Section[]).map((s) => (
          <Link key={s} href={href(s)} className="tab" aria-current={current(s) ? "page" : undefined}>
            <span className="pill">
              <Icon name={ICONS[s]} />
            </span>
            <span>{label(s)}</span>
            {s === "hall" && hallAttention && (
              <>
                <i className="dot" aria-hidden="true" />
                <span className="sr-only">{t("a11y.attention")}</span>
              </>
            )}
          </Link>
        ))}
      </nav>

      <EventMenu
        open={menu}
        onOpenChange={setMenu}
        isOwner={isOwner}
        settingsHref={`${base}/settings`}
        actions={actions}
      />
      <Toaster hasCta={hasCta} />
    </div>
  );
}

/** «⋯ Той мәзірі» (v2.2): language, my events, settings (owner), log out. */
export function EventMenu({
  open,
  onOpenChange,
  isOwner,
  settingsHref,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  settingsHref: string;
  actions: ShellActions;
}) {
  const t = useTranslations("nav");
  const tl = useTranslations("common.lang");
  const router = useRouter();
  const [pending, start] = useTransition();
  const current = typeof document !== "undefined" ? document.documentElement.lang : "kk";
  const choose = (locale: "kk" | "ru") =>
    start(async () => {
      const fd = new FormData();
      fd.set("locale", locale);
      await actions.setLocale(fd);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={t("eventMenu")}>
      <div className="menu-list">
        <div role="group" aria-label={tl("label")}>
          <p className="field-label">{tl("label")}</p>
          <div className="menu-lang">
            {(["kk", "ru"] as const).map((l) => (
              <button
                key={l}
                type="button"
                lang={l}
                aria-pressed={current === l}
                disabled={pending}
                onClick={() => choose(l)}
              >
                {tl(l === "kk" ? "kkFull" : "ruFull")}
              </button>
            ))}
          </div>
        </div>
        <Link className="row" href="/e" onClick={() => onOpenChange(false)}>
          <Icon name="list" />
          {t("myEvents")}
        </Link>
        {isOwner && (
          <Link className="row" href={settingsHref} onClick={() => onOpenChange(false)}>
            <Icon name="gear" />
            {t("settings")}
          </Link>
        )}
        <form action={actions.logout}>
          <button type="submit" className={cn("row")}>
            <Icon name="login" style={{ transform: "scaleX(-1)" }} />
            {t("logout")}
          </button>
        </form>
      </div>
    </Dialog>
  );
}
