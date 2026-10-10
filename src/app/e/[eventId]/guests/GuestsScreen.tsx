"use client";

import { useTranslations } from "next-intl";
import { startTransition, useEffect, useMemo, useState } from "react";
import { compareGuests, daysAgo, type GuestLike, guestStatus, listTotals, matchesQuery } from "@/domain/guests/status";
import type { GuestsData, GuestView } from "@/server/guests/queries";
import { Button, ButtonLink } from "@/ui/components/Button";
import { Search } from "@/ui/components/Controls";
import {
  Banner,
  CounterTile,
  EmptyState,
  EventHero,
  GroupHead,
  GuestCard,
  LinkRow,
  LinkRows,
} from "@/ui/components/Display";
import { GuestSheet } from "./GuestSheet";
import { SendAsk, startSend, useConfirmSent, usePending, useWaLinks } from "./send-flow";

type Filter = "yes" | "noAnswer" | "no" | null;
const FIRST_CARDS = 8;

/** wa.me chat without text — the href until the full link is resolved (see GuestCard `WaHref`). */
const chatUrl = (phone: string | null) => `https://wa.me/${phone ? phone.replace(/D/g, "") : ""}`;

export const asLike = (g: GuestView): GuestLike & { id: string } => ({
  id: g.id,
  name: g.name,
  rsvp: g.rsvp,
  expected: g.expected,
  confirmed: g.confirmed,
  sentAt: g.sentAt ? new Date(g.sentAt) : null,
});

/** «3 күн бұрын жіберілді» / «Бүгін жіберілді» / «Кеше жіберілді» (event time zone). */
export function useSentAgo(tz: string) {
  const t = useTranslations("common.time");
  return (iso: string | null) => {
    if (!iso) return undefined;
    const d = daysAgo(new Date(iso), new Date(), tz);
    return d === 0 ? t("sentToday") : d === 1 ? t("sentYesterday") : t("sentDaysAgo", { days: d });
  };
}

