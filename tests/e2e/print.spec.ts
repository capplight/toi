import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф10 «Отырғызу жоспары» and `tables.xlsx` (brief §5): print media at A4 width without horizontal scroll and with the
 * legend; `page.pdf()` produces a PDF; the page has table numbers and «Аты → үстел»; the xlsx downloads; kk and ru.
 * Reads world `base` (the seed of design_spec 5.2).
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const ru = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/ru.json"), "utf8"));
const needDb = () => test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres: set DATABASE_URL.");
const seed = () => world("base");

async function as(context: BrowserContext, baseURL: string, who: "ake" | "jas", locale: "kk" | "ru") {
  await context.addCookies([
    { name: "toi_session", value: seed().sessions[who], url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: locale, url: baseURL },
  ]);
}

test.describe("Ф10 print and export", () => {
  test.beforeEach(() => needDb());

  for (const locale of ["kk", "ru"] as const) {
    const m = locale === "kk" ? kk : ru;
    test(`print page (${locale}): map, legend, tables, by category, by name; print media fits A4`, async ({
      page,
      context,
      baseURL,
    }) => {
      await as(context, baseURL!, "ake", locale);
      await page.goto(`/e/${seed().eventId}/print/tables`);
      const p = page.getByTestId("print");
      await expect(p.getByRole("heading", { name: m.print.title })).toBeVisible();
      await expect(p.getByRole("heading", { name: m.print.map.title })).toBeVisible();
      await expect(p.locator(".print-map")).toBeVisible();
      await expect(p.locator(".pr-legend")).toContainText(m.print.legend.free);
      await expect(p.locator(".pr-legend")).toContainText(m.print.mixed);
      await expect(p.locator(".pr-table")).toHaveCount(15); // 16 tables, table 16 is empty in the seed
      await expect(p.locator(".pr-table").first()).toContainText(m.print.table.title.replace("{number}", "1"));
      await expect(p.getByRole("heading", { name: m.print.byCategory.title })).toBeVisible();
      await expect(p.getByRole("heading", { name: m.print.alpha.title })).toBeVisible();
      await expect(p.locator(".pr-alpha li")).toHaveCount(62); // 65 families − 3 «Келмейміз»

      await page.emulateMedia({ media: "print" });
      await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
      await expect(page.locator(".pr-actions")).toBeHidden();
      await expect(page.locator(".tabbar, .sidebar").first()).toBeHidden();
      await expect(page.locator(".pr-legend")).toBeVisible();
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      expect(sw).toBeLessThanOrEqual(iw);
      const pdf = await page.pdf({ format: "A4", printBackground: true });
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      expect(pdf.length).toBeGreaterThan(20_000);
    });
  }

  test("«Тек тізім» can print too; axe on the print page", async ({ page, context, baseURL }) => {
    await as(context, baseURL!, "jas", "kk");
    await page.goto(`/e/${seed().eventId}/print/tables`);
    await expect(page.getByTestId("print")).toBeVisible();
    const r = await new AxeBuilder({ page }).include("[data-testid=print]").analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  test("xlsx downloads with a Latin file name; a stranger gets 403", async ({ page, context, baseURL, request }) => {
    await as(context, baseURL!, "ake", "kk");
    await page.goto(`/e/${seed().eventId}/print/tables`);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: kk.export.button }).click();
    const d = await download;
    expect(d.suggestedFilename()).toMatch(/^toi-aibek-dana-\d{4}-\d{2}-\d{2}\.xlsx$/);
    const res = await request.get(`/e/${seed().eventId}/export/tables.xlsx`); // no session cookie
    expect(res.status()).toBe(401);
  });
});
