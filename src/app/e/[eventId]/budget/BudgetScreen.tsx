"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { EXPENSE_CATEGORIES, type ExpenseCategory, formatMoney, parseAmount } from "@/domain/budget";
import {
  createExpenseAction,
  deleteExpenseAction,
  restoreExpenseAction,
  setBudgetTotalAction,
  setPricePerSeatAction,
  updateExpenseAction,
} from "@/server/actions/budget";
import type { BudgetView, ExpenseView } from "@/server/budget/service";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { AlertDialog, Dialog, Sheet } from "@/ui/components/Sheet";
import { showToast } from "@/ui/components/Toast";
import { cn } from "@/ui/lib/cn";

type SheetState = { kind: "add" } | { kind: "edit"; id: string } | { kind: "total" } | null;

/**
 * «Шығындар» (Ф9, DESIGN 8.20, mockup 13): budget with one paid/left bar, categories as horizontal bars, upcoming
 * payments (overdue in red), the list of items; item sheet (add / edit / restaurant / delete with «Қайтару»).
 * All numbers come from `budgetView` (domain `budgetSummary`); amounts with no-break spaces.
 */
/** Dates formatted on the server (Node has Kazakh locale data, browsers often do not): `YYYY-MM-DD` → texts. */
export type BudgetDates = Record<string, { day: string; mon: string; short: string; long: string }>;

