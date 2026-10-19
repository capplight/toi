import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { dupPairs, pairKey } from "@/domain/guests/duplicates";
import {
  type HallConfig,
  type HallStats,
  type SeatingState,
  seatsOf,
  suggestTable,
  tableStats,
  totals,
  type Totals,
} from "@/domain/seating";
import type { Locale } from "@/i18n/config";
import { authorize, type Principal } from "../auth/access";
import type { Db, DbOrTx } from "../db";
import { listKind } from "../guests/queries";
import { messagesByLocale } from "@/i18n/messages";
import { categories, duplicateReviews, eventMembers, events, families, seatingChanges } from "../schema";
import { loadSeatingRows, loadSeatingState } from "./adapter";
import { cachedAttention, storeAttention } from "./attention-cache";
import { type UndoKind, undoKind } from "./hall";

/**
 * «Зал» read model (brief Ф7b §2 «Данные экрана»): one assembly per screen — engine `tableStats` / `totals`,
 * families of the tables, categories with seats and table ranges, duplicates (`dupPairs` minus
 * `duplicate_reviews`), unplaced families and the latest history. Every number comes from the domain.
 */

export type HallFamily = {
  id: string;
  name: string;
  categoryId: string;
  rsvp: "yes" | "no" | "pending";
  /** Seats for seating (`seatsOf`): confirmed for «yes», expected otherwise, 0 for «no». */
  seats: number;
  tableNo: number | null;
  locked: boolean;
  /** «Қолмен қойылған (Анасы)» */
  lockedByLabel: string | null;
  /** Optimistic lock of the family (`moveFamily` → 409). */
  version: number;
  /** «Анасының тізімі» (H6 meta). */
  listLabel: string;
};

export type HallCategory = {
  id: string;
  code: string;
  label: string;
  rank: number;
  seats: number;
  /** «1–3», «7, 10–11» (design_spec 4.15), empty when nobody of the category is seated. */
  tables: string;
};

export type HistoryEntry = {
  id: number;
  at: string;
  actorKind: string;
  actorLabel: string | null;
  actorMemberId: string | null;
  action: string;
  summary: Record<string, unknown>;
  undo: UndoKind;
  /** Struck-through record («Қайтарылды · время · кто»). */
  reverted: { at: string; actorLabel: string | null } | null;
  seatingVersionAfter: number;
};

export type HallView = {
  event: { id: string; title: string; kind: string; tz: string };
  meMemberId: string;
  canSeat: boolean;
  seatingVersion: number;
  hall: HallConfig | null;
  /** For client previews (H1 «how many families move», H4 candidates) — the same engine as the server. */
  state: SeatingState;
  stats: HallStats;
  totals: Totals;
  families: HallFamily[];
  categories: HallCategory[];
  /** Unreviewed pairs of possible duplicates. */
  dups: [string, string][];
  /** Р3: a family whose seat count grew at a table that now overflows, with a free table for it. */
  grew: { familyId: string; tableNo: number; missing: number; suggested: number | null } | null;
  history: { count: number; recent: HistoryEntry[] };
};

/** «1, 2, 3, 5, 7, 8» → «1–3, 5, 7–8» */
export function tableRanges(nums: number[]): string {
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

async function memberLabels(db: DbOrTx, eventId: string) {
  const rows = await db
    .select({ id: eventMembers.id, label: eventMembers.label, memberKind: eventMembers.memberKind })
    .from(eventMembers)
    .where(eq(eventMembers.eventId, eventId));
  return rows;
}

async function historyEntries(db: DbOrTx, eventId: string, me: string, limit: number): Promise<HistoryEntry[]> {
  const members = new Map((await memberLabels(db, eventId)).map((m) => [m.id, m.label]));
  const rows = await db
    .select()
    .from(seatingChanges)
    .where(eq(seatingChanges.eventId, eventId))
    .orderBy(desc(seatingChanges.createdAt), desc(seatingChanges.id))
    .limit(limit);
  // records that revert the listed ones (they may be older than the limit only in theory: undo is newer)
  const byId = new Map(rows.map((r) => [r.id, r]));
  const missing = rows.map((r) => r.revertedBy).filter((x): x is number => x !== null && !byId.has(x));
  for (const id of missing) {
    const [r] = await db.select().from(seatingChanges).where(eq(seatingChanges.id, id));
    if (r) byId.set(r.id, r);
  }
  return rows.map((r) => {
    const rev = r.revertedBy !== null ? byId.get(r.revertedBy) : undefined;
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      actorKind: r.actorKind,
      actorLabel: r.actorMemberId ? (members.get(r.actorMemberId) ?? null) : null,
      actorMemberId: r.actorMemberId,
      action: r.action,
      summary: (r.summary ?? {}) as Record<string, unknown>,
      undo: r.revertedBy !== null ? "none" : undoKind(r, me),
      reverted: rev
        ? {
            at: rev.createdAt.toISOString(),
            actorLabel: rev.actorMemberId ? (members.get(rev.actorMemberId) ?? null) : null,
          }
        : null,
      seatingVersionAfter: r.seatingVersionAfter,
    };
  });
}

