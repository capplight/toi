"use client";

import * as Accordion from "@radix-ui/react-accordion";
import * as Collapsible from "@radix-ui/react-collapsible";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { cn } from "../lib/cn";
import { Divider, KoshkarMuiz, Shanyraq } from "../ornaments/generated";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

/* ---------------- StatusBadge (icon + word, DESIGN_v2 7) ---------------- */

export type GuestStatus = "notSent" | "noAnswer" | "yes" | "no";
const BADGE: Record<GuestStatus, { cls: string; icon: IconName }> = {
  notSent: { cls: "new", icon: "send" },
  noAnswer: { cls: "inv", icon: "clock" },
  yes: { cls: "yes", icon: "yes" },
  no: { cls: "no", icon: "no" },
};

export function StatusBadge({ status, seats }: { status: GuestStatus; seats?: number }) {
  const t = useTranslations("common.status");
  const b = BADGE[status];
  return (
    <span className={cn("badge", b.cls)}>
      <Icon name={b.icon} />
      {status === "yes" && seats ? t("yesWithSeats", { seats }) : t(status)}
    </span>
  );
}

/* ---------------- GuestCard (mobile card / desktop row) ---------------- */

export type GuestCardProps = {
  name: string;
  status: GuestStatus;
  /** Seats to show: confirmed for «yes», expected (≈) otherwise. */
  seats: number;
  tableNo: number | null;
  hasPhone?: boolean;
  /** «3 күн бұрын жіберілді» etc., already formatted. */
  sentAgo?: string;
  /** After «WhatsApp-қа жіберу» was pressed but not confirmed (DESIGN_v2 8.5). */
  pendingConfirm?: boolean;
  flash?: boolean;
  onOpen?: () => void;
  onSend?: () => void;
  onRemind?: () => void;
  onConfirmSent?: () => void;
};

