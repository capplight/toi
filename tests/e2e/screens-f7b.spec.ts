import { mkdirSync } from "node:fs";
import { type Browser, type Page, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф7b handover screenshots (DESIGN 8.6–8.13): «Зал» H1–H7 for the owner and «Жастар», kk and ru, 360 / 1440,
 * 130 % and 320 px; the B1 state (overflow + duplicates + unplaced + toast) and the 20 × 16 hall. Not visual
 * regression. World `screensF7b` (the seed of design_spec 5.2; the spec changes it at the end).
 * Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f7b.spec.ts --project=desktop --workers=1 → docs/phases/F7b-screens/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = "docs/phases/F7b-screens";
const w = () => world("screensF7b");

async function open(
  browser: Browser,
  baseURL: string,
  path: string,
  o: { who?: "ake" | "jas"; locale?: "kk" | "ru"; width?: number; height?: number; big?: boolean } = {},
) {
  const width = o.width ?? 360;
  const c = await browser.newContext({
    baseURL,
    viewport: { width, height: o.height ?? (width >= 1024 ? 900 : width === 320 ? 640 : 740) },
    deviceScaleFactor: 1,
    isMobile: width < 1024,
    hasTouch: width < 1024,
  });
  await c.addCookies([
    { name: "toi_session", value: w().sessions[o.who ?? "ake"], url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: o.locale ?? "kk", url: baseURL },
  ]);
  const page = await c.newPage();
  await page.goto(`/e/${w().eventId}${path}`);
  if (o.big) await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  return { c, page };
}

const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });

