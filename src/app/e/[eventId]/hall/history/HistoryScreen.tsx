"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { revertAnswerAction } from "@/server/actions/guests";
import { undoSeatingChangeAction } from "@/server/actions/hall";
import type { HistoryEntry } from "@/server/seating/view";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { showToast } from "@/ui/components/Toast";
import { cn } from "@/ui/lib/cn";
import { dayKey, entryText } from "../history-text";
import { useOthersChanged, useSeatingUndoToast } from "../hall-client";

/**
 * H7: records newest first, grouped «Бүгін / Кеше / 12 қазан» (event time zone); «Қайтару» by the rules of brief
 * Ф7b §2 (guest answers and list operations without it), reverted records struck through with «Қайтарылды · время ·
 * кто», partial undo → `hall.history.partialUndo`. «Тек тізім» sees the history without buttons.
 */
export function HistoryScreen({
  eventId,
  tz,
  entries,
  categories,
  canSeat,
  me,
  seatingVersion,
}: {
  eventId: string;
  tz: string;
  entries: HistoryEntry[];
  categories: Record<string, string>;
  canSeat: boolean;
  me: string;
  seatingVersion: number;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [partial, setPartial] = useState<number | null>(null);
  const undoToast = useSeatingUndoToast(eventId);
  useOthersChanged({ version: seatingVersion, recent: entries, me, historyHref: `/e/${eventId}/hall/history` });

  const tr = (key: string, values?: Record<string, string | number>) => t(key, values);
  const catLabel = (id: string) => categories[id] ?? "";
  const time = (iso: string) => format.dateTime(new Date(iso), { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const [now] = useState(() => Date.now());
  const today = dayKey(new Date(now).toISOString(), tz);
  const yesterday = dayKey(new Date(now - 86_400_000).toISOString(), tz);
  const dayTitle = (iso: string) => {
    const k = dayKey(iso, tz);
    if (k === today) return t("common.time.today");
    if (k === yesterday) return t("common.time.yesterday");
    return format.dateTime(new Date(iso), { day: "numeric", month: "long", timeZone: tz });
  };

  const groups: { key: string; title: string; items: HistoryEntry[] }[] = [];
  for (const e of entries) {
    const k = dayKey(e.at, tz);
    const last = groups[groups.length - 1];
    if (last?.key === k) last.items.push(e);
    else groups.push({ key: k, title: dayTitle(e.at), items: [e] });
  }

  const undo = (e: HistoryEntry) =>
    start(async () => {
      setBusy(e.id);
      setPartial(null);
      const text = entryText(tr, e, catLabel).main;
      if (e.undo === "answer") {
        const r = await revertAnswerAction({ historyId: e.id });
        setBusy(null);
        if ("error" in r) return void showToast({ message: t("errors.forbidden") });
        if (!r.ok) return void showToast({ message: t("errors.conflict") });
        showToast({ message: t("hall.history.revertEntry", { summary: text }) });
        router.refresh();
        return;
      }
      const r = await undoSeatingChangeAction({ eventId, changeId: e.id });
      setBusy(null);
      if ("error" in r) return void showToast({ message: t("errors.forbidden") });
      if (!r.ok) {
        if (r.reason === "changed") setPartial(r.skipped);
        else showToast({ message: t("errors.conflict") });
        router.refresh();
        return;
      }
      if (r.skipped > 0) setPartial(r.skipped);
      undoToast(t("hall.history.revertEntry", { summary: text }), r.historyId);
    });

  return (
    <div className="hist-col" data-testid="history">
      <h1 className="t-h1 desk-only" style={{ margin: "0 0 0.5rem" }}>
        {t("hall.history.title")}
      </h1>
      <p className="t-body t-muted" style={{ margin: "0 0.125rem" }}>
        {t("hall.history.intro")}
      </p>
      {partial !== null && (
        <div className="info-banner" role="status" style={{ marginTop: "1rem" }}>
          <Icon name="alert" />
          <span>{t("hall.history.partialUndo", { count: partial })}</span>
        </div>
      )}
      {entries.length === 0 && <EmptyState title={t("hall.history.empty")} />}
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <h2 className="hist-day">{g.title}</h2>
          <ul className="hist">
            {g.items.map((e) => {
              const x = entryText(tr, e, catLabel);
              const who = e.actorKind === "guest" ? t("hall.history.guestAnswer") : (e.actorLabel ?? "");
              return (
                <li key={e.id} className={cn("he", e.reverted && "rev")} data-testid={`history-${e.id}`}>
                  <div className="meta">
                    {e.actorKind === "guest" && <Icon name="users" size="sm" />}
                    {t("hall.history.entryMeta", { time: time(e.at), member: who })}
                  </div>
                  <div className="sum">{x.main}</div>
                  {x.sub && <div className="line2">{x.sub}</div>}
                  {x.warn.map((w) => (
                    <div key={w.tableNo} className="warn">
                      <Icon name="alert" size="sm" />
                      {t("hall.history.warning", { number: w.tableNo, missing: w.missing })}
                    </div>
                  ))}
                  {e.reverted ? (
                    <div className="revd">
                      <Icon name="undo" size="xs" />
                      {t("hall.history.reverted", { time: time(e.reverted.at), member: e.reverted.actorLabel ?? "" })}
                    </div>
                  ) : !canSeat ? null : e.undo === "seating" || e.undo === "answer" ? (
                    <Button
                      variant="secondary"
                      size="row"
                      width="auto"
                      icon="undo"
                      loading={pending && busy === e.id}
                      disabled={pending}
                      onClick={() => undo(e)}
                    >
                      {t("common.actions.undo")}
                    </Button>
                  ) : e.undo === "guest" ? (
                    <div className="nou">{t("hall.history.guestNoUndo")}</div>
                  ) : (
                    <div className="nou">{t("hall.history.noUndo")}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {entries.length > 0 && <p className="hist-foot">{t("hall.history.footer")}</p>}
    </div>
  );
}
