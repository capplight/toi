"use client";

import { asLocale, formatDateTime, formatTime } from "@/domain/format";

import * as Accordion from "@radix-ui/react-accordion";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import type { TableStat } from "@/domain/seating";
import { moveFamilyAction, seatUnplacedAction, unlockFamilyAction } from "@/server/actions/hall";
import { deleteFamilyAction, keepBothDuplicatesAction, restoreFamilyAction } from "@/server/actions/guests";
import type { HallFamily, HallView } from "@/server/seating/view";
import { Button, ButtonLink } from "@/ui/components/Button";
import { Segment } from "@/ui/components/Controls";
import {
  Banner,
  Chips,
  EmptyState,
  FamilyRow,
  LinkRow,
  LinkRows,
  StatusChip,
  SummaryLine,
} from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { Dialog, Sheet } from "@/ui/components/Sheet";
import { showToast } from "@/ui/components/Toast";
import { HallLegend, HallMap, type TableMark, TableGraphicLarge } from "@/ui/hall/HallMap";
import { afterSheetClosed } from "@/ui/lib/history";
import { cn } from "@/ui/lib/cn";
import { dayKey } from "./history-text";
import { setHallParams, useHallParams, useOthersChanged, useSeatingUndoToast } from "./hall-client";

type SheetState = { kind: "table"; no: number } | { kind: "couple" } | { kind: "dups" } | { kind: "unplaced" } | null;

type Confirm = { familyId: string; to: number; reason?: "suggested"; short: number } | null;

/**
 * H2 «Зал» (DESIGN 8.7, design_spec 4.11–4.16): phone — SummaryLine, chips (B1), «Отырғызылмағандар» banner on
 * the first show, map | list; desktop — head with meta and segment, map with legend fitted to the window height,
 * summary card, banners and links on the right. H3 table sheet, H4 «Ауыстыру» mode on the same map (`?move=`),
 * H6 duplicates, Р3 «Бос орынға ауыстыру». Numbers only from the engine (`hallView`).
 */
