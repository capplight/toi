import { mkdirSync } from "node:fs";
import { type Browser, type Page, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф9 handover screenshots (DESIGN 8.20, mockup 13 states): empty / no total, the filled screen at 360 and 1440 (kk, ru),
 * add, add-error, edit, restaurant, delete, over budget, #noright, 130 %, 320, the «Қорытынды» card. World `screensF9`.
 * Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f9.spec.ts --project=desktop --workers=1 → docs/phases/F9-screens/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = "docs/phases/F9-screens";
const w = () => world("screensF9");

async function open(
  browser: Browser,
  baseURL: string,
  path: string,
  o: { who?: "ake" | "jas"; locale?: "kk" | "ru"; width?: number; big?: boolean } = {},
) {
  const width = o.width ?? 360;
  const c = await browser.newContext({
    baseURL,
    viewport: { width, height: width >= 1024 ? 900 : width === 320 ? 640 : 740 },
    deviceScaleFactor: 1,
    isMobile: width < 1024,
    hasTouch: width < 1024,
  });
  await c.addCookies([
    { name: "toi_session", value: w().sessions[o.who ?? "ake"], url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: o.locale ?? "kk", url: baseURL },
  ]);
  await c.addInitScript(() => window.localStorage.setItem("toi.pilotBanner.dismissed", "1"));
  const page = await c.newPage();
  await page.goto(`/e/${w().eventId}${path}`);
  if (o.big) await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  return { c, page };
}

const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
const iso = (days: number) => new Date(Date.now() + days * 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);

async function add(page: Page, title: string, category: string, planned: string, paid: string, due?: string) {
  await page.locator(".sticky-cta .btn, .bud-head .btn").filter({ visible: true }).first().click();
  const s = page.getByTestId("expense-sheet");
  await s.getByRole("textbox", { name: "Атауы" }).fill(title);
  await s.getByRole("radio", { name: category }).click();
  if (planned) await s.getByRole("textbox", { name: "Жоспарланған сома" }).fill(planned);
  await s.getByRole("textbox", { name: "Төленді" }).fill(paid);
  if (due) await s.getByLabel("Төлеу мерзімі").fill(due);
  await page.getByRole("button", { name: "Сақтау" }).click();
  await s.waitFor({ state: "detached" });
}

test("Ф9 handover screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const b = baseURL!;

  // empty, no total; noright
  {
    const { c, page } = await open(browser, b, "/budget");
    await shot(page, "01-empty-nototal-kk-360");
    await c.close();
    const j = await open(browser, b, "/budget", { who: "jas" });
    await shot(j.page, "02-noright-kk-360");
    await j.c.close();
  }

  // fill: budget, restaurant (price), 5 items; screenshots of the add sheet and the amount error on the way
  {
    const { c, page } = await open(browser, b, "/budget");
    await page.getByRole("button", { name: "Өзгерту" }).click();
    await page.getByRole("textbox", { name: "Жалпы бюджет" }).fill("6 000 000");
    await page.getByRole("button", { name: "Сақтау" }).click();
    await page.locator(".bigbar").waitFor();
    await page.locator(".sticky-cta .btn").click();
    const s = page.getByTestId("expense-sheet");
    await s.getByRole("textbox", { name: "Атауы" }).fill("«Шаңырақ» мейрамханасы");
    await s.getByRole("radio", { name: "Мейрамхана" }).click();
    await s.getByRole("textbox", { name: "Бір орынның бағасы" }).fill("12 000");
    await s.getByRole("textbox", { name: "Төленді" }).fill("900 000");
    await s.getByLabel("Төлеу мерзімі").fill(iso(36));
    await page.waitForTimeout(300);
    await shot(page, "03-restaurant-new-kk-360");
    await page.getByRole("button", { name: "Сақтау" }).click();
    await s.waitFor({ state: "detached" });
    await add(page, "Құдаларға киіт", "Сыйлықтар / киіт", "1 200 000", "800 000");
    await add(page, "Асаба және әнші", "Асаба / әнші", "700 000", "350 000", iso(18));
    await add(page, "Фотограф", "Фото / видео", "500 000", "250 000", iso(22));
    await add(page, "Залды безендіру", "Безендіру", "400 000", "200 000", iso(-4));
    // add sheet with an amount error
    await page.locator(".sticky-cta .btn").click();
    await s.getByRole("textbox", { name: "Атауы" }).fill("Шашу, кәмпит");
    await s.getByRole("textbox", { name: "Жоспарланған сома" }).fill("300 мың");
    await page.getByRole("button", { name: "Сақтау" }).click();
    await page.waitForTimeout(300);
    await shot(page, "04-add-error-kk-360");
    await c.close();
  }

  for (const [name, o, full] of [
    ["05-budget-kk-360", {}, false],
    ["06-budget-kk-360-full", {}, true],
    ["07-budget-ru-360-full", { locale: "ru" }, true],
    ["08-budget-kk-1440", { width: 1440 }, false],
    ["09-budget-ru-1440", { width: 1440, locale: "ru" }, true],
    ["10-budget-kk-360-130pct", { big: true }, true],
    ["11-budget-kk-320", { width: 320 }, false],
  ] as const) {
    const { c, page } = await open(browser, b, "/budget", o);
    await shot(page, name, full);
    await c.close();
  }

  // edit, restaurant, delete confirm
  {
    const { c, page } = await open(browser, b, "/budget");
    await page.locator(".item", { hasText: "Асаба" }).click();
    await page.getByTestId("expense-sheet").waitFor();
    await page.waitForTimeout(400);
    await shot(page, "12-edit-kk-360");
    await page.getByRole("button", { name: "Өшіру" }).click();
    await page.getByRole("alertdialog").waitFor();
    await page.waitForTimeout(300);
    await shot(page, "13-delete-kk-360");
    await c.close();
    const r = await open(browser, b, "/budget", { width: 1440 });
    await r.page.locator(".item", { hasText: "Шаңырақ" }).click();
    await r.page.getByTestId("expense-sheet").waitFor();
    await r.page.waitForTimeout(400);
    await shot(r.page, "14-restaurant-kk-1440");
    await r.c.close();
  }

  // over budget (the total below the plan), the «Қорытынды» card
  {
    const { c, page } = await open(browser, b, "/budget");
    await page.getByRole("button", { name: "Өзгерту" }).click();
    await page.getByRole("textbox", { name: "Жалпы бюджет" }).fill("3 500 000");
    await page.getByRole("button", { name: "Сақтау" }).click();
    await page.locator(".bud-over").waitFor();
    await shot(page, "15-over-kk-360");
    await c.close();
    const s = await open(browser, b, "/summary");
    await shot(s.page, "16-summary-card-kk-360", true);
    await s.c.close();
  }
});
