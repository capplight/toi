import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type World, world } from "./worlds";

/**
 * Ф9 «Шығындар» (brief §4): the owner sets the budget and 3 items and sees the bars and upcoming payments; the mother
 * changes «Төленді» → «Анасы өзгертті»; «Жастар» has no menu item and sees #noright; the restaurant sum follows a
 * guest answer through /i/{token}; delete with «Қайтару»; axe and 130 % (and 320 px). kk and ru, 360 and 1440.
 * Own world per project (`budgetMobile` / `budgetDesktop`); the tests of a project run in order.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const ru = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/ru.json"), "utf8"));
const needDb = () => test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres: set DATABASE_URL.");
const mine = (project: string): World => world(project === "mobile" ? "budgetMobile" : "budgetDesktop");
const nb = (s: string) => s.replace(/[  ]/g, " ");

async function as(context: BrowserContext, baseURL: string, w: World, who: "ake" | "ana" | "jas", locale = "kk") {
  await context.addCookies([
    { name: "toi_session", value: w.sessions[who]!, url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: locale, url: baseURL },
  ]);
}

/** «Шығын қосу» (sticky on the phone, top button on the desktop) → sheet → fill → «Сақтау». */
async function addItem(
  page: Page,
  m: typeof kk,
  item: { title: string; category: string; planned: string; paid: string; due?: string },
) {
  await page.getByRole("button", { name: m.budget.add }).filter({ visible: true }).first().click();
  const sheet = page.getByTestId("expense-sheet");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("textbox", { name: m.budget.item.fields.title }).fill(item.title);
  await sheet.getByRole("radio", { name: m.budget.categories[item.category] }).click();
  await sheet.getByRole("textbox", { name: m.budget.item.fields.planned }).fill(item.planned);
  await sheet.getByRole("textbox", { name: m.budget.item.fields.paid }).fill(item.paid);
  if (item.due) await sheet.getByLabel(m.budget.item.fields.due).fill(item.due);
  await page.getByRole("button", { name: m.budget.item.save }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".item", { hasText: item.title })).toBeVisible();
}

const iso = (days: number) => new Date(Date.now() + days * 86_400_000 + 5 * 3_600_000).toISOString().slice(0, 10);

async function noScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw, where).toBeLessThanOrEqual(iw);
}

