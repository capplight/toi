"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useLayoutEffect, useRef, useState, useTransition } from "react";
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
  hallDot,
  tableQueue = false,
  title,
  subtitle,
  back,
  hideTabs = false,
  topRight,
  hasCta = false,
  section,
  actions,
  children,
}: {
  actions: ShellActions;
  /** Current section; the pilot banner is never shown on «Зал» (Ф1 review П3, criterion B1). */
  section?: Section | "settings";
  event: ShellEvent;
  user: ShellUser;
  isOwner: boolean;
  canManageBudget: boolean;
  hallAttention?: boolean;
  /** Streamed attention dot for «Зал» (server component in Suspense); replaces `hallAttention` when given. */
  hallDot?: ReactNode;
  /** Ф8 «Үстел нөмірлерін жіберу» (owner or the seating right): sidebar item and «⋯ Той мәзірі» row. */
  tableQueue?: boolean;
  /** Screen title in the phone top bar. */
  title: string;
  /** Second line under the phone title («Әкесінің тізімі», mockup 01). */
  subtitle?: string;
  /** «←» in the top bar (S2, S5): the bar is then shown on every width (mockup 02). */
  back?: { href: string; label: string; mobileOnly?: boolean };
  /** Form screens (S2): no bottom tabs, the main button sits at the very bottom. */
  hideTabs?: boolean;
  /** Extra control in the top bar (e.g. «Схема | Тізім» on «Зал»). */
  topRight?: ReactNode;
  hasCta?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("nav");
  const tm = useTranslations("meta");
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { ref: headerRef, titleRef, rightRef, mode: headerMode } = useStackedHeader();
  const base = `/e/${event.id}`;
  const sections: Section[] = canManageBudget ? ["guests", "hall", "summary", "budget"] : ["guests", "hall", "summary"];
  const href = (s: Section) => `${base}/${s}`;
  const current = (s: Section) => pathname === href(s) || pathname.startsWith(`${href(s)}/`);
  const label = (s: Section) => t(s);

  return (
    <div className={cn("shell", hideTabs && "no-tabs", hasCta && "has-cta")} data-testid="event-page">
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
            {s === "hall" &&
              (hallDot ??
                (hallAttention && (
                  <>
                    <i className="dot" aria-hidden="true" />
                    <span className="sr-only">{t("a11y.attention")}</span>
                  </>
                )))}
          </Link>
        ))}
        {tableQueue && (
          <Link
            href={`${base}/table-queue`}
            className="nav-item"
            aria-current={pathname.startsWith(`${base}/table-queue`) ? "page" : undefined}
          >
            <Icon name="send" />
            <span>{t("tableQueue")}</span>
          </Link>
        )}
        {isOwner && (
          <Link
            href={`${base}/settings`}
            className="nav-item"
            aria-current={pathname.startsWith(`${base}/settings`) ? "page" : undefined}
          >
            <Icon name="gear" />
            <span>{t("settings")}</span>
          </Link>
        )}
        <div className="side-foot">
          <button type="button" className="nav-item" onClick={() => setMenu(true)} aria-haspopup="dialog">
            <span aria-hidden="true" className="menu-dots">
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
        {/* Ф1 review П2: when title + control + «⋯» do not fit at their natural widths (320 px, large system
            text), the control first becomes icon-only (labels stay for screen readers), then moves to a second
            header line — the title never collapses. */}
        <header
          ref={headerRef}
          className={cn(
            "topbar",
            (!back || back.mobileOnly) && "desk-hide",
            back && "with-back",
            headerMode !== "full" && headerMode,
          )}
        >
          {back && (
            <Link href={back.href} className="btn icon" aria-label={back.label}>
              <Icon name="back" />
            </Link>
          )}
          <h1 className={cn("t-h1", subtitle && "with-sub")} ref={titleRef}>
            {title}
            {subtitle && <small>{subtitle}</small>}
          </h1>
          {topRight && (
            <div className="top-right" ref={rightRef}>
              {topRight}
            </div>
          )}
          <Button
            variant="icon"
            className="menu-btn-mobile"
            aria-label={t("eventMenu")}
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
          >
            <span aria-hidden="true" className="menu-dots lg">
              ···
            </span>
          </Button>
        </header>
        <main className="content">
          {section !== "hall" && <PilotBanner isOwner={isOwner} />}
          {children}
        </main>
      </div>

      <nav className="tabbar" aria-label={t("a11y.sections")} hidden={hideTabs}>
        {(["guests", "hall", "summary"] as Section[]).map((s) => (
          <Link key={s} href={href(s)} className="tab" aria-current={current(s) ? "page" : undefined}>
            <span className="pill">
              <Icon name={ICONS[s]} />
            </span>
            <span>{label(s)}</span>
            {s === "hall" &&
              (hallDot ??
                (hallAttention && (
                  <>
                    <i className="dot" aria-hidden="true" />
                    <span className="sr-only">{t("a11y.attention")}</span>
                  </>
                )))}
          </Link>
        ))}
      </nav>

      <EventMenu
        open={menu}
        onOpenChange={setMenu}
        isOwner={isOwner}
        settingsHref={`${base}/settings`}
        tableQueueHref={tableQueue ? `${base}/table-queue` : undefined}
        actions={actions}
      />
      <Toaster hasCta={hasCta} />
    </div>
  );
}

