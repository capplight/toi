import { describe, expect, it } from "vitest";
import {
  dayKey,
  datePlate,
  daysAgo,
  daysUntil,
  formatDate,
  formatDateTime,
  formatDayMonth,
  formatMoney,
  formatNumericDateTime,
  formatNumericDay,
  formatTime,
  formatWeekday,
  monthName,
  relativeDay,
} from "@/domain/format";

/** Ф10 brief §4: shared formatters, kk / ru, borders of the Almaty day and of the month. */
describe("format (Ф10)", () => {
  it("money: no-break spaces, ₸, rounding and minus", () => {
    expect(formatMoney(6000000)).toBe("6 000 000 ₸");
    expect(formatMoney(999)).toBe("999 ₸");
    expect(formatMoney(0)).toBe("0 ₸");
    expect(formatMoney(-1500)).toBe("−1 500 ₸");
  });

  it("calendar dates (YYYY-MM-DD) are taken as is", () => {
    expect(formatDayMonth("2026-11-15", "kk")).toBe("15 қараша");
    expect(formatDayMonth("2026-11-15", "ru")).toBe("15 ноября");
    expect(formatDate("2026-01-01", "kk")).toBe("1 қаңтар 2026");
    expect(formatDate("2026-12-31", "ru")).toBe("31 декабря 2026");
    expect(formatWeekday("2026-11-15", "kk")).toBe("Жексенбі");
    expect(formatWeekday("2026-11-15", "ru")).toBe("Воскресенье");
    expect(monthName("2026-03-08", "kk")).toBe("наурыз");
    expect(datePlate("2026-10-10", "kk")).toEqual({ day: "10", mon: "қаз" });
    expect(datePlate("2026-05-01", "ru")).toEqual({ day: "01", mon: "мая" });
    expect(formatNumericDay("2026-11-05")).toBe("05.11");
  });

  it("instants are read in Almaty (UTC+5): midnight and the end of the month", () => {
    const beforeMidnight = new Date("2026-10-31T18:59:00Z"); // 23:59 on 31 Oct in Almaty
    const afterMidnight = new Date("2026-10-31T19:00:00Z"); // 00:00 on 1 Nov in Almaty
    expect(dayKey(beforeMidnight)).toBe("2026-10-31");
    expect(dayKey(afterMidnight)).toBe("2026-11-01");
    expect(formatDateTime(beforeMidnight, "kk")).toBe("31 қазан, 23:59");
    expect(formatDateTime(afterMidnight, "ru")).toBe("1 ноября, 00:00");
    expect(formatTime(afterMidnight)).toBe("00:00");
    expect(formatNumericDateTime(afterMidnight)).toBe("01.11, 00:00");
    expect(dayKey(afterMidnight, "UTC")).toBe("2026-10-31");
  });

  it("relative days: today / yesterday / N days, counted in Almaty calendar days", () => {
    const now = new Date("2026-11-01T04:00:00Z"); // 09:00 on 1 Nov in Almaty
    expect(relativeDay(new Date("2026-10-31T19:30:00Z"), now)).toEqual({ kind: "today", days: 0 });
    expect(relativeDay(new Date("2026-10-31T18:30:00Z"), now)).toEqual({ kind: "yesterday", days: 1 });
    expect(relativeDay(new Date("2026-10-28T10:00:00Z"), now)).toEqual({ kind: "days", days: 4 });
    expect(daysAgo(new Date("2026-11-02T10:00:00Z"), now)).toBe(0); // future → 0
    expect(daysUntil("2026-11-15", now)).toBe(14);
    expect(daysUntil("2026-10-31", now)).toBe(-1);
  });
});
