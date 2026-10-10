import { describe, expect, it } from "vitest";
import { formatPhone, nationalPart } from "@/domain/guests/phone";
import {
  compareGuests,
  daysAgo,
  type GuestLike,
  guestStatus,
  listTotals,
  matchesQuery,
  plannedSeats,
} from "@/domain/guests/status";
import { formatEventDate, guestLink, type WaEvent, waText, waUrl } from "@/domain/guests/wa";
import type { Family } from "@/domain/seating";
import { translator } from "@/i18n/messages";
import { familySeatColumns, historyDiff, rowToFamily } from "@/server/seating/adapter";

const g = (over: Partial<GuestLike>): GuestLike => ({
  name: "А",
  rsvp: "pending",
  expected: 2,
  confirmed: null,
  sentAt: null,
  ...over,
});

describe("guest status (plan 5.1)", () => {
  it("rsvp + sent_at → status; planned seats", () => {
    expect(guestStatus(g({}))).toBe("notSent");
    expect(guestStatus(g({ sentAt: new Date() }))).toBe("noAnswer");
    expect(guestStatus(g({ rsvp: "yes", confirmed: 3 }))).toBe("yes");
    expect(guestStatus(g({ rsvp: "no", sentAt: new Date() }))).toBe("no");
    expect(plannedSeats(g({ expected: 4 }))).toBe(4);
    expect(plannedSeats(g({ rsvp: "yes", expected: 4, confirmed: 2 }))).toBe(2);
    expect(plannedSeats(g({ rsvp: "no", expected: 4 }))).toBe(0);
  });

  it("list totals: yes = Σ confirmed seats, noAnswer/no = families, notSent separate (А4 for summaries)", () => {
    const t = listTotals([
      g({ rsvp: "yes", confirmed: 4 }),
      g({ rsvp: "yes", confirmed: 2 }),
      g({ sentAt: new Date(), expected: 3 }),
      g({ expected: 5 }),
      g({ rsvp: "no" }),
    ]);
    expect(t).toEqual({ families: 5, seats: 4 + 2 + 3 + 5, yesSeats: 6, noAnswer: 1, notSent: 1, no: 1 });
  });

  it("order inside a group: notSent, noAnswer, yes, no; then Kazakh alphabet", () => {
    const list = [
      g({ name: "Ғалым", rsvp: "yes", confirmed: 1 }),
      g({ name: "Болат", rsvp: "no" }),
      g({ name: "Әсел", sentAt: new Date() }),
      g({ name: "Ақмарал", rsvp: "yes", confirmed: 1 }),
      g({ name: "Ұлан" }),
    ].sort((a, b) => compareGuests(a, b));
    expect(list.map((x) => x.name)).toEqual(["Ұлан", "Әсел", "Ақмарал", "Ғалым", "Болат"]);
  });

  it("days ago counts calendar days in Almaty; search is case-insensitive substring", () => {
    const now = new Date("2026-10-10T19:30:00Z"); // 00:30 on the 11th in Almaty (UTC+5)
    expect(daysAgo(new Date("2026-10-10T18:00:00Z"), now)).toBe(1); // 23:00 on the 10th → «Кеше»
    expect(daysAgo(new Date("2026-10-10T19:00:00Z"), now)).toBe(0); // 00:00 on the 11th → «Бүгін»
    expect(daysAgo(new Date("2026-10-09T10:00:00Z"), now)).toBe(2);
    expect(matchesQuery("Ерлан ағай отбасы", "ЕРЛ")).toBe(true);
    expect(matchesQuery("Ерлан ағай отбасы", "ағай")).toBe(true);
    expect(matchesQuery("Ерлан", "Болат")).toBe(false);
    expect(matchesQuery("Ерлан", "  ")).toBe(true);
  });
});

describe("phone display", () => {
  it("formats E.164 for the sheet and the edit input", () => {
    expect(formatPhone("+77023145520")).toBe("+7 702 314 55 20");
    expect(nationalPart("+77023145520")).toBe("702 314 55 20");
    expect(nationalPart(null)).toBe("");
  });
});

