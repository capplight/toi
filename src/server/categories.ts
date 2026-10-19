import { messagesByLocale } from "@/i18n/messages";

/**
 * The 8 default categories of a new event (plan 6.2 `createEvent`, design_spec 5.2) in seating order.
 * Labels come from content/messages `category.names.*` (decision Д5) — no copies in code.
 */
export const DEFAULT_CATEGORY_CODES = ["kuda", "oz", "nagashy", "dos", "ariptes", "korshi", "synyp", "baska"] as const;
export type DefaultCategoryCode = (typeof DEFAULT_CATEGORY_CODES)[number];

export function defaultCategories() {
  return DEFAULT_CATEGORY_CODES.map((code, i) => ({
    code,
    labelKk: messagesByLocale.kk.category.names[code],
    labelRu: messagesByLocale.ru.category.names[code],
    seatingRank: i + 1,
    isCustom: false,
    colorToken: `cat-${i + 1}`,
  }));
}
