import { and, asc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { normalizePhone } from "@/domain/guests/phone";
import { similar } from "@/domain/guests/duplicates";
import {
  addFamily as engineAdd,
  removeFamily,
  restoreFamily as engineRestore,
  setRsvp,
  setSeats,
} from "@/domain/seating";
import { MAX_FAMILY_SEATS } from "@/domain/seating/family";
import { authorize, ForbiddenError, type Principal } from "../auth/access";
import { randomToken } from "../crypto";
import type { Db } from "../db";
import { activityLog, categories, duplicateReviews, eventMembers, families, seatingChanges } from "../schema";
import { type Actor, rowToFamily, withSeating } from "../seating/adapter";

/**
 * Guest actions (plan 6.3, brief Ф4 2.2). Every function: authz → validation → adapter / transaction.
 * Expected outcomes (conflicts, validation) are returned as values; unexpected ones throw.
 */

export class VersionConflict extends Error {
  readonly status = 409;
  constructor() {
    super("version conflict");
    this.name = "VersionConflict";
  }
}

export type FamilyRow = typeof families.$inferSelect;
export type FieldError = "nameRequired" | "nameTooLong" | "phoneIncomplete" | "seatsRange" | "categoryUnknown";

export type DuplicateCandidate = {
  id: string;
  name: string;
  memberId: string;
  memberLabel: string;
  categoryId: string;
  rsvp: FamilyRow["rsvp"];
  seats: number;
  tableNo: number | null;
  sentAt: string | null;
};

const NAME_MAX = 80;

type FamilyInput = { name: string; phone?: string | null; categoryId: string; seats: number };

function validate(
  input: FamilyInput,
): { ok: true; name: string; phone: string | null } | { ok: false; field: FieldError } {
  const name = input.name.trim();
  if (!name) return { ok: false, field: "nameRequired" };
  if (name.length > NAME_MAX) return { ok: false, field: "nameTooLong" };
  const raw = input.phone?.trim() ?? "";
  const phone = raw ? normalizePhone(raw) : null;
  if (raw && !phone) return { ok: false, field: "phoneIncomplete" };
  if (!Number.isInteger(input.seats) || input.seats < 1 || input.seats > MAX_FAMILY_SEATS)
    return { ok: false, field: "seatsRange" };
  return { ok: true, name, phone };
}

async function candidateView(db: Db, rows: FamilyRow[]): Promise<DuplicateCandidate[]> {
  if (!rows.length) return [];
  const members = await db
    .select({ id: eventMembers.id, label: eventMembers.label })
    .from(eventMembers)
    .where(eq(eventMembers.eventId, rows[0]!.eventId));
  const label = new Map(members.map((m) => [m.id, m.label]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    memberId: r.addedByMemberId,
    memberLabel: label.get(r.addedByMemberId) ?? "",
    categoryId: r.categoryId,
    rsvp: r.rsvp,
    seats: r.rsvp === "yes" ? (r.confirmedCount ?? 0) : r.expectedCount,
    tableNo: r.tableNo,
    sentAt: r.sentAt?.toISOString() ?? null,
  }));
}

async function categoryInEvent(db: Db, eventId: string, categoryId: string): Promise<boolean> {
  const [c] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.eventId, eventId)));
  return Boolean(c);
}

/** The family's event (for authz of family-level actions). 403 for unknown ids (no existence oracle). */
export async function familyEvent(db: Db, familyId: string): Promise<FamilyRow> {
  if (!/^[0-9a-f-]{36}$/i.test(familyId)) throw new ForbiddenError();
  const [row] = await db.select().from(families).where(eq(families.id, familyId));
  if (!row) throw new ForbiddenError();
  return row;
}

const isUniqueViolation = (e: unknown) =>
  typeof e === "object" && e !== null && ("code" in e ? (e as { code?: string }).code === "23505" : false);

/* ------------------------------------------------------------------ addFamily */

export type AddFamilyResult =
  | { ok: true; family: FamilyRow; tableNo: number | null; seatingVersion: number }
  | { ok: false; field: FieldError }
  | { ok: false; conflict: "phone"; existing: DuplicateCandidate }
  | { ok: false; conflict: "similar"; candidates: DuplicateCandidate[]; more: number };