export function HallScreen({ v, tz }: { v: HallView; tz: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { view, move } = useHallParams();
  const [sheet, setSheet] = useState<SheetState>(null);
  const [dupFocus, setDupFocus] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [deletePick, setDeletePick] = useState<{ pair: number; id: string | null } | null>(null);
  const [pending, start] = useTransition();
  const undoToast = useSeatingUndoToast(v.event.id);
  const base = `/e/${v.event.id}`;
  useOthersChanged({
    version: v.seatingVersion,
    recent: v.history.recent,
    me: v.meMemberId,
    historyHref: `${base}/hall/history`,
  });

  const fam = useMemo(() => new Map(v.families.map((f) => [f.id, f])), [v.families]);
  const cat = useMemo(() => new Map(v.categories.map((c) => [c.id, c])), [v.categories]);
  const codes = useMemo(() => Object.fromEntries(v.categories.map((c) => [c.id, c.code])), [v.categories]);
  const labels = useMemo(() => Object.fromEntries(v.categories.map((c) => [c.id, c.label])), [v.categories]);
  const stat = useMemo(() => new Map(v.stats.tables.map((s) => [s.no, s])), [v.stats.tables]);
  const hall = v.hall!;
  const unplacedSeats = v.stats.unplaced.reduce((a, id) => a + (fam.get(id)?.seats ?? 0), 0);
  const tablesNeeded = Math.ceil(unplacedSeats / hall.seatsPerTable);
  const dupPeople = v.dups.length * 2;
  const empty = v.families.length === 0;

  // «Отырғызылмағандар» as a banner only on the first show in the session, then as a chip (DESIGN 8.7).
  const unplacedBanner = useFirstShow(`toi-hall-unplaced-${v.event.id}`, v.stats.unplaced.length > 0);
  const [now] = useState(() => Date.now());

  const moving = move ? fam.get(move) : undefined;
  useEffect(() => {
    if (move && !moving) setHallParams({ move: null });
  }, [move, moving]);

  /* ---------------- texts ---------------- */
  const tot = v.totals;
  const line =
    tot.free >= 0
      ? t("hall.map.summary.line", { used: tot.toSeat, capacity: tot.capacity, free: tot.free })
      : t("hall.map.summary.over", { missing: -tot.free });
  const restaurantShort = t("hall.map.summary.restaurantShort", { people: tot.toSeat, tables: tot.usedTables });
  const full = t("hall.map.summary.full", {
    tables: hall.tables,
    yes: tot.confirmed,
    pending: tot.expected,
    free: Math.max(0, tot.free),
  });
  const meta = t("hall.map.meta", { columns: hall.columns, tables: hall.tables, seats: hall.seatsPerTable });
  const lastAt = v.history.recent[0]?.at;
  const lastWhen = lastAt
    ? dayKey(lastAt, tz) === dayKey(new Date(now).toISOString(), tz)
      ? `${t("common.time.today").toLocaleLowerCase(locale)}, ${formatTime(lastAt, tz)}`
      : formatDateTime(lastAt, asLocale(locale), tz)
    : null;

  const famMeta = (f: HallFamily) =>
    f.rsvp === "yes"
      ? t("hall.table.familyMeta", { category: cat.get(f.categoryId)?.label ?? "", seats: f.seats })
      : t("hall.table.familyMetaPending", { seats: f.seats });
  const famsAt = (s: TableStat) => s.familyIds.map((id) => fam.get(id)!).filter(Boolean);

  /* ---------------- actions ---------------- */
  const openMove = (familyId: string) => {
    const go = () => {
      setHallParams({ move: familyId }, "push");
      window.scrollTo({ top: 0 });
    };
    if (sheet) {
      setSheet(null);
      afterSheetClosed(go);
    } else go();
  };
  const leaveMove = () => setHallParams({ move: null });

  const doMove = (c: NonNullable<Confirm>, force: boolean) =>
    start(async () => {
      const f = fam.get(c.familyId)!;
      const r = await moveFamilyAction({
        eventId: v.event.id,
        familyId: f.id,
        toTableNo: c.to,
        force,
        familyVersion: f.version,
        reason: c.reason,
      });
      if ("error" in r) {
        showToast({ message: t(r.error === "forbidden" ? "errors.forbidden" : "errors.unknown") });
        setConfirm(null);
        return;
      }
      if (r.ok) {
        setConfirm(null);
        setHallParams({ move: null });
        undoToast(t("hall.move.toast", { number: c.to, name: f.name }), r.historyId);
      } else if ("overflow" in r) {
        setConfirm({ ...c, short: r.overflow.missing });
      } else if ("conflict" in r) {
        setConfirm(null);
        setHallParams({ move: null });
        showToast({
          message:
            r.memberLabel && r.tableNo
              ? t("hall.map.moveConflict", { member: r.memberLabel, number: r.tableNo })
              : t("errors.conflict"),
        });
        router.refresh();
      }
    });

  const askMove = (familyId: string, to: number, reason?: "suggested") => {
    const f = fam.get(familyId)!;
    const s = stat.get(to)!;
    setConfirm({ familyId, to, reason, short: Math.max(0, f.seats - s.free) });
  };

  const unlock = (f: HallFamily) =>
    start(async () => {
      const r = await unlockFamilyAction({ eventId: v.event.id, familyId: f.id });
      if ("error" in r) return void showToast({ message: t("errors.forbidden") });
      undoToast(t("hall.table.unlockToast", { name: f.name }), r.historyId);
    });

  const seatFree = () =>
    start(async () => {
      const r = await seatUnplacedAction({ eventId: v.event.id });
      if ("error" in r) return void showToast({ message: t("errors.forbidden") });
      setSheet(null);
      if (r.seated > 0) undoToast(t("hall.history.seatUnplaced", { count: r.seated }), r.historyId);
      else showToast({ message: t("hall.order.preview.unplaced", { count: r.left }) });
    });

  const keepBoth = (pair: [string, string]) =>
    start(async () => {
      await keepBothDuplicatesAction({ eventId: v.event.id, familyA: pair[0], familyB: pair[1] });
      setSheet(null);
      showToast({ message: t("hall.dups.keptToast") });
    });

  const deleteOne = (id: string) =>
    start(async () => {
      const f = fam.get(id)!;
      const r = await deleteFamilyAction({ familyId: id });
      if ("error" in r) return void showToast({ message: t("errors.forbidden") });
      setDeletePick(null);
      setSheet(null);
      showToast({
        message: t("hall.dups.deletedToast", { name: f.name }),
        undoLabel: t("common.actions.undo"),
        onUndo: async () => {
          await restoreFamilyAction({ familyId: id });
          router.refresh();
        },
      });
    });

  /* ---------------- map marks ---------------- */
  const marks: Record<number, TableMark> = {};
  if (moving) {
    for (const s of v.stats.tables) {
      if (s.no === moving.tableNo) marks[s.no] = { move: "current" };
      else marks[s.no] = { move: s.free >= moving.seats ? "candidate" : "unfit" };
    }
  } else if (dupFocus !== null && v.dups[dupFocus]) {
    v.dups[dupFocus].forEach((id, i) => {
      const f = fam.get(id);
      if (f?.tableNo) marks[f.tableNo] = { dup: { marker: i + 1, seats: f.seats } };
    });
  }

  const onTable = (no: number) => {
    if (moving) {
      if (no !== moving.tableNo) askMove(moving.id, no);
      return;
    }
    setSheet({ kind: "table", no });
  };

  const segment = (
    <Segment
      value={view}
      onChange={(x) => setHallParams({ view: x })}
      label={t("hall.map.view.label")}
      options={[
        { value: "map", label: t("hall.map.view.map"), icon: "grid" },
        { value: "list", label: t("hall.map.view.list"), icon: "list" },
      ]}
    />
  );

  const map = (
    <div className="stage" data-testid="hall-stage">
      <HallMap
        stats={v.stats}
        columns={hall.columns}
        categoryCodes={codes}
        categoryLabels={labels}
        eventKind={v.event.kind}
        eventTitle={v.event.title}
        selected={sheet?.kind === "table" ? sheet.no : null}
        marks={marks}
        dimUnmarked={dupFocus !== null && !moving}
        onSelectTable={onTable}
        onSelectCouple={moving ? undefined : () => setSheet({ kind: "couple" })}
      />
      {!moving && <HallLegend />}
    </div>
  );

  /* ---------------- H4 «Ауыстыру» mode ---------------- */
  if (moving) {
    const suitable = v.stats.tables.filter((s) => s.no !== moving.tableNo && s.free >= moving.seats);
    const others = v.stats.tables.filter((s) => s.no !== moving.tableNo && s.free < moving.seats);
    const choose = (
      <div className="choose">
        <h3>{t("hall.move.suitable")}</h3>
        {suitable.map((s) => (
          <button key={s.no} type="button" className="row" onClick={() => askMove(moving.id, s.no)}>
            <span className="cand" aria-hidden="true" />
            {t("hall.move.suitableItem", { number: s.no, free: s.free })}
            <Icon name="up" className="rot-90" />
          </button>
        ))}
        {others.length > 0 && (
          <details>
            <summary>
              {t("hall.move.others")}
              <Icon name="up" className="rot-180" />
            </summary>
            {others.map((s) => (
              <button key={s.no} type="button" className="row short" onClick={() => askMove(moving.id, s.no)}>
                <span className="cand" aria-hidden="true" />
                {t("hall.move.suitableItem", { number: s.no, free: Math.max(0, s.free) })}
                <Icon name="up" className="rot-90" />
              </button>
            ))}
          </details>
        )}
      </div>
    );
    return (
      <div className="hall-screen move-mode">
        <div className="hall-head">
          <div className="ttl">
            <h1 className="t-h1">{t("hall.move.title")}</h1>
          </div>
          <Button variant="secondary" width="auto" icon="x" onClick={leaveMove}>
            {t("common.actions.cancel")}
          </Button>
        </div>
        <div className="hall-main">
          <div className="mv-info">
            <b>{t("hall.move.family", { name: moving.name, seats: moving.seats })}</b>
            <span>
              {moving.tableNo ? t("hall.move.current", { number: moving.tableNo }) : t("hall.move.currentNone")}
            </span>
            <span>{t("hall.move.hint", { seats: moving.seats })}</span>
          </div>
          {map}
          <div className="mob-only">{choose}</div>
        </div>
        <div className="hall-aside desk-only">{choose}</div>
        <MoveConfirm
          confirm={confirm}
          fam={fam}
          stat={stat}
          pending={pending}
          onClose={() => setConfirm(null)}
          onMove={doMove}
        />
      </div>
    );
  }

  /* ---------------- H2 ---------------- */
  const overflowItems = v.stats.overfull
    .map((s) => t("hall.map.banners.overflowItem", { number: s.no, missing: s.missing }))
    .join(" · ");
  const openOverflow = () => setSheet({ kind: "table", no: v.stats.overfull[0]!.no });
  const grew = v.grew && fam.get(v.grew.familyId);
  const grewBox = v.canSeat && grew && v.grew && (
    <div className="grew" role="status">
      <p>{t("hall.map.banners.seatsGrew", { name: grew.name, number: v.grew.tableNo, missing: v.grew.missing })}</p>
      {v.grew.suggested && (
        <Button
          variant="secondary"
          size="row"
          icon="move"
          onClick={() => askMove(grew.id, v.grew!.suggested!, "suggested")}
        >
          {t("hall.map.banners.moveToFree")}
        </Button>
      )}
    </div>
  );

  const links = (
    <LinkRows>
      <LinkRow
        href={`${base}/hall/order`}
        icon="order"
        title={t("hall.map.links.order")}
        subtitle={t("hall.map.links.orderSub", {
          categories: v.categories
            .slice(0, 3)
            .map((c) => c.label)
            .join(", "),
        })}
      />
      <LinkRow
        href={`${base}/hall/history`}
        icon="history"
        title={t("hall.map.links.history", { count: v.history.count })}
        subtitle={lastWhen ? t("common.time.lastChange", { when: lastWhen }) : undefined}
      />
      <LinkRow href={`${base}/print/tables`} icon="printer" title={t("print.title")} subtitle={t("export.button")} />
      {v.canSeat && (
        <LinkRow href={`${base}/hall/setup`} icon="sliders" title={t("hall.map.links.setup")} subtitle={meta} />
      )}
    </LinkRows>
  );

  const list = (
    <Accordion.Root type="multiple" className="tl" data-testid="hall-list">
      {v.stats.tables.map((s) => {
        const over = s.missing > 0;
        const c = s.mainCategoryId ? cat.get(s.mainCategoryId) : undefined;
        const fams = famsAt(s);
        return (
          <Accordion.Item key={s.no} value={String(s.no)} className={cn("acc-item", over && "over")}>
            <Accordion.Header asChild>
              <h2 className="acc-head">
                <Accordion.Trigger className="acc-trigger">
                  <span className="tt">
                    <span className="tn">
                      {over && <Icon name="alert" size="sm" />}
                      {t("hall.table.title", { number: s.no })}
                    </span>
                    {c && (
                      <span className="tc">
                        <i style={{ background: `var(--cat-${c.code})` }} aria-hidden="true" />
                        {c.label}
                      </span>
                    )}
                  </span>
                  <span className="meta num">
                    {over
                      ? t("hall.map.listHeaderOverflow", { taken: s.used, capacity: s.capacity, missing: s.missing })
                      : t("hall.map.listHeader", { taken: s.used, capacity: s.capacity, free: s.free })}
                  </span>
                  <Icon name="up" className="rot-180" />
                </Accordion.Trigger>
              </h2>
            </Accordion.Header>
            <Accordion.Content className="acc-content">
              {fams.length === 0 ? (
                <p className="tl-empty">{t("hall.table.empty", { capacity: s.capacity })}</p>
              ) : (
                fams.map((f, i) => (
                  <FamilyRow
                    key={f.id}
                    index={i + 1}
                    name={f.name}
                    meta={famMeta(f)}
                    lockedText={f.locked ? t("hall.table.locked", { label: f.lockedByLabel ?? "" }) : undefined}
                    actions={
                      v.canSeat && (
                        <Button variant="secondary" size="row" width="auto" icon="move" onClick={() => openMove(f.id)}>
                          {t("hall.table.move")}
                        </Button>
                      )
                    }
                  />
                ))
              )}
            </Accordion.Content>
          </Accordion.Item>
        );
      })}
    </Accordion.Root>
  );

  return (
    <div className="hall-screen">
      <div className="hall-head">
        <div className="ttl">
          <h1 className="t-h1">{t("hall.map.title")}</h1>
          <p>{meta}</p>
        </div>
        {segment}
      </div>

      <div className="hall-main">
        <div className="mob-only" style={{ display: "grid", gap: "0.5rem" }}>
          {!v.canSeat && <Banner kind="view" title={t("hall.map.banners.viewOnly")} />}
          <SummaryLine line={line} restaurant={restaurantShort}>
            <div className="sub">{full}</div>
            <div className="resto">
              {t("hall.map.summary.restaurant", { people: tot.toSeat, tables: tot.usedTables })}
            </div>
          </SummaryLine>
          {unplacedSeats > 0 && unplacedBanner && (
            <Banner
              kind="unplaced"
              title={t("hall.map.banners.unplaced", { people: unplacedSeats, tables: tablesNeeded })}
              onClick={() => setSheet({ kind: "unplaced" })}
              live
            />
          )}
          {(v.stats.overfull.length > 0 || dupPeople > 0 || (unplacedSeats > 0 && !unplacedBanner)) && (
            <Chips>
              {v.stats.overfull.length > 0 && (
                <StatusChip
                  kind="error"
                  label={t("hall.map.chips.overflow", { count: v.stats.overfull.length })}
                  a11yLabel={t("hall.map.chips.overflowA11y", { count: v.stats.overfull.length })}
                  onClick={openOverflow}
                />
              )}
              {dupPeople > 0 && (
                <StatusChip
                  kind="dup"
                  label={t("hall.map.chips.dups", { count: dupPeople })}
                  a11yLabel={t("hall.map.chips.dupsA11y", { count: dupPeople })}
                  onClick={() => setSheet({ kind: "dups" })}
                />
              )}
              {unplacedSeats > 0 && !unplacedBanner && (
                <StatusChip
                  kind="unplaced"
                  label={t("hall.map.chips.unplaced", { count: unplacedSeats })}
                  a11yLabel={t("hall.map.chips.unplacedA11y", { count: unplacedSeats })}
                  onClick={() => setSheet({ kind: "unplaced" })}
                />
              )}
            </Chips>
          )}
        </div>
        {empty && (
          <EmptyState
            title={t("hall.map.empty.body")}
            action={
              <ButtonLink href={`${base}/guests/add`} variant="secondary" width="auto" icon="user-plus">
                {t("hall.map.empty.add")}
              </ButtonLink>
            }
          />
        )}
        {view === "list" ? list : map}
        <div className="mob-only" style={{ display: "grid", gap: "0.75rem", marginTop: "0.5rem" }}>
          {grewBox}
          {links}
        </div>
      </div>

      <aside className="hall-aside desk-only">
        <section className="sum-card-h" aria-label={t("hall.map.summary.expand")}>
          <div className={cn("big", tot.free < 0 && "over")}>{line}</div>
          <div className="sub">{full}</div>
          <div className="resto">
            <Icon name="users" size="sm" />
            {t("hall.map.summary.restaurant", { people: tot.toSeat, tables: tot.usedTables })}
          </div>
        </section>
        {!v.canSeat && <Banner kind="view" title={t("hall.map.banners.viewOnly")} />}
        {v.stats.overfull.length > 0 && (
          <Banner
            kind="error"
            title={t("hall.map.banners.overflowTitle", { count: v.stats.overfull.length })}
            text={overflowItems}
            onClick={openOverflow}
          />
        )}
        {grewBox}
        {dupPeople > 0 && (
          <Banner
            kind="dup"
            title={t("hall.map.banners.dupsTitle", { count: dupPeople })}
            text={t("hall.map.banners.dupsAction")}
            onClick={() => setSheet({ kind: "dups" })}
          />
        )}
        {unplacedSeats > 0 && (
          <Banner
            kind="unplaced"
            title={t("hall.map.banners.unplaced", { people: unplacedSeats, tables: tablesNeeded })}
            onClick={() => setSheet({ kind: "unplaced" })}
          />
        )}
        {links}
      </aside>

      {/* H3 table sheet */}
      {sheet?.kind === "table" && stat.get(sheet.no) && (
        <TableSheet
          s={stat.get(sheet.no)!}
          fams={famsAt(stat.get(sheet.no)!)}
          catLabel={(id) => cat.get(id ?? "")?.label ?? ""}
          catCode={(id) => (id ? (cat.get(id)?.code ?? "baska") : null)}
          famMeta={famMeta}
          canSeat={v.canSeat}
          next={(() => {
            const i = v.stats.overfull.findIndex((x) => x.no === sheet.no);
            const n = v.stats.overfull[i + 1] ?? (i > 0 ? v.stats.overfull[0] : undefined);
            return i >= 0 && n && n.no !== sheet.no ? n.no : null;
          })()}
          grew={v.canSeat && v.grew && v.grew.tableNo === sheet.no ? grewBox : null}
          pending={pending}
          onClose={() => setSheet(null)}
          onNext={(no) => setSheet({ kind: "table", no })}
          onMove={openMove}
          onUnlock={unlock}
        />
      )}

      {sheet?.kind === "couple" && (
        <Sheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={t("hall.map.couple.title", { kind: v.event.kind, eventTitle: v.event.title })}
          footer={
            <Button variant="secondary" onClick={() => setSheet(null)}>
              {t("common.actions.close")}
            </Button>
          }
        >
          <p className="t-body">{t("hall.map.couple.body", { kind: v.event.kind })}</p>
        </Sheet>
      )}

      {sheet?.kind === "dups" && (
        <Sheet open onOpenChange={(o) => !o && (setSheet(null), setDeletePick(null))} title={t("hall.dups.title")}>
          <p className="t-body t-muted" style={{ marginTop: 0 }}>
            {t("hall.dups.intro")}
          </p>
          {v.dups.length === 0 && <p className="t-body">{t("hall.dups.none")}</p>}
          {v.dups.map((pair, pi) => (
            <div key={pair.join()} className="dup-card">
              {deletePick?.pair === pi ? (
                <fieldset className="dup-pick" style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className="t-h2" style={{ marginBottom: "0.5rem" }}>
                    {t("hall.dups.whichOne")}
                  </legend>
                  {pair.map((id) => {
                    const f = fam.get(id)!;
                    return (
                      <label key={id}>
                        <input
                          type="radio"
                          name={`dup-${pi}`}
                          checked={deletePick.id === id}
                          onChange={() => setDeletePick({ pair: pi, id })}
                        />
                        <b>{f.name}</b>
                        <span>{f.listLabel}</span>
                      </label>
                    );
                  })}
                  <div className="dup-acts">
                    <Button variant="secondary" onClick={() => setDeletePick(null)}>
                      {t("common.actions.cancel")}
                    </Button>
                    <Button
                      variant="danger-fill"
                      disabled={!deletePick.id}
                      loading={pending}
                      onClick={() => deletePick.id && deleteOne(deletePick.id)}
                    >
                      {t("common.actions.delete")}
                    </Button>
                  </div>
                </fieldset>
              ) : (
                <>
                  {pair.map((id, i) => {
                    const f = fam.get(id)!;
                    return (
                      <div key={id} className="dup-who">
                        <span className="mk" aria-hidden="true">
                          {i + 1}
                        </span>
                        <b>{f.name}</b>
                        <span>
                          {t("hall.dups.meta", { list: f.listLabel, category: cat.get(f.categoryId)?.label ?? "" })}
                        </span>
                        <span>
                          {f.tableNo
                            ? t("hall.dups.seats", { seats: f.seats, number: f.tableNo })
                            : t("common.units.seats", { count: f.seats })}
                        </span>
                      </div>
                    );
                  })}
                  <Button
                    variant="secondary"
                    icon="eye"
                    onClick={() => {
                      setSheet(null);
                      afterSheetClosed(() => {
                        setHallParams({ view: "map" });
                        setDupFocus(pi);
                        document.querySelector("[data-testid=hall-stage]")?.scrollIntoView({ block: "start" });
                      });
                    }}
                  >
                    {t("hall.dups.showOnMap")}
                  </Button>
                  {v.canSeat && (
                    <div className="dup-acts">
                      <Button variant="secondary" size="row" onClick={() => setDeletePick({ pair: pi, id: null })}>
                        {t("hall.dups.deleteOne")}
                      </Button>
                      <Button variant="secondary" size="row" loading={pending} onClick={() => keepBoth(pair)}>
                        {t("hall.dups.keepBoth")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </Sheet>
      )}

      {sheet?.kind === "unplaced" && (
        <Sheet
          open
          onOpenChange={(o) => !o && setSheet(null)}
          title={t("hall.unplaced.title")}
          footer={
            v.canSeat ? (
              <>
                <Button variant="primary" loading={pending} onClick={seatFree}>
                  {t("hall.unplaced.seatFree")}
                </Button>
                <ButtonLink
                  href={`${base}/hall/setup?tables=${Math.min(60, hall.tables + Math.max(1, tablesNeeded))}`}
                  variant="secondary"
                  icon="plus"
                >
                  {t("hall.unplaced.addTable")}
                </ButtonLink>
              </>
            ) : undefined
          }
        >
          <p className="t-body t-muted" style={{ marginTop: 0 }}>
            {t("hall.map.banners.unplaced", { people: unplacedSeats, tables: tablesNeeded })}
          </p>
          <ul className="unpl">
            {v.stats.unplaced.map((id) => {
              const f = fam.get(id)!;
              return (
                <li key={id}>
                  <b>{f.name}</b>
                  <span>
                    {cat.get(f.categoryId)?.label} · {t("common.units.seats", { count: f.seats })}
                  </span>
                  {v.canSeat && (
                    <Button variant="secondary" size="row" icon="move" onClick={() => openMove(id)}>
                      {t("hall.unplaced.move")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </Sheet>
      )}

      {dupFocus !== null && v.dups[dupFocus] && (
        <div className="dup-panel" role="status">
          <ol>
            {v.dups[dupFocus].map((id, i) => {
              const f = fam.get(id)!;
              return (
                <li key={id}>
                  {i + 1}. {f.tableNo ? t("hall.dups.panelItem", { name: f.name, number: f.tableNo }) : f.name}
                </li>
              );
            })}
          </ol>
          <Button variant="secondary" size="row" onClick={() => setDupFocus(null)}>
            {t("common.actions.close")}
          </Button>
        </div>
      )}

      <MoveConfirm
        confirm={confirm}
        fam={fam}
        stat={stat}
        pending={pending}
        onClose={() => setConfirm(null)}
        onMove={doMove}
      />
    </div>
  );
}

/* ---------------- first show in the session ---------------- */

const seenAtLoad = new Map<string, boolean>();
const noop = () => () => {};

/**
 * True while the problem is shown for the first time in this browser session (sessionStorage), false on later
 * visits. The answer is fixed per page load, so the banner does not disappear while the person looks at it.
 * Server render: true (first show).
 */
function useFirstShow(key: string, active: boolean): boolean {
  return useSyncExternalStore(
    noop,
    () => {
      if (!active) return true;
      if (!seenAtLoad.has(key)) {
        let seen = false;
        try {
          seen = Boolean(sessionStorage.getItem(key));
          sessionStorage.setItem(key, "1");
        } catch {
          /* storage off: keep the banner */
        }
        seenAtLoad.set(key, seen);
      }
      return !seenAtLoad.get(key);
    },
    () => true,
  );
}

/* ---------------- H3 ---------------- */

function TableSheet({
  s,
  fams,
  catLabel,
  catCode,
  famMeta,
  canSeat,
  next,
  grew,
  pending,
  onClose,
  onNext,
  onMove,
  onUnlock,
}: {
  s: TableStat;
  fams: HallFamily[];
  catLabel: (id: string | null) => string;
  catCode: (id: string | null) => string | null;
  famMeta: (f: HallFamily) => string;
  canSeat: boolean;
  next: number | null;
  grew: ReactNode;
  pending: boolean;
  onClose: () => void;
  onNext: (no: number) => void;
  onMove: (familyId: string) => void;
  onUnlock: (f: HallFamily) => void;
}) {
  const t = useTranslations("hall.table");
  const over = s.missing > 0;
  const category = catLabel(s.mainCategoryId);
  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("title", { number: s.no })}
      footer={
        next ? (
          <Button variant="secondary" onClick={() => onNext(next)}>
            {t("next", { number: next })}
            <Icon name="up" className="rot-90" />
          </Button>
        ) : undefined
      }
    >
      <div className="tsheet" data-testid="table-sheet">
        {over ? (
          <div className="over-box" role="status">
            <Icon name="alert" />
            <b>{t("overflowTitle", { missing: s.missing })}</b>
            <p>{t("overflowBody", { people: s.used, capacity: s.capacity })}</p>
          </div>
        ) : s.used > 0 ? (
          <div className="ok-line">
            <Icon name="check" size="sm" />
            {t("ok", { taken: s.used, capacity: s.capacity, free: s.free })}
          </div>
        ) : (
          <p className="t-body" style={{ margin: 0 }}>
            {t("empty", { capacity: s.capacity })}
          </p>
        )}
        {grew}
        <TableGraphicLarge
          no={s.no}
          capacity={s.capacity}
          familySeats={fams.map((f) => f.seats)}
          catCode={catCode(s.mainCategoryId)}
          label={t("graphicUnit")}
        />
        {s.used > 0 && (
          <div className={cn("stat", over && "over")}>
            {t("stat", { taken: s.used, capacity: s.capacity, category })}
          </div>
        )}
        {fams.length > 0 && (
          <>
            <p className="whosits">{t("whoSits")}</p>
            <div className="fams-box">
              {fams.map((f, i) => (
                <FamilyRow
                  key={f.id}
                  index={i + 1}
                  name={f.name}
                  meta={famMeta(f)}
                  lockedText={f.locked ? t("locked", { label: f.lockedByLabel ?? "" }) : undefined}
                  actions={
                    canSeat && (
                      <>
                        <Button variant="secondary" size="row" width="auto" icon="move" onClick={() => onMove(f.id)}>
                          {t("move")}
                        </Button>
                        {f.locked && (
                          <Button variant="text" size="row" width="auto" disabled={pending} onClick={() => onUnlock(f)}>
                            {t("unlock")}
                          </Button>
                        )}
                      </>
                    )
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ---------------- H4 confirmation ---------------- */

function MoveConfirm({
  confirm,
  fam,
  stat,
  pending,
  onClose,
  onMove,
}: {
  confirm: Confirm;
  fam: Map<string, HallFamily>;
  stat: Map<number, TableStat>;
  pending: boolean;
  onClose: () => void;
  onMove: (c: NonNullable<Confirm>, force: boolean) => void;
}) {
  const t = useTranslations();
  const f = confirm ? fam.get(confirm.familyId) : undefined;
  const s = confirm ? stat.get(confirm.to) : undefined;
  const open = Boolean(confirm && f && s);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={t("hall.move.confirm.title")}
      footer={
        confirm && confirm.short > 0 ? (
          <>
            <Button variant="secondary" autoFocus onClick={onClose}>
              {t("common.actions.no")}
            </Button>
            <Button variant="danger-fill" loading={pending} onClick={() => onMove(confirm, true)}>
              {t("hall.move.confirm.force")}
            </Button>
          </>
        ) : (
          <>
            <Button variant="primary" loading={pending} onClick={() => confirm && onMove(confirm, false)}>
              {t("hall.move.confirm.yes")}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t("common.actions.no")}
            </Button>
          </>
        )
      }
    >
      {confirm && f && s && (
        <div className="confirm-body" data-testid="move-confirm">
          <p className="t-body-lg">{t("hall.move.confirm.family", { name: f.name, seats: f.seats })}</p>
          <p className="route">
            {f.tableNo
              ? t("hall.move.confirm.route", { from: f.tableNo, to: confirm.to })
              : t("hall.move.confirm.routeNew", { to: confirm.to })}
          </p>
          {confirm.short > 0 ? (
            <p className="badline">
              <Icon name="alert" size="sm" />
              {t("hall.move.confirm.short", { to: confirm.to, missing: confirm.short })}
            </p>
          ) : (
            <p className="okline">{t("hall.move.confirm.free", { to: confirm.to, free: s.free })}</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
