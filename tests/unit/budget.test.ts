import { describe, expect, it } from "vitest";
import {
  budgetSummary,
  dayIn,
  formatMoney,
  isAmount,
  isCategory,
  MAX_AMOUNT,
  parseAmount,
  restaurantPlanned,
} from "@/domain/budget";

describe("budget money (Ф9)", () => {
  it("parses amounts with any spaces; rejects minus, fractions, letters and too large", () => {
    expect(parseAmount("150 000")).toBe(150000);
    expect(parseAmount("1 800 000")).toBe(1800000);
    expect(parseAmount(" ")).toBe(0);
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("1,5")).toBeNull();
    expect(parseAmount("12k")).toBeNull();
    expect(parseAmount(String(MAX_AMOUNT + 1))).toBeNull();
    expect(isAmount(5)).toBe(true);
    expect(isAmount(-1)).toBe(false);
    expect(isAmount(1.5)).toBe(false);
    expect(isCategory("photo")).toBe(true);
    expect(isCategory("car")).toBe(false);
  });

  it("formats with no-break spaces and ₸ (kk and ru)", () => {
    const kk = formatMoney(6000000);
    const ru = formatMoney(1800000);
    expect(kk.replace(/[  ]/g, " ")).toBe("6 000 000 ₸");
    expect(ru.replace(/[  ]/g, " ")).toBe("1 800 000 ₸");
    expect(kk).not.toMatch(/ /); // no ordinary spaces: «1 / 800 000» must not wrap
  });

  it("restaurant = price × confirmed seats; null without a price", () => {
    expect(restaurantPlanned(12000, 150)).toBe(1800000);
    expect(restaurantPlanned(null, 150)).toBeNull();
  });

  it("totals, over budget, categories by plan, upcoming with overdue (today as a parameter)", () => {
    const s = budgetSummary(
      3_000_000,
      [
        { id: "a", category: "restaurant", planned: 1_800_000, paid: 900_000, dueDate: "2026-11-20" },
        { id: "b", category: "decor", planned: 400_000, paid: 200_000, dueDate: "2026-10-10" },
        { id: "c", category: "clothes", planned: 900_000, paid: 900_000, dueDate: "2026-10-05" },
        { id: "d", category: "decor", planned: 100_000, paid: 0, dueDate: null },
        { id: "e", category: "other", planned: 0, paid: 0, dueDate: null },
      ],
      "2026-10-14",
    );
    expect(s).toMatchObject({ planned: 3_200_000, paid: 2_000_000, left: 1_000_000, over: 200_000 });
    expect(s.categories.map((c) => c.category)).toEqual(["restaurant", "clothes", "decor"]);
    expect(s.categories[0]).toMatchObject({ share: 1, paidShare: 0.5 });
    expect(s.upcoming).toEqual([
      { id: "b", dueDate: "2026-10-10", left: 200_000, overdue: true },
      { id: "a", dueDate: "2026-11-20", left: 900_000, overdue: false },
    ]);
    const none = budgetSummary(null, [], "2026-10-14");
    expect(none).toMatchObject({ planned: 0, paid: 0, left: null, over: 0, categories: [], upcoming: [] });
  });

  it("«today» in Asia/Almaty", () => {
    expect(dayIn("Asia/Almaty", new Date("2026-10-13T19:30:00Z"))).toBe("2026-10-14");
    expect(dayIn("Asia/Almaty", new Date("2026-10-13T18:30:00Z"))).toBe("2026-10-13");
  });
});