export async function hallView(
  db: Db,
  who: Principal,
  eventId: string,
  opts: { locale: Locale; historyLimit?: number },
): Promise<HallView> {
  const m = await authorize(db, who, eventId, "member");
  const [ev] = await db.select().from(events).where(eq(events.id, eventId));
  if (!ev) throw new Error("event not found");
  // Sequential on purpose: ~7 small indexed reads (a few ms on Postgres); in parallel they open several pool
  // connections, which the local PGlite socket server (dev/e2e) drops under load.
  const state = await loadSeatingState(db, eventId);
  const rows = await db
    .select()
    .from(families)
    .where(and(eq(families.eventId, eventId), isNull(families.deletedAt)))
    .orderBy(asc(families.seatSeq));
  const cats = await db
    .select()
    .from(categories)
    .where(eq(categories.eventId, eventId))
    .orderBy(asc(categories.seatingRank));
  const members = await memberLabels(db, eventId);
  const reviews = await db
    .select({ a: duplicateReviews.familyA, b: duplicateReviews.familyB })
    .from(duplicateReviews)
    .where(eq(duplicateReviews.eventId, eventId));
  const history = await historyEntries(db, eventId, m.memberId, opts.historyLimit ?? 20);
  const countRows = (await db
    .select({ n: count() })
    .from(seatingChanges)
    .where(eq(seatingChanges.eventId, eventId))) as {
    n: number;
  }[];
  const stats = tableStats(state);
  const engine = new Map(state.families.map((f) => [f.id, f]));
  const label = new Map(members.map((x) => [x.id, x.label]));
  const roles = messagesByLocale[opts.locale].roles;
  const listLabel = new Map(
    members.map((x) => {
      const kind = listKind(x);
      return [x.id, kind === "custom" ? roles.listOf.custom.replace("{label}", x.label) : roles.listOf[kind]];
    }),
  );

  const hallFamilies: HallFamily[] = rows.map((r) => {
    const f = engine.get(r.id)!;
    return {
      id: r.id,
      name: r.name,
      categoryId: r.categoryId,
      rsvp: r.rsvp,
      seats: seatsOf(f),
      tableNo: r.tableNo,
      locked: r.seatLocked,
      lockedByLabel: r.lockedByMemberId ? (label.get(r.lockedByMemberId) ?? null) : null,
      version: r.version,
      listLabel: listLabel.get(r.addedByMemberId) ?? "",
    };
  });

  const seatsPerCat = new Map<string, number>();
  const tablesPerCat = new Map<string, number[]>();
  const existing = new Set(stats.tables.map((t) => t.no));
  for (const f of hallFamilies) {
    if (f.seats === 0) continue;
    seatsPerCat.set(f.categoryId, (seatsPerCat.get(f.categoryId) ?? 0) + f.seats);
    if (f.tableNo !== null && existing.has(f.tableNo))
      tablesPerCat.set(f.categoryId, [...(tablesPerCat.get(f.categoryId) ?? []), f.tableNo]);
  }
  const hallCategories: HallCategory[] = cats.map((c) => ({
    id: c.id,
    code: c.code ?? "baska",
    label: opts.locale === "ru" ? (c.labelRu ?? c.labelKk) : c.labelKk,
    rank: c.seatingRank,
    seats: seatsPerCat.get(c.id) ?? 0,
    tables: tableRanges(tablesPerCat.get(c.id) ?? []),
  }));

  const reviewed = new Set(reviews.map((r) => pairKey(r.a, r.b)));
  const dups = dupPairs(
    rows.map((r) => ({ id: r.id, name: r.name, rsvp: r.rsvp, tableNo: r.tableNo })),
    reviewed,
  ).map(([a, b]) => [a.id, b.id] as [string, string]);

  // Р3: automation never overflows a table, so an unlocked family at an overflowing table grew in place.
  // Prefer the one with the latest history record.
  let grew: HallView["grew"] = null;
  const over = new Map(stats.overfull.map((t) => [t.no, t]));
  const candidates = hallFamilies.filter((f) => !f.locked && f.tableNo !== null && over.has(f.tableNo));
  if (candidates.length) {
    const recentIdx = (id: string) => {
      const i = history.findIndex((h) => (h.summary as { familyId?: string }).familyId === id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    const f = [...candidates].sort((a, b) => recentIdx(a.id) - recentIdx(b.id))[0]!;
    const t = over.get(f.tableNo!)!;
    grew = { familyId: f.id, tableNo: t.no, missing: t.missing, suggested: suggestTable(state, f.id) };
  }

  return {
    event: { id: ev.id, title: ev.title, kind: ev.kind, tz: ev.tz },
    meMemberId: m.memberId,
    canSeat: m.role === "owner" || m.canEditSeating,
    seatingVersion: ev.seatingVersion,
    hall: state.hall,
    state,
    stats,
    totals: totals(state),
    families: hallFamilies,
    categories: hallCategories,
    dups,
    grew,
    history: { count: Number(countRows[0]?.n ?? 0), recent: history },
  };
}

/** H7 «Өзгерістер тарихы»: the latest records (newest first) with undo rules and reverted marks. */
export async function historyView(db: Db, who: Principal, eventId: string, opts: { limit?: number } = {}) {
  const m = await authorize(db, who, eventId, "member");
  const [ev] = await db.select({ v: events.seatingVersion }).from(events).where(eq(events.id, eventId));
  const cats = await db
    .select({ id: categories.id, labelKk: categories.labelKk, labelRu: categories.labelRu })
    .from(categories)
    .where(eq(categories.eventId, eventId));
  return {
    meMemberId: m.memberId,
    canSeat: m.role === "owner" || m.canEditSeating,
    seatingVersion: ev?.v ?? 0,
    categories: cats,
    entries: await historyEntries(db, eventId, m.memberId, opts.limit ?? 200),
  };
}

/**
 * Red dot at the «Зал» tab (Ф1 `hallAttention`): overflow, unplaced or unreviewed duplicates.
 * Ф7b review П1: rendered in a streamed `<Suspense>` slot (never blocks a screen); families are read once; the answer
 * is cached in memory per `(eventId, seating_version)` — it changes only with the version, except «Екеуі де қалсын»
 * (`duplicate_reviews`), which calls `invalidateHallAttention`.
 */
export async function hallAttention(db: Db, eventId: string): Promise<boolean> {
  const [ev] = await db.select({ v: events.seatingVersion }).from(events).where(eq(events.id, eventId));
  if (!ev) return false;
  const hit = cachedAttention(eventId, ev.v);
  if (hit !== undefined) return hit;
  const { state, rows, seatingVersion } = await loadSeatingRows(db, eventId);
  let value = false;
  if (state.hall) {
    const stats = tableStats(state);
    if (stats.overfull.length || stats.unplaced.length) value = true;
    else {
      const reviews = await db
        .select({ a: duplicateReviews.familyA, b: duplicateReviews.familyB })
        .from(duplicateReviews)
        .where(eq(duplicateReviews.eventId, eventId));
      value = dupPairs(rows, new Set(reviews.map((r) => pairKey(r.a, r.b)))).length > 0;
    }
  }
  storeAttention(eventId, seatingVersion, value);
  return value;
}
