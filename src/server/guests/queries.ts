import { and, asc, eq, isNull } from "drizzle-orm";
import { formatPhone } from "@/domain/guests/phone";
import { plannedSeats } from "@/domain/guests/status";
import type { Locale } from "@/i18n/config";
import { messagesByLocale, translator } from "@/i18n/messages";
import { formatEventDate, type WaEvent } from "@/domain/guests/wa";
import type { Membership } from "../auth/access";
import type { Db } from "../db";
import { categories, eventMembers, events, families } from "../schema";

/**
 * Read models of the guest screens (S1, S2, S4, S5). Plain serialisable objects for client components:
 * dates as ISO strings, labels already resolved for the locale. wa.me texts are built on the client from
 * `wa.*` messages (one copy of the texts instead of two long encoded links per card — perf, brief 2.4).
 */

export type ListKind = "father" | "mother" | "couple" | "custom";

export type MemberView = {
  id: string;
  label: string;
  kind: ListKind;
  /** «Әкесінің тізімі» / «Тізім: Апасы». */
  listName: string;
  /** «Әкесінің тізімінде» — for «Бұл нөмір … бар». */
  inListName: string;
  families: number;
  seats: number;
  isMe: boolean;
};

export type CategoryView = { id: string; code: string | null; label: string; colorToken: string; rank: number };

export type GuestView = {
  id: string;
  name: string;
  phone: string | null;
  phoneText: string | null;
  categoryId: string;
  rsvp: "pending" | "yes" | "no";
  expected: number;
  confirmed: number | null;
  tableNo: number | null;
  sentAt: string | null;
  remindedAt: string | null;
  version: number;
  memberId: string;
  answeredByMember: boolean;
  /** Personal guest-link token (the wa.me text is built on the client from content/messages `wa.*`). */
  token: string;
};

export type GuestsEvent = { id: string; title: string; dateLine: string; venue: string | null; tz: string };

/** List kind of a member: by label («Әкесі»/«Анасы» in kk or ru) or kind `couple`; anything else is custom. */
export function listKind(member: { label: string; memberKind: string }): ListKind {
  const l = member.label.trim().toLocaleLowerCase("kk");
  const is = (k: "father" | "mother") =>
    [messagesByLocale.kk.roles[k], messagesByLocale.ru.roles[k]].some((x) => x.toLocaleLowerCase("kk") === l);
  if (is("father")) return "father";
  if (is("mother")) return "mother";
  if (member.memberKind === "couple") return "couple";
  return "custom";
}

function waEventOf(ev: typeof events.$inferSelect): WaEvent {
  return {
    kind: ev.kind,
    title: ev.title,
    hostsLine: ev.hostsLine,
    startsOn: ev.startsOn,
    startsAt: ev.startsAt,
    venueName: ev.venueName,
    tz: ev.tz,
  };
}

export function guestView(r: typeof families.$inferSelect): GuestView {
  return {
    id: r.id,
    name: r.name,
    phone: r.phone,
    phoneText: r.phone ? formatPhone(r.phone) : null,
    categoryId: r.categoryId,
    rsvp: r.rsvp,
    expected: r.expectedCount,
    confirmed: r.confirmedCount,
    tableNo: r.tableNo,
    sentAt: r.sentAt?.toISOString() ?? null,
    remindedAt: r.remindedAt?.toISOString() ?? null,
    version: r.version,
    memberId: r.addedByMemberId,
    answeredByMember: r.answeredBy === "member",
    token: r.token,
  };
}

export type GuestsData = {
  event: GuestsEvent;
  /** For wa.me texts on the client. */
  wa: WaEvent;
  appUrl: string;
  me: { memberId: string; defaultCategoryId: string | null };
  members: MemberView[];
  categories: CategoryView[];
  /** The list shown: its member and its families. */
  list: { memberId: string; own: boolean };
  guests: GuestView[];
};

/**
 * Data of the guest screens for a member (access already checked by the caller with `requireMember`).
 * `listMemberId` — another member's list («Басқа тізімдер»); unknown ids fall back to the own list.
 * `scope: "all"` returns every family of the event (S5 for the whole event is not needed — kept for Ф6).
 */
export async function guestsData(
  db: Db,
  m: Membership,
  opts: { listMemberId?: string | null; locale: Locale; appUrl: string },
): Promise<GuestsData> {
  const t = translator(opts.locale);
  const [ev] = await db.select().from(events).where(eq(events.id, m.eventId));
  if (!ev) throw new Error("event not found");
  const [memberRows, catRows, famRows] = await Promise.all([
    db
      .select()
      .from(eventMembers)
      .where(and(eq(eventMembers.eventId, m.eventId), isNull(eventMembers.removedAt)))
      .orderBy(asc(eventMembers.invitedAt)),
    db.select().from(categories).where(eq(categories.eventId, m.eventId)).orderBy(asc(categories.seatingRank)),
    db
      .select()
      .from(families)
      .where(and(eq(families.eventId, m.eventId), isNull(families.deletedAt))),
  ]);

  const wev = waEventOf(ev);
  const me = memberRows.find((r) => r.id === m.memberId);
  const listMemberId =
    opts.listMemberId && memberRows.some((r) => r.id === opts.listMemberId) ? opts.listMemberId : m.memberId;

  const members: MemberView[] = memberRows.map((r) => {
    const kind = listKind(r);
    const own = famRows.filter((f) => f.addedByMemberId === r.id);
    return {
      id: r.id,
      label: r.label,
      kind,
      listName: kind === "custom" ? t("roles.listOf.custom", { label: r.label }) : t(`roles.listOf.${kind}`),
      inListName: kind === "custom" ? t("roles.inList.custom", { label: r.label }) : t(`roles.inList.${kind}`),
      families: own.length,
      seats: own.reduce(
        (s, f) => s + plannedSeats({ rsvp: f.rsvp, expected: f.expectedCount, confirmed: f.confirmedCount }),
        0,
      ),
      isMe: r.id === m.memberId,
    };
  });

  const date = formatEventDate(wev, opts.locale);
  return {
    event: {
      id: ev.id,
      title: ev.title,
      dateLine: ev.startsAt ? `${date}, ${ev.startsAt.slice(0, 5)}` : date,
      venue: ev.venueName,
      tz: ev.tz,
    },
    wa: { ...wev, dateText: date },
    appUrl: opts.appUrl,
    me: { memberId: m.memberId, defaultCategoryId: me?.defaultCategoryId ?? null },
    members,
    categories: catRows.map((c) => ({
      id: c.id,
      code: c.code,
      label: opts.locale === "ru" ? (c.labelRu ?? c.labelKk) : c.labelKk,
      colorToken: c.colorToken,
      rank: c.seatingRank,
    })),
    list: { memberId: listMemberId, own: listMemberId === m.memberId },
    guests: famRows.filter((f) => f.addedByMemberId === listMemberId).map(guestView),
  };
}

/** One family for the edit form (any member of the event may edit any family, plan 5.3). */
export async function familyForEdit(db: Db, m: Membership, familyId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(familyId)) return null;
  const [row] = await db
    .select()
    .from(families)
    .where(and(eq(families.id, familyId), eq(families.eventId, m.eventId), isNull(families.deletedAt)));
  return row ?? null;
}
