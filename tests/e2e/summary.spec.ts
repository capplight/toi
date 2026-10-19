import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type World, world } from "./worlds";

/**
 * Ф6 «Қорытынды» (brief §3): owner and «Жастар», kk and ru, 360 and 1440 (projects), a guest answer through
 * `/i/{token}` reaches the screen by polling, axe, 130 %, 320 px. Reads world `base` (the seed exactly as in
 * design_spec 5.2, Ф6 review П1); the polling test writes, so it answers in its own world `summaryLive`.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const ru = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/ru.json"), "utf8"));
const seed = () => world("base");
const needDb = () => test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres: set DATABASE_URL.");

async function as(
  context: BrowserContext,
  baseURL: string,
  who: "ake" | "jas",
  locale: "kk" | "ru" = "kk",
  w: World = seed(),
) {
  await context.addCookies([
    { name: "toi_session", value: w.sessions[who], url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: locale, url: baseURL },
  ]);
}

/** «Келмейді · 4 отбасы» → 4 */
const count = async (page: Page, kind: "yes" | "inv" | "no") =>
  Number((await page.locator(`.sum-tile.${kind} .val .num`).first().innerText()).replace(/\D/g, ""));

async function noScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw, where).toBeLessThanOrEqual(iw);
}

test.describe("Ф6 summary", () => {
  test.beforeEach(() => needDb());

  test("owner (kk): restaurant line, three tiles with «not sent», categories, funnel with hint, lists, budget entry", async ({
    page,
    context,
    baseURL,
  }, info) => {
    await as(context, baseURL!, "ake");
    await page.goto(`/e/${seed().eventId}/summary`);
    await expect(page.locator(".sum-main .line")).toHaveText("Мейрамханаға: 173 адам → 15 үстел");
    await expect(page.locator(".sum-main")).toHaveAttribute("aria-label", "Мейрамханаға: 173 адам, 15 үстел");
    await expect(page.locator(".sum-tile.yes")).toContainText(/Келеді\s*53 отбасы\s*150 орын/);
    await expect(page.locator(".sum-tile.inv")).toContainText(/Жауап жоқ\s*9 отбасы\s*~23 орын/);
    await expect(page.locator(".sum-tile.inv .note")).toHaveText(
      kk.summary.tiles.pendingNotSent.replace("{count}", "2"),
    );
    await expect(page.locator(".sum-tile.no")).toContainText(/Келмейді\s*3 отбасы/);
    await expect(page.getByRole("heading", { name: kk.summary.byCategory.title })).toBeVisible();
    await expect(page.locator(".sum-bars").first().locator("li").first()).toContainText("Құдалар · 28 орын");
    await expect(page.getByRole("heading", { name: kk.summary.funnel.title })).toBeVisible();
    await expect(page.getByText(kk.summary.funnel.hint)).toBeVisible();
    const lists = page.getByRole("navigation", { name: kk.summary.byList.title });
    await expect(lists.locator(".link-row")).toHaveCount(3);
    await expect(lists.locator(".link-row").first()).toContainText("Әкесі · Серік");
    await expect(lists.locator(".link-row").nth(1)).toContainText("Анасы · Гүлжан");
    await expect(lists.locator(".link-row").nth(2)).toContainText("Жастар · Айбек, Дана");
    await lists.locator(".link-row").nth(1).click();
    await expect(page).toHaveURL(/\/guests\?list=/);
    await page.goBack();
    const budget = page.locator(".summary .link-row[href$='/budget']");
    if (info.project.name === "mobile") await expect(budget).toBeVisible();
    else await expect(budget).toBeHidden(); // desktop: in the sidebar
  });

  test("«Жастар» (ru): no funnel, no «Расходы»; numbers in ru plural forms", async ({ page, context, baseURL }) => {
    await as(context, baseURL!, "jas", "ru");
    await page.goto(`/e/${seed().eventId}/summary`);
    await expect(page.locator(".sum-main .line")).toHaveText("Для ресторана: 173 человека → 15 столов");
    await expect(page.getByRole("heading", { name: ru.summary.byCategory.title })).toBeVisible();
    await expect(page.getByRole("heading", { name: ru.summary.funnel.title })).toHaveCount(0);
    await expect(page.getByText(ru.summary.funnel.hint)).toHaveCount(0);
    await expect(page.locator(".summary a[href$='/budget']")).toHaveCount(0);
    await expect(page.locator(".sum-tile.inv .note")).toHaveText(
      ru.summary.tiles.pendingNotSent.replace("{count}", "2"),
    );
  });

  test("a guest answer through /i/{token} changes the numbers after polling (≤ 15 s)", async ({
    page,
    context,
    baseURL,
    browser,
  }, info) => {
    test.setTimeout(60_000);
    const live = world("summaryLive");
    await as(context, baseURL!, "ake", "kk", live);
    await page.goto(`/e/${live.eventId}/summary`);
    const no0 = await count(page, "no");
    const g = live.guests[info.project.name === "desktop" ? 1 : 0]!;
    const guest = await browser.newContext({ baseURL });
    const gp = await guest.newPage();
    await gp.goto(`/i/${g.token}?answered=1`);
    await gp.getByLabel(kk.invite.rsvp.no).check();
    await gp.getByRole("button", { name: kk.invite.rsvp.submit }).click();
    await expect(gp).toHaveURL(/answered=1/);
    await guest.close();
    await expect.poll(() => count(page, "no"), { timeout: 25_000, intervals: [1000] }).toBe(no0 + 1);
  });

  test("axe without serious/critical; 130 % and 320 px without horizontal scroll", async ({
    page,
    context,
    baseURL,
  }, info) => {
    await as(context, baseURL!, "ake");
    await page.goto(`/e/${seed().eventId}/summary`);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await noScroll(page, "130 %");
    if (info.project.name === "mobile") {
      await page.setViewportSize({ width: 320, height: 640 });
      await noScroll(page, "320 px at 130 %");
      await page.reload();
      await noScroll(page, "320 px");
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>(".summary a, .summary button")]
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.height < 47.5)
          .map((b) => `${b.width}×${b.height}`),
      );
      expect(small).toEqual([]);
    }
  });
});
