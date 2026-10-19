import { collator } from "../guests/status";
import { type HallStats, type SeatingState, tableStats, totals, type Totals } from "../seating";

/**
 * Seating plan for print and Excel (Ф10 brief §2–3, after the founder's sample): by tables, by categories, by name,
 * without a seat. Pure TS: every number comes from the engine (`tableStats`, `totals`); names and labels are data.
 * Families that answered «Келмейміз» (0 seats) are not printed.
 */

export type PrintFamilyInput = {
  id: string;
  name: string;
  categoryId: string;
  rsvp: "yes" | "no" | "pending";
  /** Seats for seating (`seatsOf`): confirmed for «yes», expected otherwise, 0 for «no». */
  seats: number;
  /** «Анасының тізімі» */
  listLabel: string;
};

export type PrintCategoryInput = { id: string; label: string; code: string; rank: number };

export type PrintFamily = {
  id: string;
  name: string;
  seats: number;
  /** No answer yet: «~» and the note `print.pendingMark`. */
  pending: boolean;
  categoryId: string;
  categoryLabel: string;
  listLabel: string;
  tableNo: number | null;
};

export type PrintTable = {
  no: number;
  level: number;
  column: number;
  used: number;
  capacity: number;
  missing: number;
  mainCategoryId: string | null;
  /** Families of different categories at one table («Аралас үстел»). */
  mixed: boolean;
  families: PrintFamily[];
};

export type PrintPlan = {
  columns: 2 | 4;
  levels: number;
  tables: PrintTable[];
  byCategory: {
    categoryId: string;
    label: string;
    code: string;
    families: number;
    seats: number;
    /** «1–3, 5» */
    tables: string;
    list: PrintFamily[];
  }[];
  alpha: PrintFamily[];
  unplaced: PrintFamily[];
  totals: Totals;
  stats: HallStats;
};

/** «1, 2, 3, 5, 7, 8» → «1–3, 5, 7–8» (design_spec 4.15). */
export function tableRanges(nums: readonly number[]): string {
  const xs = [...new Set(nums)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < xs.length;) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1] === xs[j]! + 1) j++;
    out.push(j > i ? `${xs[i]}–${xs[j]}` : `${xs[i]}`);
    i = j + 1;
  }
  return out.join(", ");
}

export function buildPrintPlan(input: {
  state: SeatingState;
  families: readonly PrintFamilyInput[];
  categories: readonly PrintCategoryInput[];
  locale: "kk" | "ru";
}): PrintPlan | null {
  const { state } = input;
  if (!state.hall) return null;
  const stats = tableStats(state);
  const cat = new Map(input.categories.map((c) => [c.id, c]));
  const seatOf = new Map(state.families.map((f) => [f.id, f.tableNo]));
  const existing = new Set(stats.tables.map((t) => t.no));
  const fam = new Map<string, PrintFamily>();
  for (const f of input.families) {
    if (f.seats <= 0) continue;
    const t = seatOf.get(f.id) ?? null;
    fam.set(f.id, {
      id: f.id,
      name: f.name,
      seats: f.seats,
      pending: f.rsvp === "pending",
      categoryId: f.categoryId,
      categoryLabel: cat.get(f.categoryId)?.label ?? "",
      listLabel: f.listLabel,
      tableNo: t !== null && existing.has(t) ? t : null,
    });
  }
  const tables: PrintTable[] = stats.tables.map((t) => {
    const families = t.familyIds.map((id) => fam.get(id)).filter((f): f is PrintFamily => Boolean(f));
    return {
      no: t.no,
      level: t.level,
      column: t.column,
      used: t.used,
      capacity: t.capacity,
      missing: t.missing,
      mainCategoryId: t.mainCategoryId,
      mixed: new Set(families.map((f) => f.categoryId)).size > 1,
      families,
    };
  });
  const coll = collator(input.locale);
  const byName = (a: PrintFamily, b: PrintFamily) => coll.compare(a.name, b.name);
  const all = [...fam.values()];
  const byCategory = [...input.categories]
    .sort((a, b) => a.rank - b.rank)
    .map((c) => {
      const list = all
        .filter((f) => f.categoryId === c.id)
        .sort((a, b) => (a.tableNo ?? 1e9) - (b.tableNo ?? 1e9) || byName(a, b));
      return {
        categoryId: c.id,
        label: c.label,
        code: c.code,
        families: list.length,
        seats: list.reduce((s, f) => s + f.seats, 0),
        tables: tableRanges(list.flatMap((f) => (f.tableNo === null ? [] : [f.tableNo]))),
        list,
      };
    })
    .filter((c) => c.families > 0);
  return {
    columns: state.hall.columns,
    levels: stats.levels,
    tables,
    byCategory,
    alpha: [...all].sort(byName),
    unplaced: stats.unplaced
      .map((id) => fam.get(id))
      .filter((f): f is PrintFamily => Boolean(f))
      .sort(byName),
    totals: totals(state),
    stats,
  };
}

/** Latin file name from the event title: «Айбек пен Дана» + 2026-11-15 → «toi-aibek-dana-2026-11-15.xlsx». */
const LATIN: Record<string, string> = {
  а: "a",
  ә: "a",
  б: "b",
  в: "v",
  г: "g",
  ғ: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "i",
  к: "k",
  қ: "q",
  л: "l",
  м: "m",
  н: "n",
  ң: "n",
  о: "o",
  ө: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ұ: "u",
  ү: "u",
  ф: "f",
  х: "kh",
  һ: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "",
  ы: "y",
  і: "i",
  ь: "",
  э: "e",
  ю: "iu",
  я: "ia",
};

export function exportFileName(title: string, startsOn: string): string {
  const words = title
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => !["пен", "мен", "бен", "и", "&"].includes(w))
    .join(" ");
  const slug = [...words]
    .map((ch) => LATIN[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `toi-${slug || "event"}-${startsOn}.xlsx`;
}