export function BudgetScreen({ v, dates }: { v: BudgetView; dates: BudgetDates }) {
  const t = useTranslations("budget");
  const tc = useTranslations("common.actions");
  const te = useTranslations("errors");
  const router = useRouter();
  const [sheet, setSheet] = useState<SheetState>(null);
  const money = (n: number) => formatMoney(n);
  const s = v.summary;
  const restaurantItem = v.items.find((i) => i.linked);
  const day = (d: string) => dates[d]?.short ?? d;
  const byId = new Map(v.items.map((i) => [i.id, i]));
  const formula =
    v.pricePerSeat === null
      ? t("restaurant.priceMissing")
      : t("restaurant.formula", {
          seats: v.confirmedSeats,
          price: money(v.pricePerSeat),
          total: money(v.restaurant.planned ?? 0),
        });

  const top = (
    <section className="bud-top" aria-labelledby="bud-total">
      <div className="row">
        <h2 id="bud-total" className="total">
          {v.total !== null ? t("total", { amount: money(v.total) }) : t("totalLabel")}
        </h2>
        <Button variant="text" onClick={() => setSheet({ kind: "total" })}>
          {t("totalEdit")}
        </Button>
      </div>
      {v.total === null ? (
        <p className="bud-empty-total">{t("totalNotSet")}</p>
      ) : (
        <>
          <div
            className={cn("bigbar", s.over > 0 && "over")}
            role="img"
            aria-label={t("bar", { paid: money(s.paid), left: money(Math.max(0, s.left ?? 0)) })}
          >
            <i style={{ width: `${v.total > 0 ? Math.min(100, (s.paid / v.total) * 100) : 0}%` }} />
          </div>
          <div className="bud-legend" aria-hidden="true">
            {t("bar", { paid: money(s.paid), left: money(Math.max(0, s.left ?? 0)) })
              .split(" · ")
              .map((part, i) => (
                <span key={part}>
                  <i className={i === 0 ? "p" : "l"} />
                  {part}
                </span>
              ))}
          </div>
          {s.over > 0 && (
            <p className="bud-over" role="status">
              <Icon name="alert" size="sm" />
              {t("overBudget", { amount: money(s.over) })}
            </p>
          )}
        </>
      )}
    </section>
  );

  const categories = s.categories.length > 0 && (
    <section aria-labelledby="bud-cats">
      <h2 id="bud-cats" className="sec-title">
        {t("categories.title")}
      </h2>
      <div className="cat-bars">
        {s.categories.map((c) => (
          <div key={c.category} className="cbar">
            <div className="h">
              <b>
                {t(`categories.${c.category}`)}
                {c.category === "restaurant" && restaurantItem && <AutoBadge label={t("restaurant.auto")} />}
              </b>
              <span>{t("categories.row", { planned: money(c.planned), paid: money(c.paid) })}</span>
            </div>
            <div className="track" aria-hidden="true">
              <i className="pl" style={{ width: `${Math.max(c.share, c.paidShare) * 100}%` }} />
              <i className="pd" style={{ width: `${c.paidShare * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const upcoming = s.upcoming.length > 0 && (
    <section aria-labelledby="bud-pay">
      <h2 id="bud-pay" className="sec-title">
        {t("upcoming.title")}
      </h2>
      <ul className="pay-list">
        {s.upcoming.map((u) => {
          const it = byId.get(u.id)!;
          return (
            <li key={u.id} className="pay">
              <span className={cn("d", u.overdue && "overdue")} aria-hidden="true">
                {dates[u.dueDate]?.day}
                <small>{dates[u.dueDate]?.mon}</small>
              </span>
              <span>
                <b>{it.title}</b>
                {u.overdue ? (
                  <span className="od">
                    <Icon name="alert" size="xs" />
                    {t("upcoming.overdue")}
                  </span>
                ) : (
                  <span>{t(`categories.${it.category}`)}</span>
                )}
                <span className="sr-only">{dates[u.dueDate]?.long}</span>
              </span>
              <span className="amt">{t("upcoming.left", { amount: money(u.left) })}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const items = (
    <section aria-labelledby="bud-items">
      <h2 id="bud-items" className="sec-title">
        {t("title")}
      </h2>
      {v.items.length === 0 ? (
        <EmptyState
          title={t("empty")}
          action={
            <Button variant="secondary" width="auto" icon="plus" onClick={() => setSheet({ kind: "add" })}>
              {t("add")}
            </Button>
          }
        />
      ) : (
        <ul className="items">
          {v.items.map((it) => (
            <li key={it.id}>
              <button type="button" className="item" onClick={() => setSheet({ kind: "edit", id: it.id })}>
                <b>
                  {it.title}
                  {it.linked && <AutoBadge label={t("restaurant.auto")} />}
                </b>
                <span className="m">
                  {t(`categories.${it.category}`)}
                  {it.dueDate ? ` · ${day(it.dueDate)}` : ""}
                </span>
                {it.linked && <span className="m">{formula}</span>}
                <span className="m">{t("categories.row", { planned: money(it.planned), paid: money(it.paid) })}</span>
                {it.changedBy && (
                  <span className="by">
                    {t("item.changedBy", { member: it.changedBy, date: day(it.changedAt.slice(0, 10)) })}
                  </span>
                )}
                <span className="a">{money(it.planned)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const edit = sheet?.kind === "edit" ? byId.get(sheet.id) : undefined;

  return (
    <div className="budget" data-testid="budget">
      <div className="bud-head desk-only">
        <h1 className="t-h1">{t("title")}</h1>
        <Button variant="primary" width="auto" icon="plus" onClick={() => setSheet({ kind: "add" })}>
          {t("add")}
        </Button>
      </div>
      <div className="bud-grid">
        <div>
          {top}
          {categories}
        </div>
        <div>
          {upcoming}
          {items}
        </div>
      </div>
      <div className="sticky-cta">
        <Button variant="primary" icon="plus" onClick={() => setSheet({ kind: "add" })}>
          {t("add")}
        </Button>
      </div>

      {sheet?.kind === "total" && <TotalDialog v={v} onClose={() => setSheet(null)} onDone={() => router.refresh()} />}
      {(sheet?.kind === "add" || edit) && (
        <ItemSheet
          v={v}
          item={edit}
          formula={formula}
          onClose={() => setSheet(null)}
          onConflict={() => {
            showToast({ message: te("conflict") });
            setSheet(null);
            router.refresh();
          }}
          onDeleted={(snapshot, title) => {
            setSheet(null);
            showToast({
              message: t("item.deletedToast", { title }),
              undoLabel: tc("undo"),
              onUndo: async () => {
                await restoreExpenseAction(snapshot);
                router.refresh();
              },
            });
          }}
        />
      )}
    </div>
  );
}

function AutoBadge({ label }: { label: string }) {
  return (
    <span className="autobadge">
      <Icon name="refresh" size="sm" />
      {label}
    </span>
  );
}

/** Amount field: digits with spaces, «₸» on the right. */
function AmountField({
  label,
  value,
  onChange,
  error,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  id: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <div className={cn("input", error && "error")}>
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="suffix" aria-hidden="true">
          ₸
        </span>
      </div>
      {error && (
        <p id={`${id}-err`} className="field-error" role="alert">
          <Icon name="alert" size="sm" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

const asText = (n: number | null | undefined) => (n ? String(n) : n === 0 ? "0" : "");

function TotalDialog({ v, onClose, onDone }: { v: BudgetView; onClose: () => void; onDone: () => void }) {
  const t = useTranslations("budget");
  const te = useTranslations("errors");
  const [value, setValue] = useState(asText(v.total));
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      const n = value.trim() === "" ? null : parseAmount(value);
      if (value.trim() !== "" && n === null) return setError(t("item.errors.amount"));
      const r = await setBudgetTotalAction({ eventId: v.eventId, total: n });
      if ("error" in r) return setError(te(r.error === "forbidden" ? "forbidden" : "unknown"));
      if (!r.ok) return setError(t("item.errors.amount"));
      onClose();
      onDone();
    });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("totalLabel")}
      footer={
        <Button variant="primary" loading={pending} onClick={save}>
          {t("item.save")}
        </Button>
      }
    >
      <AmountField id="bud-total-input" label={t("totalLabel")} value={value} onChange={setValue} error={error} />
    </Dialog>
  );
}

function ItemSheet({
  v,
  item,
  formula,
  onClose,
  onConflict,
  onDeleted,
}: {
  v: BudgetView;
  item?: ExpenseView;
  formula: string;
  onClose: () => void;
  onConflict: () => void;
  onDeleted: (snapshot: Parameters<typeof restoreExpenseAction>[0], title: string) => void;
}) {
  const t = useTranslations("budget");
  const te = useTranslations("errors");
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const [category, setCategory] = useState<ExpenseCategory>(item?.category ?? "other");
  const [planned, setPlanned] = useState(asText(item?.planned));
  const [paid, setPaid] = useState(asText(item?.paid));
  const [due, setDue] = useState(item?.dueDate ?? "");
  const [note, setNote] = useState(item?.note ?? "");
  const [price, setPrice] = useState(asText(v.pricePerSeat));
  const [errors, setErrors] = useState<Partial<Record<"title" | "planned" | "paid" | "price" | "form", string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  // the restaurant item: plan from the seats (existing linked item, or a new restaurant item while there is none)
  const linked = item ? item.linked : category === "restaurant" && !v.restaurant.itemId;

  const save = () =>
    start(async () => {
      const e: typeof errors = {};
      if (!title.trim()) e.title = t("item.errors.titleRequired");
      else if (title.trim().length > 80) e.title = te("field.tooLong", { max: 80 });
      const p = linked ? 0 : parseAmount(planned);
      const pd = parseAmount(paid);
      const pr = linked ? (price.trim() === "" ? null : parseAmount(price)) : null;
      if (p === null) e.planned = t("item.errors.amount");
      if (pd === null) e.paid = t("item.errors.amount");
      if (linked && price.trim() !== "" && pr === null) e.price = t("item.errors.amount");
      setErrors(e);
      if (Object.keys(e).length) return;
      if (linked && pr !== v.pricePerSeat) {
        const r = await setPricePerSeatAction({ eventId: v.eventId, price: pr });
        if ("error" in r) return setErrors({ form: te("forbidden") });
      }
      const fields = {
        title,
        category: linked ? ("restaurant" as const) : category,
        planned: p!,
        paid: pd!,
        dueDate: due || null,
        note: note.trim() || null,
      };
      const r = item
        ? await updateExpenseAction({ eventId: v.eventId, id: item.id, version: item.version, ...fields })
        : await createExpenseAction({ eventId: v.eventId, linked, ...fields });
      if ("error" in r) return setErrors({ form: te(r.error === "forbidden" ? "forbidden" : "unknown") });
      if (r.ok) {
        onClose();
        router.refresh();
        return;
      }
      if ("conflict" in r) return onConflict();
      setErrors({ form: r.field === "titleTooLong" ? te("field.tooLong", { max: 80 }) : t("item.errors.amount") });
    });

  const remove = () =>
    start(async () => {
      if (!item) return;
      const r = await deleteExpenseAction({ eventId: v.eventId, id: item.id });
      if ("error" in r) return setErrors({ form: te("forbidden") });
      router.refresh();
      onDeleted(r.snapshot, item.title);
    });

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={item ? item.title : t("add")}
      footer={
        <>
          <Button variant="primary" loading={pending} onClick={save}>
            {t("item.save")}
          </Button>
          {item && (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              {t("item.delete")}
            </Button>
          )}
        </>
      }
    >
      <div className="bud-form" data-testid="expense-sheet">
        {errors.form && (
          <p className="field-error" role="alert">
            <Icon name="alert" size="sm" />
            <span>{errors.form}</span>
          </p>
        )}
        {linked && (
          <span>
            <AutoBadge label={t("restaurant.auto")} />
          </span>
        )}
        <div>
          <label htmlFor="exp-title" className="field-label">
            {t("item.fields.title")}
          </label>
          <div className={cn("input", errors.title && "error")}>
            <input
              id="exp-title"
              value={title}
              maxLength={120}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? "exp-title-err" : undefined}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {errors.title && (
            <p id="exp-title-err" className="field-error" role="alert">
              <Icon name="alert" size="sm" />
              <span>{errors.title}</span>
            </p>
          )}
        </div>
        {!item?.linked && (
          <div>
            <span className="field-label" id="exp-cat">
              {t("item.fields.category")}
            </span>
            <RadioGroup.Root
              value={category}
              onValueChange={(c) => setCategory(c as ExpenseCategory)}
              className="cats bud-cats"
              aria-labelledby="exp-cat"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <RadioGroup.Item key={c} value={c} className="cat">
                  <RadioGroup.Indicator>
                    <Icon name="check" size="sm" />
                  </RadioGroup.Indicator>
                  {t(`categories.${c}`)}
                </RadioGroup.Item>
              ))}
            </RadioGroup.Root>
          </div>
        )}
        {linked ? (
          <>
            <AmountField
              id="exp-price"
              label={t("restaurant.priceLabel")}
              value={price}
              onChange={setPrice}
              error={errors.price}
            />
            <div className="formula" role="status">
              <div className="f">
                {(() => {
                  const pr = price.trim() === "" ? null : parseAmount(price);
                  return pr === null
                    ? t("restaurant.priceMissing")
                    : t("restaurant.formula", {
                        seats: v.confirmedSeats,
                        price: formatMoney(pr),
                        total: formatMoney(pr * v.confirmedSeats),
                      });
                })()}
              </div>
              <p>{t("restaurant.hint")}</p>
            </div>
          </>
        ) : (
          <AmountField
            id="exp-planned"
            label={t("item.fields.planned")}
            value={planned}
            onChange={setPlanned}
            error={errors.planned}
          />
        )}
        <div className="field-row2">
          <AmountField
            id="exp-paid"
            label={t("item.fields.paid")}
            value={paid}
            onChange={setPaid}
            error={errors.paid}
          />
          <div>
            <label htmlFor="exp-due" className="field-label">
              {t("item.fields.due")}
            </label>
            <div className="input">
              <input id="exp-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
        </div>
        <div>
          <label htmlFor="exp-note" className="field-label">
            {t("item.fields.note")}
          </label>
          <textarea
            id="exp-note"
            className="textarea"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        {item?.linked && <p className="sr-only">{formula}</p>}
      </div>
      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={item?.title ?? ""}
        description={t("item.deleteConfirm")}
        confirmLabel={t("item.delete")}
        onConfirm={remove}
      />
    </Sheet>
  );
}
