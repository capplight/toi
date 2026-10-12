"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { guestStatus, matchesQuery } from "@/domain/guests/status";
import type { GuestsData } from "@/server/guests/queries";
import { Button, ButtonLink } from "@/ui/components/Button";
import { Search } from "@/ui/components/Controls";
import { EmptyState } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { asLike, type Filter } from "./list-shared";
import { startSend, useConfirmSent, usePending, useWaLinks } from "./send-flow";
import { useSentAgo } from "./sent-ago";

/**
 * The only hydrated part of S1 (RA Л1, Ф6 review §4): the cards, counters and groups are server HTML
 * (`GuestListStatic`). This island renders the search field in place and, through one delegated listener on
 * the page root, handles `data-act`:
 * - `open` — the guest sheet (S4);
 * - `send` / `remind` — wa.me links: the full text is built on the first touch / focus / hover, the click starts
 *   «Жіберілді ме?» (`send-flow`);
 * - `filter` — the counters (`aria-pressed`).
 * Search and filters work on `data.guests` (the page's JSON) and only toggle `hidden` on the server cards.
 * The filter line, empty states and the card's «Жіберілді ме?» row are portals into server slots.
 * `data-ready` on the root marks that taps work (the S1 perf test waits for it).
 */
const noSubscribe = () => () => {};

// Not needed for the first tap: loaded when the browser is idle after the list works (or on first use).
const loadSheet = () => import("./GuestSheet").then((m) => m.GuestSheet);
const loadAsk = () => import("./send-flow").then((m) => m.SendAsk);
const GuestSheet = dynamic(loadSheet, { ssr: false });
const SendAsk = dynamic(loadAsk, { ssr: false });

