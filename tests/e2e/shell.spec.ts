import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BrowserContext, expect, test } from "@playwright/test";

/**
 * Ф1 criterion 3: the event frame in three navigation modes, «Шығындар» only with the right, language only
 * via «⋯ Той мәзірі», the pilot banner only for the owner. Needs the seeded DB (sessions from global setup).
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const seed = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as {
    eventId: string;
    sessions: Record<"ake" | "jas", string>;
  };
const needDb = () =>
  test.skip(
    !process.env.DATABASE_URL && !process.env.CI,
    "No Postgres: set DATABASE_URL (e.g. pnpm db:local --memory).",
  );

async function loginAs(context: BrowserContext, baseURL: string, who: "ake" | "jas") {
  await context.addCookies([
    { name: "toi_session", value: seed().sessions[who], url: baseURL, httpOnly: true, secure: true },
  ]);
}

test.describe("Ф1 event frame", () => {
  test("three navigation modes: tabs < 768, rail 104 at 768–1279, sidebar 272 at ≥ 1280", async ({
    page,
    context,
    baseURL,
  }) => {
    needDb();
    await loginAs(context, baseURL!, "ake");
    const { eventId } = seed();
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/e/${eventId}/guests`);
    await expect(page.locator(".tabbar")).toBeVisible();
    await expect(page.locator(".tabbar a")).toHaveCount(3);
    await expect(page.locator(".sidebar")).toBeHidden();
    await expect(page.getByRole("link", { name: kk.nav.guests }).last()).toHaveAttribute("aria-current", "page");

    await page.setViewportSize({ width: 800, height: 900 });
    await expect(page.locator(".tabbar")).toBeHidden();
    expect((await page.locator(".sidebar").boundingBox())!.width).toBeCloseTo(104, 0);

    await page.setViewportSize({ width: 1440, height: 900 });
    expect((await page.locator(".sidebar").boundingBox())!.width).toBeCloseTo(272, 0);
    await expect(page.locator(".sidebar .event-mini")).toContainText("Айбек пен Дана");
  });

  test("«Шығындар»: owner sees it (rail + card on «Қорытынды»); Жастар do not, /budget is 404", async ({
    page,
    context,
    baseURL,
  }) => {
    needDb();
    const { eventId } = seed();
    await loginAs(context, baseURL!, "ake");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/e/${eventId}/guests`);
    await expect(page.locator(".sidebar").getByRole("link", { name: kk.nav.budget })).toBeVisible();
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/e/${eventId}/summary`);
    await expect(page.locator("main").getByRole("link", { name: kk.nav.budget })).toBeVisible();

    await context.clearCookies();
    await loginAs(context, baseURL!, "jas");
    await page.goto(`/e/${eventId}/summary`);
    await expect(page.getByRole("link", { name: kk.nav.budget })).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/e/${eventId}/guests`);
    await expect(page.getByRole("link", { name: kk.nav.budget })).toHaveCount(0);
    const res = await page.goto(`/e/${eventId}/budget`);
    expect(res?.status()).toBe(404);
  });

  test("language only via «⋯ Той мәзірі»; pilot banner only for the owner", async ({ page, context, baseURL }) => {
    needDb();
    const { eventId } = seed();
    await loginAs(context, baseURL!, "ake");
    await page.goto(`/e/${eventId}/guests`);
    await expect(page.locator(".lang")).toHaveCount(0); // no visible ҚАЗ | РУС on working screens
    await expect(page.getByText(kk.legal.pilotBanner)).toBeVisible();
    await page.getByRole("button", { name: kk.nav.eventMenu }).filter({ visible: true }).first().click();
    await page.getByRole("button", { name: kk.common.lang.ruFull }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page.keyboard.press("Escape");
    // back to kk for the other tests of this browser context
    await context.addCookies([{ name: "locale", value: "kk", url: baseURL! }]);

    await context.clearCookies();
    await loginAs(context, baseURL!, "jas");
    await page.goto(`/e/${eventId}/guests`);
    await expect(page.getByText(kk.legal.pilotBanner)).toHaveCount(0);
  });

  test("axe on the frame (guests, summary) — no serious/critical", async ({ page, context, baseURL }) => {
    needDb();
    const { eventId } = seed();
    await loginAs(context, baseURL!, "ake");
    for (const p of ["guests", "summary"]) {
      await page.goto(`/e/${eventId}/${p}`);
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${p}: ${v.id}`)).toEqual([]);
    }
  });
});