export function GuestCard(p: GuestCardProps) {
  const t = useTranslations("guests.card");
  const ts = useTranslations("common.status");
  const tn = useTranslations("guestSheet.fields");
  const seatsText = p.status === "yes" ? t("seats", { count: p.seats }) : t("seatsApprox", { count: p.seats });
  const statusText = p.status === "yes" ? ts("yes") : ts(p.status);
  const tableText = p.tableNo ? t("table", { number: p.tableNo }) : tn("notSeated");
  const a11y = t("a11y", { name: p.name, status: statusText, seats: seatsText, table: tableText });
  return (
    <div className={cn("guest", "desktop", p.flash && "flash")}>
      <button
        type="button"
        onClick={p.onOpen}
        aria-label={a11y}
        style={{ all: "unset", position: "absolute", inset: 0, borderRadius: "inherit", cursor: "pointer" }}
      />
      <div className="name">{p.name}</div>
      {p.hasPhone && (
        <span className="phone" title={t("phoneIcon")}>
          <Icon name="phone" size="sm" />
          <span className="sr-only">{t("phoneIcon")}</span>
        </span>
      )}
      <div className="row2" aria-hidden="true">
        <StatusBadge status={p.status} seats={p.status === "yes" ? p.seats : undefined} />
        {p.status !== "yes" && p.status !== "no" && <span>{seatsText}</span>}
        {p.tableNo && <span className="tbl">{t("table", { number: p.tableNo })}</span>}
      </div>
      {p.pendingConfirm ? (
        <div className="pending-row" style={{ position: "relative" }}>
          <Icon name="wa" size="sm" />
          <span>{t("pendingConfirm")}</span>
          <Button variant="secondary" size="row" width="auto" onClick={p.onConfirmSent}>
            {t("pendingYes")}
          </Button>
        </div>
      ) : p.status === "notSent" && p.onSend ? (
        <div className="act" style={{ position: "relative" }}>
          <Button variant="wa" size="row" icon="wa" onClick={p.onSend}>
            {t("sendWhatsApp")}
          </Button>
        </div>
      ) : p.status === "noAnswer" && p.onRemind ? (
        <div className="act" style={{ position: "relative" }}>
          {p.sentAgo && <span className="ago">{p.sentAgo}</span>}
          <Button variant="wa-outline" icon="bell" onClick={p.onRemind}>
            {t("remind")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- CounterTile (filter, aria-pressed) ---------------- */

export function CounterTile({
  kind,
  text,
  pressed,
  onToggle,
}: {
  kind: "yes" | "inv" | "no";
  /** «78 орын\nКеледі» (content/messages guests.list.counters.*). */
  text: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  const icon: IconName = kind === "yes" ? "yes" : kind === "inv" ? "clock" : "no";
  // Design: the number large (stat), its unit small on the same line, the status word below.
  const [first = "", ...rest] = text.split("\n");
  const m = first.match(/^(\D*?)(\d[\d\s]*)(.*)$/);
  return (
    <button type="button" className={cn("counter", kind)} aria-pressed={pressed} onClick={onToggle}>
      <Icon name={icon} />
      <span className="val">
        {m ? (
          <>
            {m[1]}
            <b className="t-stat">{m[2]!.trim()}</b> {m[3]!.trim()}
          </>
        ) : (
          first
        )}
      </span>
      {rest.length > 0 && <span className="lbl">{rest.join(" ")}</span>}
    </button>
  );
}

/* ---------------- Banner ---------------- */

export type BannerKind = "remind" | "error" | "dup" | "view" | "unplaced";
const BANNER_ICON: Record<BannerKind, IconName> = {
  remind: "bell",
  error: "alert",
  dup: "users",
  view: "eye",
  unplaced: "user-plus",
};

export function Banner({
  kind,
  title,
  text,
  href,
  onClick,
  live = false,
}: {
  kind: BannerKind;
  title: string;
  text?: string;
  href?: string;
  onClick?: () => void;
  /** `role="status"` when it appears dynamically. */
  live?: boolean;
}) {
  const body = (
    <>
      <span className="bi">
        <Icon name={BANNER_ICON[kind]} />
      </span>
      <span className="bt">
        <b>{title}</b>
        {text && <span>{text}</span>}
      </span>
      {(href || onClick) && <Icon name="up" style={{ transform: "rotate(90deg)" }} />}
    </>
  );
  const cls = cn("banner", kind);
  // A live banner is announced by a wrapping status region (the link/button keeps its own role).
  const el = href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : onClick ? (
    <button type="button" className={cls} onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
  return live ? <div role="status">{el}</div> : el;
}

/* ---------------- StatusChip (B1) ---------------- */

const CHIP_ICON: Record<"error" | "dup" | "unplaced" | "view", IconName> = {
  error: "alert",
  dup: "users",
  unplaced: "x",
  view: "eye",
};

export function StatusChip({
  kind,
  label,
  a11yLabel,
  onClick,
}: {
  kind: "error" | "dup" | "unplaced" | "view";
  label: string;
  /** Full banner text for screen readers. */
  a11yLabel: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" className={cn("chip", kind)} aria-label={a11yLabel} onClick={onClick}>
      <Icon name={CHIP_ICON[kind]} />
      <span aria-hidden="true">{label}</span>
    </button>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <div className="chips">{children}</div>;
}

/* ---------------- SummaryLine (Radix Collapsible, ≤ 56 px) ---------------- */

export function SummaryLine({
  line,
  restaurant,
  children,
  defaultOpen = false,
}: {
  /** «173 / 192 орын · 19 бос» */
  line: string;
  /** «Мейрамханаға: 173 адам → 15 үстел» */
  restaurant: string;
  /** Full summary card content. */
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("hall.map.summary");
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="sum">
      <Collapsible.Trigger className="sum-line" aria-label={`${line}. ${restaurant}. ${t("expand")}`}>
        <span className="tx" aria-hidden="true">
          <b>{line}</b>
          <span>{restaurant}</span>
        </span>
        <Icon name="up" style={{ transform: open ? undefined : "rotate(180deg)" }} />
      </Collapsible.Trigger>
      <Collapsible.Content className="sum-body">{children}</Collapsible.Content>
    </Collapsible.Root>
  );
}

/* ---------------- EventHero ---------------- */

export function EventHero({
  title,
  kindLabel,
  dateLine,
  venue,
  compact = false,
}: {
  title: string;
  kindLabel?: string;
  dateLine: string;
  venue?: string;
  /** Phone version (N1): ≈ 92 px, no kicker and divider. */
  compact?: boolean;
}) {
  return (
    <section className={cn("event-hero", compact && "compact")}>
      <Shanyraq className="shanyraq draw spin-once" />
      {!compact && kindLabel && <div className="kicker">{kindLabel}</div>}
      <h2 className="names">{title}</h2>
      {!compact && (
        <div className="divider" aria-hidden="true">
          <i />
          <KoshkarMuiz />
          <i />
        </div>
      )}
      <div className="meta">
        <b>{dateLine}</b>
        {venue && (
          <>
            {compact ? " · " : <br />}
            {venue}
          </>
        )}
      </div>
    </section>
  );
}

/* ---------------- LinkRow ---------------- */

export function LinkRows({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <nav className="links" aria-label={title}>
      {title && (
        <div className="t-body t-muted" style={{ padding: "12px 16px 0" }}>
          {title}
        </div>
      )}
      {children}
    </nav>
  );
}

export function LinkRow({
  href,
  icon,
  title,
  subtitle,
  count,
}: {
  href: string;
  icon: IconName;
  title: string;
  subtitle?: string;
  count?: number;
}) {
  return (
    <Link href={href} className="link-row">
      <span className="li">
        <Icon name={icon} />
      </span>
      <span className="lt">
        <b>{title}</b>
        {subtitle && <span>{subtitle}</span>}
      </span>
      {count !== undefined && <span className="count num">{count}</span>}
      <Icon name="up" style={{ transform: "rotate(90deg)" }} />
    </Link>
  );
}

/* ---------------- Accordion (H2-List: tables) ---------------- */

export type AccordionEntry = { id: string; title: string; meta: string; over?: boolean; content: ReactNode };

export function TableAccordion({ items }: { items: AccordionEntry[] }) {
  return (
    <Accordion.Root type="multiple">
      {items.map((it) => (
        <Accordion.Item key={it.id} value={it.id} className={cn("acc-item", it.over && "over")}>
          <Accordion.Header style={{ margin: 0 }}>
            <Accordion.Trigger className="acc-trigger">
              <span>{it.title}</span>
              <span className="meta num">{it.meta}</span>
              <Icon name="up" style={{ transform: "rotate(180deg)" }} />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content className="acc-content">{it.content}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

/* ---------------- ProgressBar ---------------- */

export function ProgressBar({
  value,
  max,
  label,
  tone = "lapis",
}: {
  value: number;
  max: number;
  label: string;
  tone?: "lapis" | "success" | "over";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      className={cn("progress", tone !== "lapis" && tone)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------- FamilyRow (inside a table) ---------------- */

export function FamilyRow({
  index,
  name,
  meta,
  lockedText,
  actions,
}: {
  index: number;
  name: string;
  /** «Нағашылар · 6 орын · ✓ Келеді» */
  meta: string;
  /** «Қолмен қойылған (Анасы)» */
  lockedText?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="fam">
      <span className="no num" aria-hidden="true">
        {index}
      </span>
      <div>
        <div className="nm">{name}</div>
        <div className="mt">{meta}</div>
        {lockedText && (
          <div className="locked">
            <Icon name="lock" size="sm" />
            {lockedText}
          </div>
        )}
        {actions && <div className="acts">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------------- Skeleton / Empty / Group head ---------------- */

export function Skeleton({ height = 76 }: { height?: number }) {
  return <div className="skel" style={{ height }} aria-hidden="true" />;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <KoshkarMuiz />
      <p className="t-h2">{title}</p>
      {body && <p className="t-body t-muted">{body}</p>}
      {action}
    </div>
  );
}

export function GroupHead({ code, title, count }: { code?: string; title: string; count?: string }) {
  return (
    <div className="group-head">
      <h3 className="t-group" style={{ margin: 0 }}>
        <span className="sw" style={{ background: `var(--cat-${code ?? "baska"})` }} aria-hidden="true" />
        {title}
      </h3>
      {count && <span className="t-body t-muted">{count}</span>}
    </div>
  );
}

export function OrnamentDivider() {
  return <Divider style={{ width: 230, color: "var(--gold)" }} />;
}