/** «⋯ Той мәзірі» (v2.2): language, my events, settings (owner), log out. */
/**
 * Phone header layout: "full" (title · control · ⋯), "icons" (icon-only control) or "stacked" (control on a
 * second line). Decided by measuring natural widths; re-checked on resize, text-size and font changes.
 */
function useStackedHeader() {
  const ref = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"full" | "icons" | "stacked">("full");
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const fits = (cls: "full" | "icons") => {
      const right = rightRef.current!;
      const title = titleRef.current!;
      const had = { icons: bar.classList.contains("icons"), stacked: bar.classList.contains("stacked") };
      bar.classList.remove("stacked");
      bar.classList.toggle("icons", cls === "icons");
      const cs = getComputedStyle(bar);
      const inner = bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const menuBtn = bar.querySelector<HTMLElement>(".menu-btn-mobile");
      const gap = parseFloat(cs.columnGap) || 8;
      const need = title.scrollWidth + right.scrollWidth + (menuBtn?.offsetWidth ?? 48) + gap * 2;
      bar.classList.toggle("icons", had.icons);
      bar.classList.toggle("stacked", had.stacked);
      return need <= inner;
    };
    const check = () => {
      if (!rightRef.current || !titleRef.current) return setMode("full");
      setMode(fits("full") ? "full" : fits("icons") ? "icons" : "stacked");
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(bar);
    // the title/control boxes change height when the text size changes (rem) — re-check then too
    if (titleRef.current) ro.observe(titleRef.current);
    if (rightRef.current) ro.observe(rightRef.current);
    void document.fonts?.ready.then(check);
    const mo = new MutationObserver(check); // html font-size changes (system text size emulation, zoom)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", check);
    return () => {
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", check);
    };
  }, []);
  return { ref, titleRef, rightRef, mode };
}

export function EventMenu({
  open,
  onOpenChange,
  isOwner,
  settingsHref,
  tableQueueHref,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOwner: boolean;
  settingsHref: string;
  /** Ф8: «Үстел нөмірлерін жіберу» (owner or the seating right). */
  tableQueueHref?: string;
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
        {tableQueueHref && (
          <Link className="row" href={tableQueueHref} onClick={() => onOpenChange(false)}>
            <Icon name="send" />
            {t("tableQueue")}
          </Link>
        )}
        {isOwner && (
          <Link className="row" href={settingsHref} onClick={() => onOpenChange(false)}>
            <Icon name="gear" />
            {t("settings")}
          </Link>
        )}
        <form action={actions.logout}>
          <button type="submit" className={cn("row")}>
            <Icon name="login" className="flip-x" />
            {t("logout")}
          </button>
        </form>
      </div>
    </Dialog>
  );
}
