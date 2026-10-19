import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ForbiddenError, type Principal } from "@/server/auth/access";
import { db } from "@/server/db";
import { buildWorkbook, type ExportLabels } from "@/server/export/xlsx";
import { printView } from "@/server/print/queries";
import { eventMembers, families, users } from "@/server/schema";
import { DEMO_PHONES, seedSample } from "../../scripts/lib/seed-sample";
import { resetDb } from "./helpers";

/** Ф10 brief §5 integration: 403 for a stranger; the xlsx is readable, rows = seated + expected families, no phones. */
beforeEach(resetDb);

const labels: ExportLabels = {
  sheets: { tables: "Үстелдер", guests: "Қонақтар", categories: "Санаттар" },
  columns: {
    table: "Үстел",
    name: "Аты",
    seats: "Орын",
    category: "Санаты",
    status: "Жауабы",
    list: "Кімнің тізімі",
    families: "Отбасы саны",
    tables: "Үстелдер",
  },
  status: { yes: "Келеді", pending: "Жауап жоқ" },
};

async function setup() {
  const s = await seedSample(db(), new Date("2026-10-10T08:00:00Z"));
  const ids: Record<string, string> = {};
  for (const [k, phone] of Object.entries({ ...DEMO_PHONES, stranger: "+77019990000" })) {
    const [u] = await db()
      .insert(users)
      .values({ phone })
      .onConflictDoUpdate({ target: users.phone, set: { phone } })
      .returning({ id: users.id });
    ids[k] = u!.id;
    if (k in DEMO_PHONES) await db().update(eventMembers).set({ userId: u!.id }).where(eq(eventMembers.phone, phone));
  }
  const all = (userId: string): Principal => ({ userId, scope: "all", sessionId: "n/a" });
  return { s, jas: all(ids.jas!), stranger: all(ids.stranger!) };
}

describe("print and xlsx (Ф10)", () => {
  it("a stranger gets 403; any member (also «Тек тізім») reads the plan", async () => {
    const { s, jas, stranger } = await setup();
    await expect(printView(db(), stranger, s.eventId, "kk")).rejects.toBeInstanceOf(ForbiddenError);
    const v = await printView(db(), jas, s.eventId, "ru");
    expect(v.plan!.totals).toMatchObject({ toSeat: 173, capacity: 192 });
    expect(v.event.dateLine).toBe("15 ноября, 18:00");
  });

  it("the workbook opens in exceljs: 3 sheets, rows = families with seats, Kazakh letters kept, no phones", async () => {
    const { s, jas } = await setup();
    const v = await printView(db(), jas, s.eventId, "kk");
    const buf = await buildWorkbook(v, labels);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Үстелдер", "Қонақтар", "Санаттар"]);
    const rows = await db().select().from(families).where(eq(families.eventId, s.eventId));
    const withSeats = rows.filter((f) => f.rsvp !== "no");
    const tables = wb.getWorksheet("Үстелдер")!;
    expect(tables.rowCount - 1).toBe(withSeats.length);
    expect(tables.getRow(1).values).toEqual([undefined, "Үстел", "Аты", "Орын", "Санаты", "Жауабы", "Кімнің тізімі"]);
    expect(typeof tables.getRow(2).getCell(3).value).toBe("number");
    expect(tables.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    const guests = wb.getWorksheet("Қонақтар")!;
    expect(guests.rowCount - 1).toBe(withSeats.length);
    const all = JSON.stringify(wb.worksheets.map((w) => w.getSheetValues()));
    expect(all).toContain("Сапарбаевтар");
    for (const f of rows) if (f.phone) expect(all).not.toContain(f.phone.slice(2));
    expect(wb.getWorksheet("Санаттар")!.getRow(2).values).toEqual([
      undefined,
      "Құдалар",
      expect.any(Number),
      28,
      "1–3",
    ]);
  });
});
