"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import { Button } from "@/ui/components/Button";
import { CategoryTiles, Field, LanguageSwitch, PhoneInput, Search, Segment, Stepper } from "@/ui/components/Controls";
import {
  Banner,
  Chips,
  CounterTile,
  EmptyState,
  EventHero,
  FamilyRow,
  GroupHead,
  GuestCard,
  LinkRow,
  LinkRows,
  ProgressBar,
  Skeleton,
  StatusBadge,
  StatusChip,
  SummaryLine,
  TableAccordion,
} from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { PilotBanner } from "@/ui/components/PilotBanner";
import { AlertDialog, Dialog, Sheet } from "@/ui/components/Sheet";
import { showToast, Toaster } from "@/ui/components/Toast";
import { HallLegend, HallMap, TableGraphic, TableGraphicLarge } from "@/ui/hall/HallMap";
import { categoryCodes, categoryLabels, demoBigHall, demoHall, familyName, sampleEvent } from "./demo";

/* Dev-only page: section headings are technical component names (not product UI). */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} style={{ marginTop: 40 }} aria-labelledby={`h-${id}`}>
      <h2 id={`h-${id}`} className="t-h2" style={{ marginBottom: 12, fontFamily: "monospace" }}>
        {title}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>{children}</div>
    </section>
  );
}

const SWATCHES = [
  "ivory",
  "paper",
  "sand",
  "line",
  "line-strong",
  "ink",
  "ink-2",
  "lapis",
  "lapis-soft",
  "night",
  "gold",
  "gold-bright",
  "gold-ink",
  "gold-soft",
  "success",
  "success-soft",
  "danger",
  "danger-soft",
  "dup",
  "dup-soft",
  "seat-taken",
  "cat-kuda",
  "cat-oz",
  "cat-nagashy",
  "cat-dos",
  "cat-ariptes",
  "cat-korshi",
  "cat-synyp",
  "cat-baska",
];