test("Ф7b handover screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const b = baseURL!;

  // H2 map: owner kk/ru 360/1440, 130 %, 320, Жастар
  for (const [name, o, full] of [
    ["01-hall-kk-360", {}, false],
    ["02-hall-kk-360-full", {}, true],
    ["03-hall-ru-360", { locale: "ru" }, false],
    ["04-hall-kk-1440", { width: 1440 }, false],
    ["05-hall-ru-1440", { width: 1440, locale: "ru" }, false],
    ["06-hall-kk-360-130pct", { big: true }, true],
    ["07-hall-kk-320", { width: 320 }, false],
    ["08-hall-jastar-kk-360", { who: "jas" }, true],
    ["09-hall-jastar-ru-1440", { who: "jas", locale: "ru", width: 1440 }, false],
  ] as const) {
    const { c, page } = await open(browser, b, "/hall", o);
    await shot(page, name, full);
    await c.close();
  }

  // H2-List
  for (const [name, o] of [
    ["10-list-kk-360", {}],
    ["11-list-kk-1440", { width: 1440 }],
  ] as const) {
    const { c, page } = await open(browser, b, "/hall?view=list", o);
    await page.locator(".acc-item.over .acc-trigger").first().click();
    await page.waitForTimeout(300);
    await shot(page, name, false);
    await c.close();
  }

  // H3 table sheet (overflowing table 7 with «Келесі»)
  for (const [name, o] of [
    ["12-table7-kk-360", {}],
    ["13-table7-ru-1440", { width: 1440, locale: "ru" }],
  ] as const) {
    const { c, page } = await open(browser, b, "/hall", o);
    await page.locator('[data-table="7"]').click();
    await page.getByTestId("table-sheet").waitFor();
    await page.waitForTimeout(400);
    await shot(page, name);
    await c.close();
  }

  // H4 «Ауыстыру»: family of table 7 → mode, confirm (enough seats) and short
  for (const [name, o] of [
    ["14-move-kk-360", {}],
    ["15-move-kk-1440", { width: 1440 }],
  ] as const) {
    const { c, page } = await open(browser, b, "/hall", o);
    await page.locator('[data-table="7"]').click();
    await page.getByTestId("table-sheet").locator(".fam .btn.secondary").first().click();
    await page.locator(".mv-info").waitFor();
    await page.waitForTimeout(500);
    await shot(page, name, true);
    await page.locator(".choose .row:visible").first().click();
    await page.getByTestId("move-confirm").waitFor();
    await page.waitForTimeout(300);
    await shot(page, `${name}-confirm`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    await page.locator('[data-table="3"]').click();
    await page.getByTestId("move-confirm").waitFor();
    await page.waitForTimeout(300);
    await shot(page, `${name}-short`);
    await c.close();
  }

  // H6 duplicates: sheet and «Схемада көру»
  {
    const { c, page } = await open(browser, b, "/hall");
    await page.locator(".chip.dup").click();
    await page.locator(".dup-card").waitFor();
    await page.waitForTimeout(300);
    await shot(page, "16-dups-sheet-kk-360");
    await page.locator(".dup-card .btn.secondary").first().click();
    await page.locator(".dup-panel").waitFor();
    await page.waitForTimeout(800);
    await shot(page, "17-dups-map-kk-360");
    await c.close();
  }

  // H5 order + preview, view-only
  for (const [name, o] of [
    ["18-order-kk-360", {}],
    ["19-order-ru-1440", { width: 1440, locale: "ru" }],
    ["20-order-jastar-kk-360", { who: "jas" }],
    ["21-order-kk-360-130pct", { big: true }],
  ] as const) {
    const { c, page } = await open(browser, b, "/hall/order", o);
    await shot(page, name, true);
    await c.close();
  }
  {
    const { c, page } = await open(browser, b, "/hall/order");
    await page.getByRole("button", { name: "Толық қайта отырғызу" }).click();
    await page.getByTestId("reseat-preview").waitFor();
    await page.waitForTimeout(400);
    await shot(page, "22-reseat-preview-kk-360");
    await c.close();
  }

  // H7 history
  for (const [name, o] of [
    ["23-history-kk-360", {}],
    ["24-history-ru-1440", { width: 1440, locale: "ru" }],
    ["25-history-jastar-kk-360", { who: "jas" }],
    ["26-history-kk-360-130pct", { big: true }],
  ] as const) {
    const { c, page } = await open(browser, b, "/hall/history", o);
    await shot(page, name, true);
    await c.close();
  }

  // H1 setup
  for (const [name, o] of [
    ["27-setup-kk-360", {}],
    ["28-setup-ru-1440", { width: 1440, locale: "ru" }],
  ] as const) {
    const { c, page } = await open(browser, b, "/hall/setup?tables=14", o);
    await shot(page, name, true);
    await c.close();
  }

  // B1: all problems at once (14 tables → unplaced) + toast, 360 and 320; then 20 × 16 at 360
  {
    const { c, page } = await open(browser, b, "/hall/setup?tables=14");
    await page.getByRole("button", { name: "Сақтау және отырғызу" }).click();
    await page.waitForURL(/\/hall$/);
    await page.locator(".toast").waitFor();
    await page.waitForTimeout(700);
    await shot(page, "29-b1-all-kk-360");
    await c.close();
  }
  {
    const { c, page } = await open(browser, b, "/hall", { width: 320 });
    await page.locator(".chip").first().waitFor();
    await shot(page, "30-b1-all-kk-320");
    await c.close();
  }
  {
    const { c, page } = await open(browser, b, "/hall/setup?tables=20", { width: 1440 });
    const seats = page.locator(".stepper").nth(1).getByRole("button").last();
    for (let i = 0; i < 4; i++) await seats.click();
    await page.getByRole("button", { name: "Сақтау және отырғызу" }).click();
    await page.waitForURL(/\/hall$/);
    await c.close();
    const r = await open(browser, b, "/hall");
    await shot(r.page, "31-hall-20x16-kk-360", true);
    await r.c.close();
    const d = await open(browser, b, "/hall", { width: 1440 });
    await shot(d.page, "32-hall-20x16-kk-1440");
    await d.c.close();
  }
});