export function GuestsIsland({ data, flashId }: { data: GuestsData; flashId: string | null }) {
  const t = useTranslations("guests.list");
  const tc = useTranslations("guests.card");
  const ts = useTranslations("common.status");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // The server root of S1 (null during SSR and hydration, then the element).
  const root = useSyncExternalStore(
    noSubscribe,
    () => document.querySelector<HTMLElement>("[data-guests-root]"),
    () => null,
  );
  const pending = usePending();
  const confirmSent = useConfirmSent();
  const link = useWaLinks(data.wa, data.appUrl);
  const sentAgo = useSentAgo(data.event.tz);

  const byId = useMemo(() => new Map(data.guests.map((g) => [g.id, g])), [data.guests]);
  // the delegated listener reads the latest values without being re-attached
  const live = useRef({ byId, link });
  useEffect(() => {
    live.current = { byId, link };
  }, [byId, link]);

  const base = `/e/${data.event.id}/guests`;
  const withList = (path: string, extra = "") => {
    const q = [data.list.own ? "" : `list=${data.list.memberId}`, extra].filter(Boolean).join("&");
    return q ? `${path}?${q}` : path;
  };

  // One listener for the whole list (instead of handlers on every card).
  useEffect(() => {
    if (!root) return;
    const resolve = (a: HTMLAnchorElement) => {
      if (a.hasAttribute("data-resolved")) return;
      const g = live.current.byId.get(a.closest<HTMLElement>("[data-gid]")?.dataset.gid ?? "");
      if (!g) return;
      a.href = live.current.link(a.dataset.act === "remind" ? "reminder" : "invite", {
        name: g.name,
        token: g.token,
        phone: g.phone,
      });
      a.setAttribute("data-resolved", "1");
    };
    const early = (e: Event) => {
      const a = (e.target as Element | null)?.closest<HTMLAnchorElement>("a[data-act='send'], a[data-act='remind']");
      if (a) resolve(a);
    };
    const click = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>("[data-act]");
      if (!el || !root.contains(el)) return;
      const act = el.dataset.act;
      if (act === "filter") {
        const f = el.dataset.filter as Exclude<Filter, null>;
        setFilter((cur) => (cur === f ? null : f));
        return;
      }
      const id = el.closest<HTMLElement>("[data-gid]")?.dataset.gid;
      const g = id ? live.current.byId.get(id) : undefined;
      if (!g) return;
      if (act === "open") setOpenId(g.id);
      else if (act === "send" || act === "remind") {
        resolve(el as HTMLAnchorElement); // before the link activates
        startSend(g.id, g.name, act === "remind" ? "reminder" : "invite");
      }
    };
    root.addEventListener("pointerdown", early);
    root.addEventListener("focusin", early);
    root.addEventListener("mouseover", early);
    root.addEventListener("click", click);
    root.setAttribute("data-ready", "1");
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 200));
    idle(() => void loadSheet());
    return () => {
      root.removeEventListener("pointerdown", early);
      root.removeEventListener("focusin", early);
      root.removeEventListener("mouseover", early);
      root.removeEventListener("click", click);
      root.removeAttribute("data-ready");
    };
  }, [root]);

  // New data after an action (server refresh): wa.me texts are built again on the next touch.
  useEffect(() => {
    root?.querySelectorAll("a[data-resolved]").forEach((a) => a.removeAttribute("data-resolved"));
  }, [root, data.guests]);

  // Search and filters: toggle the server cards and groups.
  const visible = useMemo(() => {
    const ids = new Set<string>();
    for (const g of data.guests) {
      if (!matchesQuery(g.name, query)) continue;
      if (filter && guestStatus(asLike(g)) !== filter) continue;
      ids.add(g.id);
    }
    return ids;
  }, [data.guests, query, filter]);
  useEffect(() => {
    if (!root) return;
    root.querySelectorAll<HTMLElement>("section[data-cat]").forEach((sec) => {
      let n = 0;
      sec.querySelectorAll<HTMLElement>("[data-gid]").forEach((card) => {
        const on = visible.has(card.dataset.gid ?? "");
        card.hidden = !on;
        if (on) n++;
      });
      sec.hidden = n === 0;
    });
    root
      .querySelectorAll<HTMLElement>("[data-act='filter']")
      .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filter)));
  }, [root, visible, filter, data.guests]);

  // «Жіберілді ме?» row on the card after returning from WhatsApp without an answer (DESIGN_v2 8.5).
  const pendingCard =
    root && pending && pending.stage !== "ask"
      ? root.querySelector<HTMLElement>(`[data-gid="${CSS.escape(pending.familyId)}"]`)
      : null;
  useEffect(() => {
    if (!root) return;
    root.querySelectorAll(".guest.pending").forEach((el) => el.classList.remove("pending"));
    pendingCard?.classList.add("pending");
  }, [root, pendingCard]);

  // W7: the card just added
  useEffect(() => {
    if (flashId) document.getElementById(`g-${flashId}`)?.scrollIntoView({ block: "center" });
  }, [flashId]);

  const statusSlot = root?.querySelector<HTMLElement>("[data-slot='list-status']") ?? null;
  const statusWord: Record<Exclude<Filter, null>, string> = { yes: ts("yes"), noAnswer: ts("noAnswer"), no: ts("no") };
  const empty = data.guests.length === 0;
  const open = openId ? (byId.get(openId) ?? null) : null;

  return (
    <>
      {!empty && (
        <Search label={t("search.label")} placeholder={t("search.placeholder")} value={query} onChange={setQuery} />
      )}
      {statusSlot &&
        createPortal(
          <>
            {filter && (
              <div className="list-filter" role="status">
                <span>{t("filter.active", { status: statusWord[filter] })}</span>
                <Button variant="text" size="row" width="auto" onClick={() => setFilter(null)}>
                  {t("filter.clear")}
                </Button>
              </div>
            )}
            {!empty &&
              visible.size === 0 &&
              (query.trim() ? (
                <EmptyState
                  title={t("search.empty", { query: query.trim() })}
                  action={
                    <ButtonLink
                      href={withList(`${base}/add`, `name=${encodeURIComponent(query.trim())}`)}
                      variant="secondary"
                      icon="plus"
                    >
                      {t("search.addWithName")}
                    </ButtonLink>
                  }
                />
              ) : (
                <EmptyState title={t("filter.empty")} />
              ))}
          </>,
          statusSlot,
        )}
      {pendingCard &&
        pending &&
        createPortal(
          <div className="pending-row">
            <Icon name="wa" size="sm" />
            <span>{tc("pendingConfirm")}</span>
            <Button variant="secondary" size="row" width="auto" onClick={() => void confirmSent(pending)}>
              {tc("pendingYes")}
            </Button>
          </div>,
          pendingCard.querySelector<HTMLElement>("[data-slot='pending']") ?? pendingCard,
        )}
      {pending && <SendAsk />}
      <GuestSheet
        guest={open}
        data={data}
        onClose={() => setOpenId(null)}
        link={link}
        sentAgo={sentAgo}
        onSend={(g, kind) => startSend(g.id, g.name, kind)}
        editHref={(id) => withList(`${base}/add`, `edit=${id}`)}
      />
    </>
  );
}
