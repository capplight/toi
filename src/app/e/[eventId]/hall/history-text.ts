import type { HistoryEntry } from "@/server/seating/view";

/**
 * Text of a history record (H7, design_spec 4.17, `hall.history.*`). Summaries come in the shapes written by
 * Ф4–Ф7b (and the seed): move `{names, from, to, reason?}`, answer `{names, by, from: {rsvp, confirmed}, to}` or
 * seat edit `{names, from, to, reason: "seats"}`, seed answer `{names, fromN, toN, warnTable, warnN}`, order
 * `{categoryId, from, to}` / `{category, reason: "categoryAdded"}`, hall `{columns, tables, seatsPerTable}`,
 * full re-seat `{count}`, undo `{reason: "undo", of: {action, summary}}`.
 */
type T = (key: string, values?: Record<string, string | number>) => string;

type Summary = Record<string, unknown> & {
  names?: string[];
  reason?: string;
  from?: unknown;
  to?: unknown;
  by?: string;
};

export type EntryText = { main: string; sub?: string; warn: { tableNo: number; missing: number }[]; guest: boolean };

const dash = "—";

function answerText(t: T, s: Summary, name: string): string {
  const to = s.to as { rsvp?: string; confirmed?: number | null } | undefined;
  const from = s.from as { rsvp?: string; confirmed?: number | null } | undefined;
  if (!to) return name;
  if (s.by === "member") {
    return to.rsvp === "yes"
      ? t("hall.history.answerByPhoneYes", { name, seats: to.confirmed ?? 0 })
      : t("hall.history.answerByPhoneNo", { name });
  }
  if (to.rsvp === "no") return t("hall.history.answerNo", { name });
  if (from?.rsvp === "yes" && from.confirmed != null)
    return t("hall.history.answerSeats", { name, from: from.confirmed, to: to.confirmed ?? 0 });
  return t("hall.history.guestYes", { name, seats: to.confirmed ?? 0 });
}

export function entryText(
  t: T,
  e: Pick<HistoryEntry, "action" | "summary" | "actorKind">,
  categoryLabel: (id: string) => string,
): EntryText {
  const s = e.summary as Summary;
  const names = (s.names ?? []).join(", ");
  const warn: EntryText["warn"] = [];
  if (Array.isArray(s.warn)) warn.push(...(s.warn as EntryText["warn"]));
  if (typeof s.warnTable === "number" && typeof s.warnN === "number")
    warn.push({ tableNo: s.warnTable, missing: s.warnN });
  const out = (main: string, sub?: string): EntryText => ({ main, sub, warn, guest: e.actorKind === "guest" });
  const num = (v: unknown) => (typeof v === "number" ? v : dash);

  switch (e.action) {
    case "move":
      return s.reason === "suggested"
        ? out(t("hall.history.suggestedMove", { name: names, from: num(s.from), to: num(s.to) }))
        : out(t("hall.history.move", { name: names, from: num(s.from), to: num(s.to) }));
    case "unlock":
      return out(t("hall.history.unlocked"), names);
    case "reorder":
      if (s.reason === "categoryAdded")
        return out(t("hall.history.categoryAdded", { category: String(s.category ?? "") }));
      return out(
        t("hall.history.order", {
          category: categoryLabel(String(s.categoryId ?? "")),
          from: num(s.from),
          to: num(s.to),
        }),
      );
    case "hall":
      return out(
        t("hall.history.hall", {
          tables: num(s.tables),
          seats: num(s.seatsPerTable),
          columns: num(s.columns),
        }),
      );
    case "full_reseat":
      return out(t("hall.history.fullReseat", { count: num(s.count) }));
    case "auto_place":
      if (s.reason === "seatUnplaced") return out(t("hall.history.seatUnplaced", { count: Number(s.count ?? 0) }));
      return typeof s.to === "number"
        ? out(t("hall.history.guestAdded", { name: names, number: s.to }))
        : out(t("hall.history.guestAddedUnplaced", { name: names }));
    case "unseat":
      return out(t("hall.history.guestDeleted", { name: names }));
    case "answer":
      if (s.reason === "seats")
        return out(t("hall.history.seatsEdited", { name: names, from: num(s.from), to: num(s.to) }));
      if (typeof s.fromN === "number" && typeof s.toN === "number")
        return out(t("hall.history.answerSeats", { name: names, from: s.fromN, to: s.toN }));
      return out(answerText(t, s, names));
    case "undo": {
      if (s.reason === "restored") return out(t("hall.history.guestRestored", { name: names }));
      if (s.reason === "answerReverted") {
        // the answer that was taken back (its `to` = this record's `from`)
        const back = answerText(t, { ...s, by: "member", to: s.from, from: undefined }, names);
        return out(t("hall.history.revertEntry", { summary: back }));
      }
      const of = s.of as { action: string; summary: Record<string, unknown> } | undefined;
      const inner = of
        ? entryText(t, { action: of.action, summary: of.summary, actorKind: "member" }, categoryLabel).main
        : "";
      return out(t("hall.history.revertEntry", { summary: inner }));
    }
    default:
      return out(names);
  }
}

/** «Бүгін» / «Кеше» / «12 қазан» in the event's time zone. */
export function dayKey(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(iso),
  );
}
