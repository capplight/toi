import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type World, world } from "./worlds";

/**
 * Ф7b «Зал» (brief §4): move with «Қайтару», «Бәрібір ауыстыру», order ↑↓ without re-seating, full re-seat with a
 * preview, duplicates and «Схемада көру», history and undo, «Тек тізім» sees no seating buttons, two browsers
 * (мама и папа) at once, criterion B1 at 360 and 320, axe and 130 %. kk and ru; 360 (mobile) and 1440 (desktop).
 * Writing tests use their own world per project (`hallMobile` / `hallDesktop`), the two-browser and B1 tests
 * `hallConcurrency` (desktop project only).
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const ru = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/ru.json"), "utf8"));
const needDb = () => test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres: set DATABASE_URL.");
const mine = (project: string): World => world(project === "mobile" ? "hallMobile" : "hallDesktop");

async function as(context: BrowserContext, baseURL: string, w: World, who: "ake" | "ana" | "jas", locale = "kk") {
  await context.addCookies([
    { name: "toi_session", value: w.sessions[who]!, url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: locale, url: baseURL },
  ]);
}

const label = (page: Page, no: number) => page.locator(`[data-table="${no}"] .lbl-occ`);

async function noScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw, where).toBeLessThanOrEqual(iw);
}

/** Table sheet → first family «Ауыстыру» → move mode. Returns the family name. */
async function startMove(page: Page, table: number, moveLabel: string) {
  const sheet = page.getByTestId("table-sheet");
  // the first click may land before hydration: repeat until the sheet opens
  await expect(async () => {
    await page.locator(`[data-table="${table}"]`).click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
  const name = (await sheet.locator(".fam .nm").first().innerText()).trim();
  await sheet.getByRole("button", { name: moveLabel }).first().click();
  await expect(page.locator(".mv-info")).toBeVisible();
  return name;
}

test.describe("Ф7b hall", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(() => needDb());

  test("move with «Қайтару» (kk): candidates, confirm, toast, undo restores the table", async ({
    page,
    context,
    baseURL,
  }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    await page.goto(`/e/${w.eventId}/hall`);
    await expect(label(page, 16)).toHaveText("0/12");
    const name = await startMove(page, 1, kk.hall.table.move);
    await expect(page.locator(".hall .ring-cand").first()).toBeVisible();
    await expect(page.locator(".hall .ring-cur")).toHaveCount(1);
    await page.locator(".choose .row:visible", { hasText: "16" }).first().click();
    const dlg = page.getByTestId("move-confirm");
    await expect(dlg).toContainText(kk.hall.move.confirm.route.replace("{from}", "1").replace("{to}", "16"));
    await page.getByRole("button", { name: kk.hall.move.confirm.yes }).click();
    const toast = page.locator(".toast");
    await expect(toast).toContainText(kk.hall.move.toast.replace("{number}", "16").replace("{name}", name));
    await expect(label(page, 16)).not.toHaveText("0/12");
    await expect(page.locator(".mv-info")).toHaveCount(0);
    await toast.getByRole("button", { name: kk.common.actions.undo }).click();
    await expect(label(page, 16)).toHaveText("0/12");
  });

  test("«Бәрібір ауыстыру» (ru): a full table asks, then overflows", async ({ page, context, baseURL }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake", "ru");
    await page.goto(`/e/${w.eventId}/hall`);
    await startMove(page, 1, ru.hall.table.move);
    await page.locator('[data-table="3"]').click();
    const dlg = page.getByTestId("move-confirm");
    await expect(dlg.locator(".badline")).toBeVisible();
    await page.getByRole("button", { name: ru.hall.move.confirm.force }).click();
    await expect(page.locator(".toast")).toBeVisible();
    await expect(label(page, 3)).toHaveClass(/over/);
    // undo from the toast keeps the world as it was
    await page.locator(".toast").getByRole("button", { name: ru.common.actions.undo }).click();
    await expect(label(page, 3)).not.toHaveClass(/over/);
  });

  test("order ↑↓ moves nobody; full re-seat only with a preview", async ({ page, context, baseURL }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    await page.goto(`/e/${w.eventId}/hall`);
    const before = await page.locator("[data-table] .lbl-occ").allInnerTexts();
    await page.goto(`/e/${w.eventId}/hall/order`);
    const rows = page.getByTestId("order-list").locator("li");
    const third = (await rows.nth(2).locator("b").innerText()).trim();
    await expect(rows.first().locator('button[data-dir="up"]')).toHaveAttribute("aria-disabled", "true");
    await rows.nth(2).locator('button[data-dir="up"]').click();
    await expect(page.getByTestId("order-saved")).toContainText(kk.hall.order.savedTitle);
    await expect(rows.nth(1).locator("b")).toHaveText(third);
    await expect(page.locator(".toast")).toBeVisible();
    // focus stays on the pressed button in its new place
    await expect(rows.nth(1).locator('button[data-dir="up"]')).toBeFocused();
    await page.goto(`/e/${w.eventId}/hall`);
    expect(await page.locator("[data-table] .lbl-occ").allInnerTexts()).toEqual(before);

    await page.goto(`/e/${w.eventId}/hall/order`);
    await page.getByRole("button", { name: kk.hall.order.fullReseat }).click();
    const pv = page.getByTestId("reseat-preview");
    await expect(pv).toBeVisible();
    const yes = page.getByRole("button", { name: kk.hall.order.preview.yes });
    if (await yes.count()) {
      await expect(pv.locator(".pv-big")).toBeVisible();
      await yes.click();
      await expect(page.locator(".toast")).toBeVisible();
    } else await expect(pv).toContainText(kk.hall.order.preview.none);
  });

  test("duplicates: sheet, «Схемада көру» highlights the pair, «Екеуі де қалсын»", async ({
    page,
    context,
    baseURL,
  }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    await page.goto(`/e/${w.eventId}/hall`);
    const open = info.project.name === "mobile" ? page.locator(".chip.dup") : page.locator(".banner.dup");
    await open.click();
    await expect(page.locator(".dup-card")).toHaveCount(1);
    await page.getByRole("button", { name: kk.hall.dups.showOnMap }).click();
    await expect(page.locator(".dup-panel")).toBeVisible();
    await expect(page.locator(".hall .ring-dup")).toHaveCount(2);
    expect(await page.locator(".hall .tbl.dim").count()).toBeGreaterThan(10);
    await page.locator(".dup-panel").getByRole("button", { name: kk.common.actions.close }).click();
    await expect(page.locator(".dup-panel")).toHaveCount(0);
    await open.click();
    await page.getByRole("button", { name: kk.hall.dups.keepBoth }).click();
    await expect(page.locator(".toast")).toContainText(kk.hall.dups.keptToast);
    await expect(page.locator(".chip.dup, .banner.dup")).toHaveCount(0);
  });

  test("history (ru): «Вернуть» on a move, the record is struck through; guest answers without it", async ({
    page,
    context,
    baseURL,
  }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake", "ru");
    await page.goto(`/e/${w.eventId}/hall/history`);
    await expect(page.getByText(ru.hall.history.guestNoUndo).first()).toBeVisible();
    const struck = await page.locator(".he.rev").count();
    const entry = page.locator(".he", { has: page.getByRole("button", { name: ru.common.actions.undo }) }).last();
    await entry.getByRole("button", { name: ru.common.actions.undo }).click();
    await expect(page.locator(".toast")).toBeVisible();
    await expect(page.locator(".he.rev")).toHaveCount(struck + 1);
    await expect(page.locator(".he.rev .revd").first()).toBeVisible();
  });

  test("«Тек тізім» (Жастар) sees the hall but no seating buttons (Ф3 review, deviation 9)", async ({
    page,
    context,
    baseURL,
  }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "jas");
    await page.goto(`/e/${w.eventId}/hall`);
    await expect(page.locator(".banner.view:visible")).toContainText(kk.hall.map.banners.viewOnly);
    await expect(page.locator(`.link-row[href$="/hall/setup"]`)).toHaveCount(0);
    await page.locator('[data-table="7"]').click();
    await expect(page.getByTestId("table-sheet")).toBeVisible();
    await expect(page.getByRole("button", { name: kk.hall.table.move })).toHaveCount(0);
    await expect(page.getByRole("button", { name: kk.hall.table.unlock })).toHaveCount(0);
    await page.goto(`/e/${w.eventId}/hall?view=list`);
    await page.locator(".acc-trigger").first().click();
    await expect(page.getByRole("button", { name: kk.hall.table.move })).toHaveCount(0);
    await page.goto(`/e/${w.eventId}/hall/order`);
    await expect(page.locator(".order .arr")).toHaveCount(0);
    await expect(page.locator(".order .vo").first()).toHaveText(kk.hall.order.viewOnly);
    await expect(page.getByRole("button", { name: kk.hall.order.fullReseat })).toHaveCount(0);
    await page.goto(`/e/${w.eventId}/hall/history`);
    await expect(page.getByRole("button", { name: kk.common.actions.undo })).toHaveCount(0);
    await page.goto(`/e/${w.eventId}/hall/setup`);
    await expect(page).toHaveURL(/\/hall$/);
  });

  test("axe and 130 % on H2, list, table sheet, order, history, setup", async ({ page, context, baseURL }, info) => {
    const w = mine(info.project.name);
    await as(context, baseURL!, w, "ake");
    for (const path of ["/hall", "/hall?view=list", "/hall/order", "/hall/history", "/hall/setup"]) {
      await page.goto(`/e/${w.eventId}${path}`);
      await page.waitForLoadState("networkidle");
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${path}: ${v.id}`)).toEqual([]);
      await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
      await page.waitForTimeout(200);
      await noScroll(page, `${path} 130 %`);
    }
    await page.goto(`/e/${w.eventId}/hall`);
    await page.locator('[data-table="7"]').click();
    await expect(page.getByTestId("table-sheet")).toBeVisible();
    await page.waitForTimeout(400);
    const r = await new AxeBuilder({ page }).include("[role=dialog]").analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

/* ---------------- two browsers, B1 (desktop project; own world) ---------------- */

async function contextFor(browser: Browser, baseURL: string, who: "ake" | "ana", width: number, height: number) {
  const c = await browser.newContext({
    baseURL,
    viewport: { width, height },
    isMobile: width < 1024,
    hasTouch: width < 1024,
  });
  await as(c, baseURL, world("hallConcurrency"), who);
  return c;
}

test.describe("Ф7b hall: two parents and B1", () => {
  test.describe.configure({ mode: "serial" });
  test.beforeEach(({}, info) => {
    needDb();
    test.skip(info.project.name !== "desktop", "own contexts; runs once");
  });

  test("мама и папа move different families at the same time; both changes stay, each sees the other's after polling", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000); // two contexts + the 8 s toast wait
    const w = world("hallConcurrency");
    const [ca, cb] = await Promise.all([
      contextFor(browser, baseURL!, "ake", 1440, 900),
      contextFor(browser, baseURL!, "ana", 1440, 900),
    ]);
    const [pa, pb] = await Promise.all([ca.newPage(), cb.newPage()]);
    // pages load one after the other (local PGlite serves one connection; the writes below are concurrent)
    await pa.goto(`/e/${w.eventId}/hall`);
    await pb.goto(`/e/${w.eventId}/hall`);
    const t1 = (await label(pa, 1).textContent()) ?? "";
    await startMove(pa, 4, kk.hall.table.move);
    await startMove(pb, 5, kk.hall.table.move);
    await pa.locator(".choose .row:visible", { hasText: "16" }).first().click();
    await pb
      .locator(".choose .row:visible", { hasText: /^\s*1-/ })
      .first()
      .click();
    await Promise.all([
      pa.getByRole("button", { name: kk.hall.move.confirm.yes }).click(),
      pb.getByRole("button", { name: kk.hall.move.confirm.yes }).click(),
    ]);
    await Promise.all([expect(pa.locator(".toast")).toBeVisible(), expect(pb.locator(".toast")).toBeVisible()]);
    // polling: a tab that becomes visible asks for the version at once (plan 7.5)
    for (const p of [pa, pb]) await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    for (const p of [pa, pb]) {
      await expect(label(p, 16)).not.toHaveText("0/12");
      await expect(label(p, 1)).not.toHaveText("5/12");
    }
    // then the mother undoes her move in the history; the father's screen shows it after polling as a toast
    // «Анасы: 1 жаңа өзгеріс» with «Тарих» (DESIGN 8.7)
    await pa.waitForTimeout(8500); // the father's own toast is gone (8 s)
    await pb.goto(`/e/${w.eventId}/hall/history`);
    await pb.locator(".he").first().getByRole("button", { name: kk.common.actions.undo }).click();
    await expect(pb.locator(".toast").last()).toBeVisible();
    await pa.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const others = pa.locator(".toast", { hasText: "Анасы" });
    await expect(others).toContainText(kk.hall.map.othersChangedAction);
    await expect(label(pa, 1)).toHaveText(t1);
    await ca.close();
    await cb.close();
  });

  test("B1: all problems + toast — ТӨР and the first row of tables visible without scrolling (360 and 320)", async ({
    browser,
    baseURL,
  }) => {
    const w = world("hallConcurrency");
    for (const [width, height] of [
      [360, 740],
      [320, 640],
    ] as const) {
      const c = await contextFor(browser, baseURL!, "ake", width, height);
      const page = await c.newPage();
      // 14 tables: some families lose their seats → unplaced (+ overflow and duplicates of the seed); saving gives
      // the toast of the hall change (B1 is checked with a toast)
      await page.goto(`/e/${w.eventId}/hall/setup?tables=14`);
      await page.getByRole("button", { name: kk.hall.setup.submit }).click();
      await page.waitForURL(/\/hall$/);
      await expect(page.locator(".chip.error")).toBeVisible();
      await expect(page.locator(".chip.dup")).toBeVisible();
      await expect(page.locator(".banner.unplaced, .chip.unplaced").first()).toBeVisible();
      await expect(page.locator(".toast")).toBeVisible();
      await page.waitForTimeout(600);
      const vh = height;
      const tor = await page.locator(".lbl-tor").boundingBox();
      expect(tor!.y + tor!.height, "ТӨР").toBeLessThanOrEqual(vh);
      const tabbar = await page.locator(".tabbar").boundingBox();
      const toast = await page.locator(".toast").boundingBox();
      const limit = Math.min(tabbar!.y, toast?.y ?? vh);
      for (const no of [1, 2, 3, 4]) {
        const b = await page.locator(`[data-table="${no}"] .disc`).boundingBox();
        expect(b!.y + b!.height, `table ${no} at ${width}`).toBeLessThanOrEqual(limit);
      }
      await noScroll(page, `B1 ${width}`);
      await c.close();
    }
  });
});
