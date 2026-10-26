"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { applyFullReseatAction, previewFullReseatAction, reorderCategoriesAction } from "@/server/actions/hall";
import type { FullReseatPreview } from "@/server/seating/hall";
import type { HallView } from "@/server/seating/view";
import { Button } from "@/ui/components/Button";
import { Banner } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { Dialog } from "@/ui/components/Sheet";
import { showToast } from "@/ui/components/Toast";
import { HallMap } from "@/ui/hall/HallMap";
import { cn } from "@/ui/lib/cn";
import { useOthersChanged, useSeatingUndoToast } from "../hall-client";

const PREVIEW_ROWS = 5;

/**
 * H5: ↑ / ↓ 48×48 (the first ↑ and the last ↓ stay in place, inactive); the order is saved at once and nobody is
 * re-seated (Р4) — banner «Рет сақталды…», toast with «Қайтару». FLIP 200 ms (W10), the focus stays on the pressed
 * button. «Толық қайта отырғызу» → preview (N moves, M locked stay, up to 5 rows) → apply; 409 → a fresh preview.
 */
export function OrderScreen({ v }: { v: HallView }) {
  const t = useTranslations();
  const router = useRouter();
  const undoToast = useSeatingUndoToast(v.event.id);
  useOthersChanged({
    version: v.seatingVersion,
    recent: v.history.recent,
    me: v.meMemberId,
    historyHref: `/e/${v.event.id}/hall/history`,
  });
  const serverOrder = useMemo(() => [...v.categories].sort((a, b) => a.rank - b.rank).map((c) => c.id), [v.categories]);
  const [order, setOrder] = useState(serverOrder);
  const [moved, setMoved] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<FullReseatPreview | null>(null);
  const [stale, setStale] = useState(false);
  const [pending, start] = useTransition();
  const cat = useMemo(() => new Map(v.categories.map((c) => [c.id, c])), [v.categories]);
  // a new server order (refresh, somebody else's change) replaces the local one
  const serverKey = serverOrder.join();
  const [shownKey, setShownKey] = useState(serverKey);
  if (shownKey !== serverKey) {
    setShownKey(serverKey);
    setOrder(serverOrder);
  }

  // FLIP (W10): remember row positions before a swap, animate from the old place after it.
  const rows = useRef(new Map<string, HTMLLIElement>());
  const before = useRef(new Map<string, number>());
  const focusAfter = useRef<{ id: string; dir: "up" | "down" } | null>(null);
  useLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [id, el] of rows.current) {
      const top = before.current.get(id);
      if (top === undefined) continue;
      const dy = top - el.getBoundingClientRect().top;
      if (!dy || reduce) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = "transform 200ms var(--ease-inout)";
        el.style.transform = "";
      });
    }
    before.current.clear();
    const f = focusAfter.current;
    if (f) {
      rows.current.get(f.id)?.querySelector<HTMLButtonElement>(`button[data-dir="${f.dir}"]`)?.focus();
      focusAfter.current = null;
    }
  }, [order]);

  const swap = (i: number, dir: "up" | "down") => {
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= order.length || pending) return;
    for (const [id, el] of rows.current) before.current.set(id, el.getBoundingClientRect().top);
    const prev = order;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    const id = order[i]!;
    focusAfter.current = { id, dir };
    setOrder(next);
    setMoved(id);
    start(async () => {
      const r = await reorderCategoriesAction({
        eventId: v.event.id,
        order: next,
        seatingVersion: v.seatingVersion,
        movedCategoryId: id,
      });
      if ("error" in r) {
        setOrder(prev);
        return void showToast({ message: t("errors.forbidden") });
      }
      if (!r.ok) {
        setOrder(serverOrder);
        showToast({ message: t("errors.conflict") });
        router.refresh();
        return;
      }
      setSaved(true);
      undoToast(t("hall.order.toast", { category: cat.get(id)?.label ?? "", position: j + 1 }), r.historyId);
    });
  };

  const openPreview = () =>
    start(async () => {
      const r = await previewFullReseatAction({ eventId: v.event.id });
      if ("error" in r) return void showToast({ message: t("errors.forbidden") });
      setStale(false);
      setPreview(r.preview);
    });

  const apply = () =>
    start(async () => {
      if (!preview) return;
      const r = await applyFullReseatAction({ eventId: v.event.id, seatingVersion: preview.seatingVersion });
      if ("error" in r) return void showToast({ message: t("errors.forbidden") });
      if (!r.ok) {
        setStale(true);
        setPreview(r.preview);
        return;
      }
      setPreview(null);
      undoToast(t("hall.order.preview.doneToast", { count: r.count }), r.historyId);
    });

  const table = (n: number | null) => (n === null ? "—" : String(n));

  return (
    <div className="order-screen">
      <h1 className="t-h1 desk-only" style={{ margin: 0 }}>
        {t("hall.order.title")}
      </h1>
      {!v.canSeat && <Banner kind="view" title={t("hall.map.banners.viewOnly")} />}
      <p className="t-body t-muted" style={{ margin: 0 }}>
        {t("hall.order.intro")}
      </p>
      {saved && (
        <div className="info-banner" role="status" data-testid="order-saved">
          <Icon name="alert" />
          <span>
            <b>{t("hall.order.savedTitle")}</b>
            {t("hall.order.savedBody")}
          </span>
        </div>
      )}
      <ol className="order" data-testid="order-list">
        {order.map((id, i) => {
          const c = cat.get(id)!;
          const metaText = c.tables
            ? t("hall.order.rowMeta", { seats: c.seats, tables: c.tables })
            : t("common.units.seats", { count: c.seats });
          return (
            <li
              key={id}
              ref={(el) => {
                if (el) rows.current.set(id, el);
                else rows.current.delete(id);
              }}
              className={cn(moved === id && "moved")}
            >
              <span className="no">{i + 1}</span>
              <span className="mark" style={{ background: `var(--cat-${c.code})` }} aria-hidden="true" />
              <span>
                <b>{c.label}</b>
                <span className="m">{metaText}</span>
              </span>
              {v.canSeat ? (
                <span className="arr">
                  <button
                    type="button"
                    data-dir="up"
                    aria-label={t("hall.order.up", { category: c.label })}
                    aria-disabled={i === 0}
                    onClick={() => swap(i, "up")}
                  >
                    <Icon name="up" />
                  </button>
                  <button
                    type="button"
                    data-dir="down"
                    aria-label={t("hall.order.down", { category: c.label })}
                    aria-disabled={i === order.length - 1}
                    onClick={() => swap(i, "down")}
                  >
                    <Icon name="up" className="rot-180" />
                  </button>
                </span>
              ) : (
                <span className="vo">{t("hall.order.viewOnly")}</span>
              )}
            </li>
          );
        })}
      </ol>
      {v.canSeat && (
        <Button variant="secondary" icon="refresh" loading={pending && !preview} onClick={openPreview}>
          {t("hall.order.fullReseat")}
        </Button>
      )}
      <div className="order-side desk-only">
        <div className="stage">
          <HallMap
            stats={v.stats}
            columns={v.hall!.columns}
            categoryCodes={Object.fromEntries(v.categories.map((c) => [c.id, c.code]))}
            eventKind={v.event.kind}
            eventTitle={v.event.title}
          />
        </div>
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
        title={t("hall.order.preview.title")}
        footer={
          preview && preview.moves.length > 0 ? (
            <>
              <Button variant="primary" loading={pending} onClick={apply}>
                {t("hall.order.preview.yes")}
              </Button>
              <Button variant="secondary" autoFocus onClick={() => setPreview(null)}>
                {t("common.actions.no")}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setPreview(null)}>
              {t("common.actions.no")}
            </Button>
          )
        }
      >
        {preview && (
          <div data-testid="reseat-preview">
            {stale && (
              <div className="stale" role="alert">
                <Icon name="alert" />
                <span>{t("hall.order.preview.stale")}</span>
              </div>
            )}
            {preview.moves.length === 0 ? (
              <p className="t-body">{t("hall.order.preview.none")}</p>
            ) : (
              <>
                <p className="pv-big">{t("hall.order.preview.moves", { count: preview.moves.length })}</p>
                {preview.locked > 0 && (
                  <p className="pv-sub">
                    <Icon name="lock" size="sm" />
                    {t("hall.order.preview.locked", { count: preview.locked })}
                  </p>
                )}
                <ul className="moves">
                  {preview.moves.slice(0, PREVIEW_ROWS).map((m) => (
                    <li key={m.familyId}>
                      {t("hall.order.preview.item", { name: m.name, from: table(m.from), to: table(m.to) })}
                    </li>
                  ))}
                  {preview.moves.length > PREVIEW_ROWS && (
                    <li className="more">{t("common.list.andMore", { count: preview.moves.length - PREVIEW_ROWS })}</li>
                  )}
                </ul>
              </>
            )}
            {preview.unplaced > 0 && (
              <p className="pv-sub">{t("hall.order.preview.unplaced", { count: preview.unplaced })}</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