describe("WhatsApp texts (CONTENT_REVIEW 6)", () => {
  const ev: WaEvent = {
    kind: "uilenu_toi",
    title: "Айбек пен Дана",
    hostsLine: null,
    startsOn: "2026-11-15",
    startsAt: "18:00:00",
    venueName: "«Шаңырақ» мейрамханасы",
    tz: "Asia/Almaty",
  };
  const fam = { name: "Тимур құда отбасы", token: "AbCdEfGhIjKlMnOpQrStUv" };
  const t = (locale: "kk" | "ru") => (k: "invite" | "reminder", v: Record<string, string>) =>
    translator(locale)(`wa.${k}`, v);

  it("invite: name as typed, kind sentence, link /i/{token}, no hosts block without hosts", () => {
    const text = waText("invite", t("kk"), "kk", ev, fam, "https://toi.example/");
    expect(text).toContain("құрметті Тимур құда отбасы!");
    expect(text).toContain("үйлену тойымызға");
    expect(text).toContain("18:00");
    expect(text).toContain("«Шаңырақ» мейрамханасы");
    expect(text).toContain("https://toi.example/i/AbCdEfGhIjKlMnOpQrStUv");
    expect(text).not.toContain("Той иелері");
    const withHosts = waText("invite", t("kk"), "kk", { ...ev, hostsLine: "Серік пен Гүлжан" }, fam, "https://x");
    expect(withHosts).toContain("Той иелері: Серік пен Гүлжан");
  });

  it("reminder and ru; dates in the event time zone", () => {
    expect(waText("reminder", t("kk"), "kk", ev, fam, "https://x")).toContain("еске саламыз");
    const ru = waText("invite", t("ru"), "ru", ev, fam, "https://x");
    expect(ru).toContain("Тимур құда отбасы");
    expect(formatEventDate(ev, "ru")).toBe("15 ноября");
    expect(guestLink("https://x/", "T")).toBe("https://x/i/T");
  });

  it("wa.me: phone digits or no recipient; the whole text encoded", () => {
    expect(waUrl("Сәлем\nhttps://x/i/T?a=1&b=2", "+77011234567")).toBe(
      `https://wa.me/77011234567?text=${encodeURIComponent("Сәлем\nhttps://x/i/T?a=1&b=2")}`,
    );
    expect(waUrl("a b", null)).toBe("https://wa.me/?text=a%20b");
  });
});

describe("seating adapter mapping (brief 2.1)", () => {
  const row = {
    id: "f1",
    categoryId: "c1",
    rsvp: "yes" as const,
    expectedCount: 4,
    confirmedCount: 3,
    tableNo: 7,
    seatLocked: true,
    lockedByMemberId: "m1",
    seatSeq: 12,
  };

  it("row → engine family and back (seat columns)", () => {
    const f = rowToFamily(row);
    expect(f).toEqual({
      id: "f1",
      categoryId: "c1",
      rsvp: "yes",
      expected: 4,
      confirmed: 3,
      tableNo: 7,
      locked: true,
      lockedBy: "m1",
      seq: 12,
    });
    expect(familySeatColumns(f)).toEqual({ tableNo: 7, seatLocked: true, lockedByMemberId: "m1" });
    expect(familySeatColumns({ ...f, locked: false })).toEqual({
      tableNo: 7,
      seatLocked: false,
      lockedByMemberId: null,
    });
  });

  it("history diff records added and removed families", () => {
    const base = { hall: { columns: 4 as const, tables: 2, seatsPerTable: 12 }, categories: [{ id: "c1", rank: 1 }] };
    const a: Family = rowToFamily(row);
    const b: Family = { ...a, id: "f2", tableNo: 1, locked: false, lockedBy: null };
    const added = historyDiff({ ...base, families: [a] }, { ...base, families: [a, b] });
    expect(added.families).toEqual([
      {
        id: "f2",
        before: { tableNo: null, locked: false, lockedBy: null },
        after: { tableNo: 1, locked: false, lockedBy: null },
      },
    ]);
    const removed = historyDiff({ ...base, families: [a, b] }, { ...base, families: [a] });
    expect(removed.families.map((f) => [f.id, f.after.tableNo])).toEqual([["f2", null]]);
  });
});
