import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

/** RA Л5: /privacy and /terms — drafts of the content lead, language from the `locale` cookie, public, no JS. */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const ru = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/ru.json"), "utf8"));

async function noScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
}

for (const [locale, m] of [
  ["kk", kk],
  ["ru", ru],
] as const) {
  test(`/privacy and /terms in ${locale}: draft plate, lawyer notes, table, links; axe; 130 %`, async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "locale", value: locale, url: baseURL! }]);
    await page.goto("/privacy");
    await expect(page).toHaveTitle(new RegExp(m.legal.privacy.title));
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.locator("article.legal-doc h1")).toBeVisible();
    await expect(page.locator("blockquote.draft")).toBeVisible();
    await expect(page.locator("mark.lawyer").first()).toContainText("[ЮРИСТ");
    await expect(page.locator(".legal-doc table")).toBeVisible();
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await noScroll(page);
    await page.getByRole("link", { name: m.legal.terms.title, exact: true }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.locator("blockquote.draft")).toBeVisible();
    await expect(page.getByRole("link", { name: m.legal.privacy.title, exact: true })).toBeVisible();
  });
}

test("works without JavaScript and without a session", async ({ browser, baseURL }) => {
  const c = await browser.newContext({ baseURL, javaScriptEnabled: false });
  const page = await c.newPage();
  const res = await page.goto("/terms");
  expect(res?.status()).toBe(200);
  await expect(page.locator("article.legal-doc h1")).toBeVisible();
  await c.close();
});