test.describe("Ф9 budget", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() => needDb());

  test("owner (kk): budget, 3 items, bars, upcoming with overdue; amounts with no-break spaces", async ({
    page,
    context,
    baseURL,
  }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    await page.goto(`/e/${w.eventId}/budget`);
    await expect(page.getByText(kk.budget.totalNotSet)).toBeVisible();
    await expect(page.getByText(kk.budget.empty)).toBeVisible();
    await page.getByRole("button", { name: kk.budget.totalEdit }).click();
    await page.getByRole("textbox", { name: kk.budget.totalLabel }).fill("3 000 000");
    await page.getByRole("button", { name: kk.budget.item.save }).click();
    await expect(page.locator(".bud-top .total")).toHaveText(/3\s000\s000\s₸/);

    await addItem(page, kk, {
      title: "Асаба және әнші",
      category: "asaba",
      planned: "700 000",
      paid: "350000",
      due: iso(10),
    });
    await addItem(page, kk, { title: "Келіннің көйлегі", category: "clothes", planned: "900 000", paid: "900 000" });
    await addItem(page, kk, {
      title: "Залды безендіру",
      category: "decor",
      planned: "400 000",
      paid: "0",
      due: iso(-2),
    });

    const legend = nb(await page.locator(".bud-legend").innerText());
    expect(legend).toContain("1 250 000 ₸");
    expect(legend).toContain("1 750 000 ₸");
    await expect(page.locator(".cbar")).toHaveCount(3);
    await expect(page.locator(".cbar").first()).toContainText(kk.budget.categories.clothes); // largest plan first
    const pays = page.locator(".pay");
    await expect(pays).toHaveCount(2);
    await expect(pays.first()).toContainText("Залды безендіру");
    await expect(pays.first()).toContainText(kk.budget.upcoming.overdue);
    await expect(pays.first().locator(".d.overdue")).toHaveCount(1);
    // the amount never wraps inside: no ordinary space in «1 250 000 ₸»
    expect(await page.locator(".bud-legend").innerText()).not.toMatch(/\d \d/);
  });

  test("the mother (ru) changes «Оплачено» → «Анасы …»; 409 when the item changed meanwhile", async ({
    page,
    context,
    baseURL,
    browser,
  }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ana", "ru");
    await page.goto(`/e/${w.eventId}/budget`);
    // the father opens the same item first and keeps the old version
    const father = await browser.newContext({ baseURL, viewport: page.viewportSize()! });
    await as(father, baseURL!, w, "ake", "kk");
    const fp = await father.newPage();
    await fp.goto(`/e/${w.eventId}/budget`);
    await fp.locator(".item", { hasText: "Асаба" }).click();
    await expect(fp.getByTestId("expense-sheet")).toBeVisible();

    await page.locator(".item", { hasText: "Асаба" }).click();
    await page.getByTestId("expense-sheet").getByRole("textbox", { name: ru.budget.item.fields.paid }).fill("700 000");
    await page.getByRole("button", { name: ru.budget.item.save }).click();
    const row = page.locator(".item", { hasText: "Асаба" });
    await expect(row.locator(".by")).toContainText("Анасы");

    await fp.getByTestId("expense-sheet").getByRole("textbox", { name: kk.budget.item.fields.paid }).fill("1");
    await fp.getByRole("button", { name: kk.budget.item.save }).click();
    await expect(fp.locator(".toast")).toContainText(kk.errors.conflict);
    await fp.reload();
    expect(nb(await fp.locator(".item", { hasText: "Асаба" }).innerText())).toContain("700 000 ₸");
    await father.close();
  });

  test("«Жастар»: no menu item; a direct visit shows #noright", async ({ page, context, baseURL }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "jas");
    await page.goto(`/e/${w.eventId}/summary`);
    await expect(page.locator(`a[href$="/budget"]`)).toHaveCount(0);
    await page.goto(`/e/${w.eventId}/budget`);
    await expect(page.getByTestId("budget-noright")).toContainText(kk.errors.forbidden);
    await expect(page.getByRole("link", { name: kk.errors.goHome })).toBeVisible();
  });

  test("restaurant: price × confirmed seats, recounted after a guest answers through /i/{token}", async ({
    page,
    context,
    baseURL,
    browser,
  }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    await page.goto(`/e/${w.eventId}/budget`);
    await page.getByRole("button", { name: kk.budget.add }).filter({ visible: true }).first().click();
    const sheet = page.getByTestId("expense-sheet");
    await sheet.getByRole("textbox", { name: kk.budget.item.fields.title }).fill("«Шаңырақ» мейрамханасы");
    await sheet.getByRole("radio", { name: kk.budget.categories.restaurant }).click();
    await expect(sheet.getByText(kk.budget.restaurant.priceMissing)).toBeVisible();
    await sheet.getByRole("textbox", { name: kk.budget.restaurant.priceLabel }).fill("12 000");
    await expect(sheet.locator(".formula")).toContainText(/150 орын × 12\s000\s₸ = 1\s800\s000\s₸/);
    await page.getByRole("button", { name: kk.budget.item.save }).click();
    const item = page.locator(".item", { hasText: "Шаңырақ" });
    await expect(item.locator(".autobadge")).toBeVisible();
    expect(nb(await item.innerText())).toContain("150 орын × 12 000 ₸ = 1 800 000 ₸");

    const g = w.guests[0]!;
    const guest = await browser.newContext({ baseURL });
    const gp = await guest.newPage();
    await gp.goto(`/i/${g.token}?answered=1`);
    await gp.getByLabel(kk.invite.rsvp.yes).check();
    // wait for the answer itself (the URL already has ?answered=1, and closing the context earlier could abort the
    // POST — CI on Postgres reloaded before the answer was saved)
    const answered = gp.waitForResponse(
      (r) => r.request().method() === "POST" && new URL(r.url()).pathname === `/i/${g.token}`,
    );
    await gp.getByRole("button", { name: kk.invite.rsvp.submit }).click();
    expect((await answered).status()).toBeLessThan(400);
    await guest.close();
    await page.reload();
    const text = nb(await page.locator(".item", { hasText: "Шаңырақ" }).innerText());
    expect(text).not.toContain("150 орын");
    expect(text).toMatch(/15\d орын × 12 000 ₸/);
  });

  test("delete with «Қайтару»", async ({ page, context, baseURL }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    await page.goto(`/e/${w.eventId}/budget`);
    await page.locator(".item", { hasText: "Келіннің көйлегі" }).click();
    await page.getByRole("button", { name: kk.budget.item.delete }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: kk.budget.item.delete }).click();
    const toast = page.locator(".toast");
    await expect(toast).toContainText(kk.budget.item.deletedToast.replace("{title}", "Келіннің көйлегі"));
    await expect(page.locator(".item", { hasText: "Келіннің көйлегі" })).toHaveCount(0);
    await toast.getByRole("button", { name: kk.common.actions.undo }).click();
    await expect(page.locator(".item", { hasText: "Келіннің көйлегі" })).toBeVisible();
  });

  test("axe, 130 % and 320 px; the «Қорытынды» card shows the sums", async ({ page, context, baseURL }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    await page.goto(`/e/${w.eventId}/budget`);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await noScroll(page, "130 %");
    await page.locator(".item").first().click();
    await expect(page.getByTestId("expense-sheet")).toBeVisible();
    await page.waitForTimeout(400);
    const s = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
    expect(s.violations.map((v) => v.id)).toEqual([]);
    if (info.project.name === "mobile") {
      await page.goto(`/e/${w.eventId}/budget`);
      await page.setViewportSize({ width: 320, height: 640 });
      await noScroll(page, "320 px");
      await page.goto(`/e/${w.eventId}/summary`);
      const card = page.locator(`.link-row[href$="/budget"]`);
      expect(nb(await card.innerText())).toMatch(/Төленді: [\d ]+ ₸ \/ 3 000 000 ₸/);
    }
  });
});