/** S1 «Менің тізімім» (DESIGN_v2 8.1, design_spec 4.1, mockup 01). */
export function GuestsScreen({
  data,
  kindLabel,
  flashId,
}: {
  data: GuestsData;
  kindLabel: string;
  flashId: string | null;
}) {
  const t = useTranslations("guests.list");
  const tu = useTranslations("common.units");
  const tc = useTranslations("guests.card");
  const ts = useTranslations("common.status");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const pending = usePending();
  const confirmSent = useConfirmSent();
  const link = useWaLinks(data.wa, data.appUrl);
  const sentAgo = useSentAgo(data.event.tz);

  const base = `/e/${data.event.id}/guests`;
  const listParam = data.list.own ? "" : `list=${data.list.memberId}`;
  const withList = (path: string, extra = "") => {
    const q = [listParam, extra].filter(Boolean).join("&");
    return q ? `${path}?${q}` : path;
  };
  const shown = data.members.find((m) => m.id === data.list.memberId);
  const title = data.list.own ? t("title") : (shown?.listName ?? t("title"));

  const totals = useMemo(() => listTotals(data.guests.map(asLike)), [data.guests]);
  const groups = useMemo(() => {
    const visible = data.guests.filter((g) => {
      if (!matchesQuery(g.name, query)) return false;
      if (!filter) return true;
      return guestStatus(asLike(g)) === filter;
    });
    return data.categories
      .map((c) => ({
        category: c,
        all: data.guests.filter((g) => g.categoryId === c.id),
        guests: visible.filter((g) => g.categoryId === c.id).sort((a, b) => compareGuests(asLike(a), asLike(b))),
      }))
      .filter((x) => x.guests.length > 0);
  }, [data.guests, data.categories, query, filter]);

  // Perf (brief 2.4, 65 families < 1 s): the first paint and hydration cover the first cards only (what fits on
  // a phone screen and more); the rest renders when the browser is idle right after (a low-priority transition),
  // so the page reacts to taps first. Search and filters always see the whole list.
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    const go = () => startTransition(() => setComplete(true));
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(go, { timeout: 600 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(go, 50);
    return () => window.clearTimeout(id);
  }, []);
  const cap = complete || query.trim() || filter ? Number.POSITIVE_INFINITY : FIRST_CARDS;
  const shownGroups = useMemo(() => {
    if (!Number.isFinite(cap)) return groups;
    let left = cap;
    const out: typeof groups = [];
    for (const g of groups) {
      if (left <= 0) break;
      out.push({ ...g, guests: g.guests.slice(0, left) });
      left -= g.guests.length;
    }
    return out;
  }, [groups, cap]);

  useEffect(() => {
    if (!flashId) return;
    document.getElementById(`g-${flashId}`)?.scrollIntoView({ block: "center" });
  }, [flashId, cap]);

  const open = data.guests.find((g) => g.id === openId) ?? null;
  const toggle = (f: Exclude<Filter, null>) => setFilter((cur) => (cur === f ? null : f));
  const empty = data.guests.length === 0;
  const others = data.members.filter((m) => m.id !== data.list.memberId);

  const statusWord: Record<Exclude<Filter, null>, string> = { yes: ts("yes"), noAnswer: ts("noAnswer"), no: ts("no") };

  return (
    <div className="page guests-page">
      <div className="col-main">
        <div className="page-head desk-only o1">
          <div className="ttl">
            <h1 className="t-h1">{title}</h1>
            <p>
              {t("subtitleWithTotal", {
                list: shown?.listName ?? "",
                total: t("total", { families: totals.families, seats: totals.seats }),
              })}
            </p>
          </div>
          <ButtonLink href={withList(`${base}/add`)} icon="plus" width="auto">
            {t("addButton")}
          </ButtonLink>
        </div>

        {!empty && (
          <div className="o5">
            <Search label={t("search.label")} placeholder={t("search.placeholder")} value={query} onChange={setQuery} />
          </div>
        )}

        <div className="o6 guest-groups">
          {filter && (
            <div className="list-filter" role="status">
              <span>{t("filter.active", { status: statusWord[filter] })}</span>
              <Button variant="text" size="row" width="auto" onClick={() => setFilter(null)}>
                {t("filter.clear")}
              </Button>
            </div>
          )}
          {empty ? (
            <EmptyState title={t("empty.title")} body={t("empty.body")} />
          ) : groups.length === 0 ? (
            query.trim() ? (
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
            )
          ) : (
            shownGroups.map(({ category, all, guests }) => (
              <section key={category.id} aria-label={category.label}>
                <GroupHead
                  code={category.code ?? undefined}
                  title={category.label}
                  count={`${tu("families", { count: all.length })} · ${tu("seats", {
                    count: listTotals(all.map(asLike)).seats,
                  })}`}
                />
                {guests.map((g) => {
                  const like = asLike(g);
                  const status = guestStatus(like);
                  const fam = { name: g.name, token: g.token, phone: g.phone };
                  const isPending = pending?.familyId === g.id && pending.stage !== "ask";
                  return (
                    <GuestCard
                      key={g.id}
                      id={`g-${g.id}`}
                      name={g.name}
                      status={status}
                      seats={status === "yes" ? (g.confirmed ?? 0) : g.expected}
                      tableNo={g.tableNo}
                      hasPhone={Boolean(g.phone)}
                      sentAgo={status === "noAnswer" ? sentAgo(g.remindedAt ?? g.sentAt) : undefined}
                      flash={g.id === flashId}
                      pendingConfirm={isPending}
                      onOpen={() => setOpenId(g.id)}
                      sendHref={{ base: chatUrl(g.phone), resolve: () => link("invite", fam) }}
                      remindHref={
                        status === "noAnswer"
                          ? { base: chatUrl(g.phone), resolve: () => link("reminder", fam) }
                          : undefined
                      }
                      onSend={() => startSend(g.id, g.name, "invite")}
                      onRemind={() => startSend(g.id, g.name, "reminder")}
                      onConfirmSent={() => pending && void confirmSent(pending)}
                    />
                  );
                })}
              </section>
            ))
          )}
        </div>
      </div>

      <div className="col-aside">
        <div className="o1">
          <EventHero
            compact="phone"
            title={data.event.title}
            kindLabel={kindLabel}
            dateLine={data.event.dateLine}
            venue={data.event.venue ?? undefined}
          />
        </div>
        {!empty && (
          <div className="o3">
            <div className="counters compact-phone" role="group" aria-label={t("counters.label")}>
              <CounterTile
                kind="yes"
                text={t("counters.yes", { count: totals.yesSeats })}
                pressed={filter === "yes"}
                onToggle={() => toggle("yes")}
              />
              <CounterTile
                kind="inv"
                text={t("counters.noAnswer", { count: totals.noAnswer })}
                pressed={filter === "noAnswer"}
                onToggle={() => toggle("noAnswer")}
              />
              <CounterTile
                kind="no"
                text={t("counters.no", { count: totals.no })}
                pressed={filter === "no"}
                onToggle={() => toggle("no")}
              />
            </div>
            <p className="totals-line">{t("total", { families: totals.families, seats: totals.seats })}</p>
          </div>
        )}
        {totals.noAnswer > 0 && (
          <div className="o4">
            <Banner
              kind="remind"
              className="compact-phone"
              title={t("remindBanner.title", { count: totals.noAnswer })}
              text={t("remindBanner.action")}
              href={withList(`${base}/no-answer`)}
            />
          </div>
        )}
        {others.length > 0 && (
          <div className="o7 other-lists">
            <LinkRows title={t("otherLists.title")}>
              {others.map((m) => (
                <LinkRow
                  key={m.id}
                  href={m.isMe ? base : `${base}?list=${m.id}`}
                  icon="users"
                  title={m.isMe ? `${t("title")} · ${m.listName}` : m.listName}
                  subtitle={`${tu("families", { count: m.families })} · ${tc("seatsApprox", { count: m.seats })}`}
                />
              ))}
            </LinkRows>
          </div>
        )}
      </div>

      <div className="sticky-cta">
        <ButtonLink href={withList(`${base}/add`)} icon="plus">
          {t("addButton")}
        </ButtonLink>
      </div>

      <SendAsk />
      <GuestSheet
        guest={open}
        data={data}
        onClose={() => setOpenId(null)}
        link={link}
        sentAgo={sentAgo}
        onSend={(g, kind) => startSend(g.id, g.name, kind)}
        editHref={(id) => withList(`${base}/add`, `edit=${id}`)}
      />
    </div>
  );
}