export function Showcase({
  locale,
  setLocaleAction,
}: {
  locale: "kk" | "ru";
  setLocaleAction: (fd: FormData) => Promise<void>;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [, start] = useTransition();
  const [reduced, setReduced] = useState(false);
  const [segment, setSegment] = useState<"map" | "list">("map");
  const [cat, setCat] = useState("oz");
  const [seats, setSeats] = useState(4);
  const [phone, setPhone] = useState("701 234 56 78");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string | null>("inv");
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [alert, setAlert] = useState(false);
  const [selected, setSelected] = useState<number | null>(7);

  const hall = useMemo(() => demoHall(), []);
  const big = useMemo(() => demoBigHall(), []);
  const kind = sampleEvent.kind;
  const t7 = hall.stats.tables[6]!;
  const t7families = t7.familyIds.map((id) => hall.state.families.find((f) => f.id === id)!);
  const seatsOf = (f: (typeof t7families)[number]) => (f.rsvp === "yes" ? (f.confirmed ?? 0) : f.expected);
  const pair = hall.pairs[0];
  const dupMarks = pair
    ? {
        [pair[0].tableNo!]: { dup: { marker: 1, seats: 2 } },
        [pair[1].tableNo!]: { dup: { marker: 2, seats: 2 } },
      }
    : {};
  const moveMarks = Object.fromEntries(
    hall.stats.tables.map((tb) => [
      tb.no,
      { move: tb.no === 4 ? ("current" as const) : tb.free >= 3 ? ("candidate" as const) : ("unfit" as const) },
    ]),
  );

  const toggleReduced = () => {
    const next = !reduced;
    setReduced(next);
    document.documentElement.classList.toggle("reduce-motion", next);
  };

  return (
    <main className="content" style={{ maxWidth: 1100, paddingBottom: 160 }}>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}
      >
        <h1 className="t-h1" style={{ fontFamily: "monospace" }}>
          /dev/ui
        </h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <LanguageSwitch
            value={locale}
            onChange={(v) =>
              start(async () => {
                const fd = new FormData();
                fd.set("locale", v);
                await setLocaleAction(fd);
                router.refresh();
              })
            }
          />
          <label style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 48, fontFamily: "monospace" }}>
            <input type="checkbox" checked={reduced} onChange={toggleReduced} style={{ width: 24, height: 24 }} />
            reduced motion
          </label>
        </div>
      </div>

      <Section id="tokens" title="Tokens (DESIGN_v2 3.1–3.2)">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
          {SWATCHES.map((s) => (
            <div key={s} className="card" style={{ padding: 8 }}>
              <div
                style={{ height: 40, borderRadius: 8, background: `var(--${s})`, border: "1px solid var(--line)" }}
              />
              <code style={{ fontSize: 16 }}>--{s}</code>
            </div>
          ))}
        </div>
        <p className="t-display">{sampleEvent.title}</p>
        <p className="t-h1">{t("meta.pages.guests")}</p>
        <p className="t-h2">{t("hall.table.whoSits")}</p>
        <p className="t-stat num">173 / 192</p>
        <p>{t("auth.join.body")}</p>
        <p className="t-body t-muted">{t("auth.login.phoneHint")}</p>
      </Section>

      <Section id="button" title="Button">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          <Button icon="user-plus">{t("guests.list.empty.title")}</Button>
          <Button variant="wa" icon="wa">
            {t("guests.card.sendWhatsApp")}
          </Button>
          <Button variant="secondary" icon="move">
            {t("hall.table.move")}
          </Button>
          <Button variant="wa-outline" icon="bell">
            {t("guests.card.remind")}
          </Button>
          <Button variant="danger" icon="trash">
            {t("common.actions.delete")}
          </Button>
          <Button variant="danger-fill">{t("common.actions.delete")}</Button>
          <Button variant="text">{t("common.actions.showAll")}</Button>
          <Button disabled>{t("common.actions.save")}</Button>
          <Button loading>{t("common.actions.save")}</Button>
          <Button variant="secondary" size="row">
            {t("guests.card.pendingYes")}
          </Button>
          <div>
            <Button variant="icon" icon="x" aria-label={t("common.actions.close")} />
          </div>
        </div>
      </Section>

      <Section id="toggles" title="LanguageSwitch · Segment">
        <LanguageSwitch value={locale} onChange={() => {}} />
        <div style={{ background: "var(--night)", padding: 12, borderRadius: 14, width: "fit-content" }}>
          <LanguageSwitch value={locale} onChange={() => {}} onDark />
        </div>
        <Segment
          value={segment}
          onChange={setSegment}
          label={t("hall.map.view.label")}
          options={[
            { value: "map", label: t("hall.map.view.map"), icon: "grid" },
            { value: "list", label: t("hall.map.view.list"), icon: "list" },
          ]}
        />
        <Segment
          compact
          value={segment}
          onChange={setSegment}
          label={t("hall.map.view.label")}
          options={[
            { value: "map", label: t("hall.map.view.map"), icon: "grid" },
            { value: "list", label: t("hall.map.view.list"), icon: "list" },
          ]}
        />
      </Section>

      <Section id="inputs" title="CategoryTiles · Stepper · Input · PhoneInput · Search">
        <CategoryTiles
          value={cat}
          onChange={setCat}
          label={t("guestForm.category.label")}
          options={sampleEvent.categories.map((c) => ({ id: c.id, code: c.id, label: t(`category.names.${c.id}`) }))}
          addLabel={t("guestForm.category.addCustom")}
          onAdd={() => {}}
        />
        <Stepper
          value={seats}
          onChange={setSeats}
          label={t("guestForm.seats.label")}
          unit={t("guestForm.seats.unit", { count: seats })}
          limitHint={t("guestForm.seats.max", { max: 20 })}
          decreaseLabel={t("guestForm.seats.decrease")}
          increaseLabel={t("guestForm.seats.increase")}
        />
        <Field label={t("guestForm.name.label")} placeholder={t("guestForm.name.placeholder")} />
        <Field label={t("guestForm.name.label")} defaultValue="" error={t("guestForm.name.required")} />
        <PhoneInput
          label={t("auth.login.phoneLabel")}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          hint={t("auth.login.phoneHint")}
        />
        <PhoneInput
          label={t("auth.login.phoneLabel")}
          defaultValue="701 12"
          error={t("auth.login.errors.phoneIncomplete")}
        />
        <Search
          label={t("guests.list.search.label")}
          placeholder={t("guests.list.search.placeholder")}
          value={q}
          onChange={setQ}
        />
        {q && <p className="t-body t-muted">{t("guests.list.search.empty", { query: q })}</p>}
      </Section>

      <Section id="guests" title="GuestCard · StatusBadge · CounterTile · GroupHead">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <StatusBadge status="notSent" />
          <StatusBadge status="noAnswer" />
          <StatusBadge status="yes" seats={4} />
          <StatusBadge status="no" />
        </div>
        <div className="counters">
          <CounterTile
            kind="yes"
            text={t("guests.list.counters.yes", { count: 78 })}
            pressed={filter === "yes"}
            onToggle={() => setFilter(filter === "yes" ? null : "yes")}
          />
          <CounterTile
            kind="inv"
            text={t("guests.list.counters.noAnswer", { count: 4 })}
            pressed={filter === "inv"}
            onToggle={() => setFilter(filter === "inv" ? null : "inv")}
          />
          <CounterTile
            kind="no"
            text={t("guests.list.counters.no", { count: 1 })}
            pressed={filter === "no"}
            onToggle={() => setFilter(filter === "no" ? null : "no")}
          />
        </div>
        <GroupHead code="kuda" title={t("category.names.kuda")} count="7 · 28" />
        <div>
          <GuestCard
            name="Тимур құда отбасы"
            status="noAnswer"
            seats={4}
            tableNo={3}
            hasPhone
            sentAgo={t("common.time.sentDaysAgo", { days: 3 })}
            onRemind={() => {}}
            onOpen={() => setSheet(true)}
          />
          <GuestCard
            name="Болат ағай отбасы"
            status="notSent"
            seats={4}
            tableNo={5}
            onSend={() => {}}
            onOpen={() => {}}
          />
          <GuestCard
            name="Ермек отбасы"
            status="notSent"
            seats={3}
            tableNo={6}
            pendingConfirm
            onConfirmSent={() => {}}
            onOpen={() => {}}
          />
          <GuestCard name="Әділбек құда отбасы" status="yes" seats={4} tableNo={3} hasPhone onOpen={() => {}} />
          <GuestCard name="Гүлмира" status="no" seats={1} tableNo={null} onOpen={() => {}} />
          <GuestCard
            name="Сапарбаевтар (бас құда) — өте ұзын отбасы атауы екі жолға сыймауы мүмкін"
            status="yes"
            seats={6}
            tableNo={2}
            flash
            onOpen={() => {}}
          />
        </div>
      </Section>

      <Section id="banners" title="Banner · StatusChip · PilotBanner">
        <Banner
          kind="remind"
          title={t("guests.list.remindBanner.title", { count: 4 })}
          text={t("guests.list.remindBanner.action")}
          onClick={() => {}}
        />
        <Banner
          kind="error"
          title={t("hall.map.banners.overflowTitle", { count: 2 })}
          text={t("hall.map.banners.overflowItem", { number: 7, missing: 2 })}
          onClick={() => {}}
        />
        <Banner
          kind="dup"
          title={t("hall.map.banners.dupsTitle", { count: 1 })}
          text={t("hall.map.banners.dupsAction")}
          onClick={() => {}}
        />
        <Banner kind="unplaced" title={t("hall.map.banners.unplaced", { people: 8, tables: 1 })} onClick={() => {}} />
        <Banner kind="view" title={t("hall.map.banners.viewOnly")} />
        <Chips>
          <StatusChip
            kind="error"
            label={t("hall.map.chips.overflow", { count: 2 })}
            a11yLabel={t("hall.map.chips.overflowA11y", { count: 2 })}
          />
          <StatusChip
            kind="dup"
            label={t("hall.map.chips.dups", { count: 2 })}
            a11yLabel={t("hall.map.chips.dupsA11y", { count: 2 })}
          />
          <StatusChip
            kind="unplaced"
            label={t("hall.map.chips.unplaced", { count: 8 })}
            a11yLabel={t("hall.map.chips.unplacedA11y", { count: 8 })}
          />
          <StatusChip kind="view" label={t("hall.map.banners.viewOnly")} a11yLabel={t("hall.map.banners.viewOnly")} />
        </Chips>
        <PilotBanner isOwner />
      </Section>

      <Section id="summary" title="SummaryLine · EventHero · LinkRow · Accordion · ProgressBar · Skeleton · EmptyState">
        <SummaryLine
          line={t("hall.map.summary.line", { used: 173, capacity: 192, free: 19 })}
          restaurant={t("hall.map.summary.restaurantShort", { people: 173, tables: 15 })}
        >
          <div className="big num">173 / 192</div>
          <div className="sub">{t("hall.map.summary.full", { tables: 16, yes: 150, pending: 23, free: 19 })}</div>
          <div className="resto">{t("hall.map.summary.restaurant", { people: 173, tables: 15 })}</div>
        </SummaryLine>
        <EventHero compact title={sampleEvent.title} dateLine="15 қараша, 18:00" venue={sampleEvent.venue} />
        <EventHero
          title={sampleEvent.title}
          kindLabel={t("events.kind.select", { kind })}
          dateLine="15 қараша, 18:00"
          venue={sampleEvent.venue}
        />
        <LinkRows title={t("guests.list.otherLists.title")}>
          <LinkRow href="#" icon="users" title={t("roles.listOf.mother")} subtitle="21 · ~58" />
          <LinkRow
            href="#"
            icon="order"
            title={t("hall.map.links.order")}
            subtitle={t("hall.map.links.orderSub", { categories: "Құдалар, Өз туыстар" })}
          />
          <LinkRow href="#" icon="history" title={t("hall.map.links.history", { count: 6 })} count={6} />
        </LinkRows>
        <TableAccordion
          items={hall.stats.tables.slice(5, 8).map((tb) => ({
            id: String(tb.no),
            title: t("hall.table.title", { number: tb.no }),
            meta:
              tb.missing > 0
                ? t("hall.map.listHeaderOverflow", { taken: tb.used, capacity: tb.capacity, missing: tb.missing })
                : t("hall.map.listHeader", { taken: tb.used, capacity: tb.capacity, free: tb.free }),
            over: tb.missing > 0,
            content: (
              <ul className="t-body" style={{ margin: 0, paddingLeft: 18 }}>
                {tb.familyIds.map((id) => (
                  <li key={id}>{familyName(id)}</li>
                ))}
              </ul>
            ),
          }))}
        />
        <ProgressBar
          value={150}
          max={173}
          label={t("summary.tiles.yes", { families: 53, seats: 150 })}
          tone="success"
        />
        <ProgressBar value={14} max={12} label="7" tone="over" />
        <Skeleton />
        <EmptyState title={t("guests.list.empty.title")} body={t("hall.map.empty.body")} />
      </Section>

      <Section id="overlays" title="Sheet · Dialog · AlertDialog · Toast · EventMenu">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Sheet · {t("hall.table.title", { number: 7 })}
          </Button>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Dialog · {t("hall.move.confirm.title")}
          </Button>
          <Button variant="danger" onClick={() => setAlert(true)}>
            AlertDialog · {t("common.actions.delete")}
          </Button>
          <Button
            variant="secondary"
            onClick={() =>
              showToast({
                message: t("hall.move.toast", { number: 16, name: "Сапарбаевтар (бас құда) отбасы" }),
                undoLabel: t("common.actions.undo"),
                onUndo: () => {},
              })
            }
          >
            Toast
          </Button>
        </div>
        <Sheet
          open={sheet}
          onOpenChange={setSheet}
          title={t("hall.table.title", { number: t7.no })}
          footer={
            <Button variant="secondary" icon="up">
              {t("hall.table.next", { number: 12 })}
            </Button>
          }
        >
          {t7.missing > 0 && (
            <Banner
              kind="error"
              title={t("hall.table.overflowTitle", { missing: t7.missing })}
              text={t("hall.table.overflowBody", { people: t7.used, capacity: t7.capacity })}
            />
          )}
          <TableGraphicLarge
            no={t7.no}
            capacity={t7.capacity}
            familySeats={t7families.map(seatsOf)}
            catCode={t7.mainCategoryId}
            label={t("hall.table.graphicUnit")}
          />
          <p className="t-body t-muted" style={{ textAlign: "center" }}>
            {t("hall.table.stat", {
              taken: t7.used,
              capacity: t7.capacity,
              category: categoryLabels[t7.mainCategoryId!]!,
            })}
          </p>
          <h3 className="t-h2" style={{ margin: "16px 0 4px" }}>
            {t("hall.table.whoSits")}
          </h3>
          {t7families.map((f, i) => (
            <FamilyRow
              key={f.id}
              index={i + 1}
              name={familyName(f.id)}
              meta={t("hall.table.familyMeta", { category: categoryLabels[f.categoryId]!, seats: seatsOf(f) })}
              lockedText={f.locked ? t("hall.table.locked", { label: t("roles.mother") }) : undefined}
              actions={
                <>
                  <Button variant="secondary" size="row" width="auto" icon="move">
                    {t("hall.table.move")}
                  </Button>
                  {f.locked && (
                    <Button variant="text" width="auto">
                      {t("hall.table.unlock")}
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </Sheet>
        <Dialog
          open={dialog}
          onOpenChange={setDialog}
          title={t("hall.move.confirm.title")}
          footer={
            <>
              <Button onClick={() => setDialog(false)}>{t("hall.move.confirm.yes")}</Button>
              <Button variant="secondary" onClick={() => setDialog(false)}>
                {t("common.actions.cancel")}
              </Button>
            </>
          }
        >
          <p className="t-body">{t("hall.move.confirm.family", { name: "Ерлан ағай отбасы", seats: 4 })}</p>
          <p className="t-body t-muted">{t("hall.move.confirm.route", { from: 10, to: 16 })}</p>
        </Dialog>
        <AlertDialog
          open={alert}
          onOpenChange={setAlert}
          title={t("guestSheet.delete.title")}
          description={t("guestSheet.delete.confirm", { name: "Гүлмира" })}
          confirmLabel={t("guestSheet.delete.yes")}
          cancelLabel={t("guestSheet.delete.no")}
          onConfirm={() => {}}
        />
      </Section>

      <Section id="tables" title="TableGraphic (82×86 · 164×140 · 200×200) — states DESIGN_v2 3.3">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          <TableGraphic size="cell" no={1} used={10} capacity={12} catCode="kuda" />
          <TableGraphic size="cell" no={16} used={0} capacity={12} catCode={null} />
          <TableGraphic size="cell" no={7} used={14} capacity={12} catCode="nagashy" />
          <TableGraphic
            size="cell"
            no={12}
            used={11}
            capacity={12}
            catCode="korshi"
            mark={{ dup: { marker: 1, seats: 2 } }}
          />
          <TableGraphic size="cell" no={5} used={6} capacity={12} catCode="oz" mark={{ move: "candidate" }} />
          <TableGraphic size="cell" no={4} used={12} capacity={12} catCode="oz" mark={{ move: "current" }} />
          <TableGraphic size="cell" no={9} used={16} capacity={16} catCode="dos" />
          <TableGraphic
            size="cell2"
            no={10}
            used={12}
            capacity={12}
            catCode="nagashy"
            catLabel={categoryLabels.nagashy}
          />
          <TableGraphic
            size="cell2"
            no={7}
            used={14}
            capacity={12}
            catCode="nagashy"
            catLabel={categoryLabels.nagashy}
          />
        </div>
        <TableGraphicLarge
          no={13}
          capacity={12}
          familySeats={[3, 2, 2, 1, 1, 1, 1, 1]}
          catCode="synyp"
          label={t("hall.table.graphicUnit")}
        />
      </Section>

      <Section id="hallmap" title="HallMap — seed (16 × 12), selected · duplicates · move · 20 × 16 · 2 columns">
        <div className="stage">
          <HallMap
            stats={hall.stats}
            columns={4}
            categoryCodes={categoryCodes}
            eventKind={kind}
            eventTitle={sampleEvent.title}
            selected={selected}
            onSelectTable={setSelected}
          />
          <HallLegend />
        </div>
        <div className="stage">
          <HallMap
            stats={hall.stats}
            columns={4}
            categoryCodes={categoryCodes}
            eventKind={kind}
            eventTitle={sampleEvent.title}
            marks={dupMarks}
            dimUnmarked
          />
        </div>
        <div className="stage">
          <HallMap
            stats={hall.stats}
            columns={4}
            categoryCodes={categoryCodes}
            eventKind={kind}
            eventTitle={sampleEvent.title}
            marks={moveMarks}
          />
        </div>
        <div className="stage">
          <HallMap
            stats={big.stats}
            columns={4}
            categoryCodes={categoryCodes}
            eventKind="merey"
            eventTitle="Мерейтой"
          />
        </div>
        <div className="stage">
          <HallMap
            stats={demoHall({ columns: 2, tables: 6 }).stats}
            columns={2}
            categoryCodes={categoryCodes}
            categoryLabels={categoryLabels}
            eventKind={kind}
            eventTitle={sampleEvent.title}
          />
        </div>
      </Section>

      <Section id="ornament" title="Ornament · Icon">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", color: "var(--lapis)" }}>
          {(["users", "grid", "chart", "wallet", "alert", "lock", "undo", "wa", "sms", "login"] as const).map((n) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Icon name={n} />
              <code style={{ fontSize: 16 }}>{n}</code>
            </span>
          ))}
        </div>
      </Section>
      <Toaster />
    </main>
  );
}