export async function addFamily(
  db: Db,
  who: Principal,
  input: FamilyInput & { eventId: string; confirmNotDuplicateOf?: string[] },
): Promise<AddFamilyResult> {
  const m = await authorize(db, who, input.eventId, "member");
  const v = validate(input);
  if (!v.ok) return v;
  if (!(await categoryInEvent(db, input.eventId, input.categoryId))) return { ok: false, field: "categoryUnknown" };

  const active = await db
    .select()
    .from(families)
    .where(and(eq(families.eventId, input.eventId), isNull(families.deletedAt)));
  if (v.phone) {
    const same = active.find((f) => f.phone === v.phone);
    if (same) return { ok: false, conflict: "phone", existing: (await candidateView(db, [same]))[0]! };
  }
  const confirmed = new Set(input.confirmNotDuplicateOf ?? []);
  const similarRows = active.filter((f) => f.rsvp !== "no" && similar(v.name, f.name));
  const unconfirmed = similarRows.filter((f) => !confirmed.has(f.id));
  if (unconfirmed.length) {
    return {
      ok: false,
      conflict: "similar",
      candidates: await candidateView(db, unconfirmed.slice(0, 3)),
      more: Math.max(0, unconfirmed.length - 3),
    };
  }

  const actor: Actor = { kind: "member", memberId: m.memberId };
  try {
    const out = await withSeating(db, input.eventId, actor, async ({ tx, state }) => {
      const [{ next }] = (await tx
        .select({ next: sql<number>`coalesce(max(${families.seatSeq}), -1) + 1` })
        .from(families)
        .where(eq(families.eventId, input.eventId))) as [{ next: number }];
      const [row] = await tx
        .insert(families)
        .values({
          eventId: input.eventId,
          addedByMemberId: m.memberId,
          name: v.name,
          phone: v.phone,
          categoryId: input.categoryId,
          expectedCount: input.seats,
          token: randomToken(),
          seatSeq: Number(next),
        })
        .returning();
      for (const otherId of confirmed) {
        if (!similarRows.some((f) => f.id === otherId)) continue;
        const [a, b] = row!.id < otherId ? [row!.id, otherId] : [otherId, row!.id];
        await tx
          .insert(duplicateReviews)
          .values({ eventId: input.eventId, familyA: a, familyB: b, decidedBy: m.memberId })
          .onConflictDoNothing();
      }
      const result = engineAdd(state, rowToFamily(row!));
      const placed = result.state.families.find((f) => f.id === row!.id);
      return {
        result,
        action: "auto_place",
        summary: { names: [v.name], to: placed?.tableNo ?? null, reason: "added" },
        value: row!,
      };
    });
    const tableNo = out.changes.find((d) => d.familyId === out.value.id)?.to ?? null;
    return { ok: true, family: { ...out.value, tableNo }, tableNo, seatingVersion: out.seatingVersion };
  } catch (e) {
    // Race with another add of the same phone: the partial unique index decides (plan 5).
    if (isUniqueViolation(e) && v.phone) {
      const [same] = await db
        .select()
        .from(families)
        .where(and(eq(families.eventId, input.eventId), eq(families.phone, v.phone), isNull(families.deletedAt)));
      if (same) return { ok: false, conflict: "phone", existing: (await candidateView(db, [same]))[0]! };
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ updateFamily */

export type UpdateFamilyResult =
  | { ok: true; family: FamilyRow; seatingVersion: number; warnings: unknown[] }
  | { ok: false; field: FieldError }
  | { ok: false; conflict: "phone"; existing: DuplicateCandidate }
  | { ok: false; conflict: "version" };

/**
 * Edit name / phone / category / seats with optimistic locking (`families.version`, 409).
 * Seats go through the engine (`setSeats`: stays in place, overflow is a warning — Р3); a category change does
 * not move a seated family.
 */
export async function updateFamily(
  db: Db,
  who: Principal,
  input: FamilyInput & { familyId: string; version: number },
): Promise<UpdateFamilyResult> {
  const current = await familyEvent(db, input.familyId);
  const m = await authorize(db, who, current.eventId, "member");
  if (current.deletedAt) throw new ForbiddenError();
  const v = validate(input);
  if (!v.ok) return v;
  if (!(await categoryInEvent(db, current.eventId, input.categoryId))) return { ok: false, field: "categoryUnknown" };
  if (v.phone) {
    const [same] = await db
      .select()
      .from(families)
      .where(
        and(
          eq(families.eventId, current.eventId),
          eq(families.phone, v.phone),
          isNull(families.deletedAt),
          ne(families.id, current.id),
        ),
      );
    if (same) return { ok: false, conflict: "phone", existing: (await candidateView(db, [same]))[0]! };
  }
  try {
    const out = await withSeating(
      db,
      current.eventId,
      { kind: "member", memberId: m.memberId },
      async ({ tx, state }) => {
        const yes = current.rsvp === "yes";
        const [row] = await tx
          .update(families)
          .set({
            name: v.name,
            phone: v.phone,
            categoryId: input.categoryId,
            ...(yes ? { confirmedCount: input.seats } : { expectedCount: input.seats }),
            version: sql`${families.version} + 1`,
            updatedAt: new Date(),
          })
          .where(and(eq(families.id, current.id), eq(families.version, input.version), isNull(families.deletedAt)))
          .returning();
        if (!row) throw new VersionConflict();
        const withCategory = {
          ...state,
          families: state.families.map((f) => (f.id === row.id ? { ...f, categoryId: row.categoryId } : f)),
        };
        const result = setSeats(withCategory, row.id, yes ? { confirmed: input.seats } : { expected: input.seats });
        const fromSeats = yes ? (current.confirmedCount ?? 0) : current.expectedCount;
        const seatsChanged = fromSeats !== input.seats;
        return {
          result,
          action: "answer",
          summary: { names: [row.name], familyId: row.id, from: fromSeats, to: input.seats, reason: "seats" },
          value: row,
          // Only the phone changed: «Зал» shows nothing new (П1). A seat count change goes to the history.
          noop: !seatsChanged && row.name === current.name && row.categoryId === current.categoryId,
          record: seatsChanged,
        };
      },
    );
    return { ok: true, family: out.value, seatingVersion: out.seatingVersion, warnings: out.warnings };
  } catch (e) {
    if (e instanceof VersionConflict) return { ok: false, conflict: "version" };
    throw e;
  }
}

/* ------------------------------------------------------------------ delete / restore */

export async function deleteFamily(db: Db, who: Principal, familyId: string, now = new Date()) {
  const current = await familyEvent(db, familyId);
  const m = await authorize(db, who, current.eventId, "member");
  if (current.deletedAt) return { ok: true as const, eventId: current.eventId, seatingVersion: null };
  const out = await withSeating(
    db,
    current.eventId,
    { kind: "member", memberId: m.memberId },
    async ({ tx, state }) => {
      await tx
        .update(families)
        .set({ deletedAt: now, version: sql`${families.version} + 1`, updatedAt: now })
        .where(eq(families.id, familyId));
      const result = removeFamily(state, familyId);
      return {
        result,
        action: "unseat",
        summary: { names: [current.name], from: current.tableNo, reason: "deleted" },
        value: null,
      };
    },
  );
  return { ok: true as const, eventId: current.eventId, seatingVersion: out.seatingVersion };
}

/** «Қайтару»: back to the previous table if those seats are still free, otherwise incremental placement. */
export async function restoreFamily(db: Db, who: Principal, familyId: string) {
  const current = await familyEvent(db, familyId);
  const m = await authorize(db, who, current.eventId, "member");
  if (!current.deletedAt) return { ok: true as const, eventId: current.eventId, tableNo: current.tableNo };
  if (current.phone) {
    const [same] = await db
      .select({ id: families.id })
      .from(families)
      .where(and(eq(families.eventId, current.eventId), eq(families.phone, current.phone), isNull(families.deletedAt)));
    if (same) return { ok: false as const, eventId: current.eventId, conflict: "phone" as const };
  }
  const out = await withSeating(
    db,
    current.eventId,
    { kind: "member", memberId: m.memberId },
    async ({ tx, state }) => {
      await tx
        .update(families)
        .set({ deletedAt: null, version: sql`${families.version} + 1`, updatedAt: new Date() })
        .where(eq(families.id, familyId));
      const result = engineRestore(state, rowToFamily(current));
      const back = result.state.families.find((f) => f.id === familyId);
      return {
        result,
        action: "undo",
        summary: { names: [current.name], to: back?.tableNo ?? null, reason: "restored" },
        value: back?.tableNo ?? null,
      };
    },
  );
  // The row kept its old table: write the engine's answer even if it is unchanged (no delta → same table).
  return { ok: true as const, eventId: current.eventId, tableNo: out.value };
}

/* ------------------------------------------------------------------ sending */

/** «Иә, жіберілді» (plan 6.3, DESIGN 8.5): `sent_at` only now (first send kept), or `reminded_at`. */
export async function markSent(
  db: Db,
  who: Principal,
  familyId: string,
  kind: "invite" | "reminder",
  now = new Date(),
) {
  const current = await familyEvent(db, familyId);
  await authorize(db, who, current.eventId, "member");
  const set =
    kind === "invite" ? { sentAt: current.sentAt ?? now } : { remindedAt: now, sentAt: current.sentAt ?? now };
  const [row] = await db
    .update(families)
    .set({ ...set, version: sql`${families.version} + 1`, updatedAt: now })
    .where(and(eq(families.id, familyId), isNull(families.deletedAt)))
    .returning();
  return { ok: Boolean(row), family: row ?? null };
}

/** Metric only (plan 2 «Аналитика»): the member pressed «WhatsApp-қа жіберу» / «Еске салу». No personal data. */
export async function waClicked(db: Db, who: Principal, familyId: string, kind: "invite" | "reminder") {
  const current = await familyEvent(db, familyId);
  await authorize(db, who, current.eventId, "member");
  await db.insert(activityLog).values({ eventId: current.eventId, familyId, kind: "wa_clicked", meta: { kind } });
}

/* ------------------------------------------------------------------ answer by phone */

export async function recordAnswerByMember(
  db: Db,
  who: Principal,
  input: { familyId: string; attending: boolean; seats?: number },
  now = new Date(),
) {
  const current = await familyEvent(db, input.familyId);
  const m = await authorize(db, who, current.eventId, "member");
  if (current.deletedAt) throw new ForbiddenError();
  const seats = input.attending ? (input.seats ?? current.expectedCount) : null;
  if (seats !== null && (!Number.isInteger(seats) || seats < 1 || seats > MAX_FAMILY_SEATS)) {
    return { ok: false as const, field: "seatsRange" as const };
  }
  const out = await withSeating(
    db,
    current.eventId,
    { kind: "member", memberId: m.memberId },
    async ({ tx, state }) => {
      const [row] = await tx
        .update(families)
        .set({
          rsvp: input.attending ? "yes" : "no",
          confirmedCount: seats,
          respondedAt: now,
          answeredBy: "member",
          answeredByMemberId: m.memberId,
          version: sql`${families.version} + 1`,
          updatedAt: now,
        })
        .where(eq(families.id, current.id))
        .returning();
      const result = setRsvp(state, current.id, input.attending ? "yes" : "no", { confirmed: seats });
      const summary: AnswerSummary = {
        names: [current.name],
        familyId: current.id,
        by: "member",
        from: {
          rsvp: current.rsvp,
          confirmed: current.confirmedCount,
          respondedAt: current.respondedAt?.toISOString() ?? null,
          answeredBy: current.answeredBy,
          answeredByMemberId: current.answeredByMemberId,
        },
        to: { rsvp: input.attending ? "yes" : "no", confirmed: seats },
      };
      return { result, action: "answer", summary, value: row!, record: true };
    },
  );
  return {
    ok: true as const,
    family: out.value,
    historyId: out.historyId!,
    seatingVersion: out.seatingVersion,
    warnings: out.warnings,
  };
}

/** History summary of an answer (H7 «3 → 4 орын»); `from` also serves «Қайтару» (Ф4 review П2). */
export type AnswerSummary = {
  names: string[];
  familyId: string;
  by: "member" | "guest";
  from: {
    rsvp: FamilyRow["rsvp"];
    confirmed: number | null;
    respondedAt: string | null;
    answeredBy: FamilyRow["answeredBy"];
    answeredByMemberId: string | null;
  };
  to: { rsvp: FamilyRow["rsvp"]; confirmed: number | null };
};

/**
 * «Қайтару» after an answer by phone (Ф4 review П2). Bound to the history record of that answer: undone only if
 * the record is this member's and the family still has exactly that answer. A guest may have answered in
 * between; then nothing changes and the caller shows a refusal.
 */
export async function revertAnswer(db: Db, who: Principal, input: { historyId: number }) {
  const [h] = await db.select().from(seatingChanges).where(eq(seatingChanges.id, input.historyId));
  if (!h) throw new ForbiddenError();
  const m = await authorize(db, who, h.eventId, "member");
  const sum = h.summary as AnswerSummary;
  if (h.action !== "answer" || h.actorMemberId !== m.memberId || !sum?.familyId || !sum.from || !sum.to) {
    throw new ForbiddenError();
  }
  const current = await familyEvent(db, sum.familyId);
  const changed = { ok: false as const, eventId: h.eventId, reason: "changed" as const };
  if (current.eventId !== h.eventId || current.deletedAt || h.revertedBy !== null) return changed;
  const still =
    current.rsvp === sum.to.rsvp &&
    (current.confirmedCount ?? null) === (sum.to.confirmed ?? null) &&
    current.answeredBy === "member" &&
    current.answeredByMemberId === m.memberId;
  if (!still) return changed;
  const f = sum.from;
  await withSeating(db, current.eventId, { kind: "member", memberId: m.memberId }, async ({ tx, state }) => {
    await tx
      .update(families)
      .set({
        rsvp: f.rsvp,
        confirmedCount: f.rsvp === "yes" ? f.confirmed : null,
        respondedAt: f.respondedAt ? new Date(f.respondedAt) : null,
        answeredBy: f.answeredBy,
        answeredByMemberId: f.answeredByMemberId,
        version: sql`${families.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(families.id, current.id));
    const result = setRsvp(state, current.id, f.rsvp, { confirmed: f.rsvp === "yes" ? f.confirmed : null });
    return {
      result,
      action: "undo",
      summary: {
        names: [current.name],
        familyId: current.id,
        from: sum.to,
        to: { rsvp: f.rsvp, confirmed: f.confirmed },
        reason: "answerReverted",
        undoOf: h.id,
      },
      value: null,
      record: true,
      // Ф7b brief §2: the original answer record is marked `reverted_by` (H7 shows it struck through)
      revertOf: h.id,
    };
  });
  return { ok: true as const, eventId: current.eventId };
}

/* ------------------------------------------------------------------ categories & duplicates */

export type CreateCategoryResult =
  { ok: true; category: typeof categories.$inferSelect } | { ok: false; field: "required" | "exists" | "tooLong" };

/** S3 «Жаңа санат»: place after `afterCategoryId` (null = at the end); ranks below shift by one (deferrable unique). */
export async function createCategory(
  db: Db,
  who: Principal,
  input: { eventId: string; labelKk: string; labelRu?: string | null; afterCategoryId: string | null },
): Promise<CreateCategoryResult> {
  const m = await authorize(db, who, input.eventId, "member");
  const labelKk = input.labelKk.trim();
  const labelRu = input.labelRu?.trim() || null;
  if (!labelKk) return { ok: false, field: "required" };
  if (labelKk.length > 40 || (labelRu?.length ?? 0) > 40) return { ok: false, field: "tooLong" };
  // Through the adapter (П1): the seating order changes under the event lock, the version grows and the
  // history gets an `order` record.
  const out = await withSeating(db, input.eventId, { kind: "member", memberId: m.memberId }, async ({ tx, state }) => {
    const cats = await tx.select().from(categories).where(eq(categories.eventId, input.eventId));
    const same = (a: string | null, b: string | null) =>
      a !== null && b !== null && a.toLocaleLowerCase("kk") === b.toLocaleLowerCase("kk");
    // Н3: duplicates by the Kazakh and the Russian name, case-insensitive
    if (cats.some((c) => same(c.labelKk, labelKk) || same(c.labelRu, labelRu) || same(c.labelRu, labelKk))) {
      return {
        result: { state, deltas: [], warnings: [] },
        action: "reorder" as const,
        summary: {},
        value: null,
        noop: true,
      };
    }
    const after = input.afterCategoryId ? cats.find((c) => c.id === input.afterCategoryId) : undefined;
    const rank = after ? after.seatingRank + 1 : Math.max(0, ...cats.map((c) => c.seatingRank)) + 1;
    await tx
      .update(categories)
      .set({ seatingRank: sql`${categories.seatingRank} + 1` })
      .where(and(eq(categories.eventId, input.eventId), gte(categories.seatingRank, rank)));
    const [category] = await tx
      .insert(categories)
      .values({ eventId: input.eventId, labelKk, labelRu, seatingRank: rank, isCustom: true, colorToken: "cat-8" })
      .returning();
    const order = await tx
      .select({ id: categories.id, rank: categories.seatingRank })
      .from(categories)
      .where(eq(categories.eventId, input.eventId))
      .orderBy(asc(categories.seatingRank));
    return {
      result: { state: { ...state, categories: order }, deltas: [], warnings: [] },
      action: "reorder" as const,
      summary: { category: labelKk, after: after?.labelKk ?? null, reason: "categoryAdded" },
      value: category!,
    };
  });
  return out.value ? { ok: true, category: out.value } : { ok: false, field: "exists" };
}

/** «Екеуі де қалсын»: the pair is marked as different people (no duplicate warning any more). */
export async function keepBothDuplicates(
  db: Db,
  who: Principal,
  input: { eventId: string; familyA: string; familyB: string },
) {
  const m = await authorize(db, who, input.eventId, "member");
  const [a, b] = input.familyA < input.familyB ? [input.familyA, input.familyB] : [input.familyB, input.familyA];
  const rows = await db
    .select({ id: families.id })
    .from(families)
    .where(and(eq(families.eventId, input.eventId), sql`${families.id} in (${a}, ${b})`));
  if (rows.length !== 2) throw new ForbiddenError();
  await db
    .insert(duplicateReviews)
    .values({ eventId: input.eventId, familyA: a, familyB: b, decidedBy: m.memberId })
    .onConflictDoNothing();
  return { ok: true as const };
}
