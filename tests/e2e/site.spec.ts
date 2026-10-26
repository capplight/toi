import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Public SEO site `/kk/**`, `/ru/**` (docs/phases/SITE-handover.md). No database needed: every page is static.
 * Expected UI strings are read from content/messages (decision Д5), page texts — from content/site frontmatter.
 */
type Tree = { [k: string]: string | Tree };
const read = (lang: "kk" | "ru") =>
  JSON.parse(readFileSync(resolve(process.cwd(), "content/messages", `${lang}.json`), "utf8")) as Tree;
const get = (m: Tree, path: string) => path.split(".").reduce<string | Tree>((o, k) => (o as Tree)[k]!, m) as string;
const kkM = read("kk");
const ruM = read("ru");
const kk = (path: string) => get(kkM, path);
const ru = (path: string) => get(ruM, path);

const PAGES = [
  "/kk",
  "/ru",
  "/kk/tilekter",
  "/kk/tilekter/sundet-toi",
  "/kk/shaqyru/qyz-uzatu",
  "/ru/priglashenie",
  "/ru/rassadka-gostei",
];

async function ldTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((b) => {
    const j = JSON.parse(b);
    return (Array.isArray(j) ? j : [j]).map((x: { "@type": string }) => x["@type"]);
  });
}

test.describe("public site", () => {
  test("/ redirects to the site home by language", async ({ page, context, baseURL }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/kk$/);
    await context.addCookies([{ name: "locale", value: "ru", url: baseURL! }]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/ru$/);
  });

  for (const path of PAGES) {
    test(`${path}: renders, one H1, no horizontal scroll at 320/360, no serious axe issues`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status()).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", path.slice(1, 3));
      await expect(page.locator("h1")).toHaveCount(1);
      for (const width of [320, 360]) {
        await page.setViewportSize({ width, height: 740 });
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        expect(sw, `scrollWidth at ${width}`).toBeLessThanOrEqual(width);
      }
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }

  test("SEO head: canonical, hreflang pair, robots, JSON-LD", async ({ page }) => {
    await page.goto("/kk");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/kk$/);
    await expect(page.locator('link[rel="alternate"][hreflang="kk-KZ"]')).toHaveAttribute("href", /\/kk$/);
    await expect(page.locator('link[rel="alternate"][hreflang="ru-KZ"]')).toHaveAttribute("href", /\/ru$/);
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/kk$/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /^index/);
    expect(await ldTypes(page)).toEqual(expect.arrayContaining(["Organization", "WebSite", "FAQPage"]));

    await page.goto("/kk/tilekter/sundet-toi");
    expect(await ldTypes(page)).toEqual(expect.arrayContaining(["BreadcrumbList", "FAQPage", "Article"]));
    // no published ru pair → no hreflang at all
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  });

  test("breadcrumbs match BreadcrumbList", async ({ page }) => {
    await page.goto("/kk/tilekter/sundet-toi");
    const crumbs = page.getByRole("navigation", { name: kk("site.crumbs") });
    await expect(crumbs.getByRole("link", { name: kk("site.home") })).toHaveAttribute("href", "/kk");
    await expect(crumbs.locator('[aria-current="page"]')).toBeVisible();
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    const list = (Array.isArray(ld) ? ld : [ld]).find((x: { "@type": string }) => x["@type"] === "BreadcrumbList");
    expect(list.itemListElement.map((i: { name: string }) => i.name)).toEqual(
      await crumbs.locator("li").allInnerTexts(),
    );
  });

  test("language switch leads to the paired page and sets the locale cookie", async ({ page, context }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/ru/priglashenie");
    await page
      .locator("header .lang")
      .getByRole("link", { name: ru("common.lang.kkFull") })
      .click();
    // /kk/shaqyru is not published yet (needs_fix) → nearest published kk page
    await expect(page).toHaveURL(/\/kk(\/|$)/);
    expect((await context.cookies()).find((c) => c.name === "locale")?.value).toBe("kk");
    await page.goto("/kk");
    await page
      .locator("header .lang")
      .getByRole("link", { name: kk("common.lang.ruFull") })
      .click();
    await expect(page).toHaveURL(/\/ru$/);
  });

  test("FAQ works without JS-only controls (details/summary)", async ({ page }) => {
    await page.goto("/kk/tilekter/sundet-toi");
    const first = page.locator(".faq details").first();
    await expect(first).not.toHaveAttribute("open", "");
    await first.locator("summary").click();
    await expect(first).toHaveAttribute("open", "");
    await expect(first.locator(".ans")).toBeVisible();
  });

  test("tilek: copy shows the toast, filter narrows the list", async ({ page, context, browserName }) => {
    test.skip(browserName !== "chromium", "clipboard permissions");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/kk/tilekter/sundet-toi");
    const card = page.locator("#t1");
    await card.getByRole("button", { name: kk("site.tilek.copy") }).click();
    await expect(page.locator("#toast")).toContainText(kk("site.toast.copied"));
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe((await card.locator(".tcard-text").innerText()).trim());

    const all = await page.locator(".tcard[data-who]:visible").count();
    expect(all).toBe(60);
    await page.locator("details.filter").evaluate((d) => ((d as HTMLDetailsElement).open = true));
    await page.locator('[data-f="len:uzaq"]').click();
    const shown = await page.locator(".tcard[data-who]:visible").count();
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(all);
  });

  test("WhatsApp link carries the card URL without JS", async ({ page }) => {
    await page.goto("/kk/tilekter/sundet-toi");
    const href = await page.locator("#t1 [data-wa]").getAttribute("href");
    expect(decodeURIComponent(href!)).toMatch(/\/kk\/tilekter\/sundet-toi\?utm_source=tilek_share#t1$/);
  });

  test("publication gate: unpublished page opens with noindex, is not linked and not in the sitemap", async ({
    page,
    request,
  }) => {
    const res = await page.goto("/kk/dastur/betashar"); // needs_tradition_review
    expect(res?.status()).toBe(200);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await page.goto("/kk");
    await expect(page.locator('a[href="/kk/dastur/betashar"], a[href="/kk/dastur"]')).toHaveCount(0);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/kk/tilekter/sundet-toi</loc>");
    expect(sitemap).not.toContain("/kk/dastur/betashar");
    expect(sitemap).not.toContain("/kk/baga");
  });

  test("404 (kk + ru text); demo invitation is static and noindex", async ({ page, request }) => {
    const res = await page.goto("/kk/nesushestvuet");
    expect(res?.status()).toBe(404);
    await expect(page.locator("h1")).toHaveText(kk("site.notFound.title"));
    await expect(page.locator('[lang="ru"] h2')).toHaveText(ru("site.notFound.title"));
    const ruRes = await page.goto("/ru/net-takoi");
    expect(ruRes?.status()).toBe(404);
    const demo = await request.get("/kk/shaqyru/ulgi/ak-shanyraq/demo");
    expect(demo.status()).toBe(200);
    expect(demo.headers()["x-robots-tag"]).toContain("noindex");
    const html = await demo.text();
    expect(html).not.toMatch(/\+7\d{10}|\/i\/[A-Za-z0-9_-]{16,}/);
  });

  test("first screen: no images above the fold on the phone, CTA leads to the app", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/kk");
    const imgsAbove = await page.evaluate(
      () => [...document.images].filter((i) => i.getBoundingClientRect().top < innerHeight && i.offsetParent).length,
    );
    expect(imgsAbove).toBe(0);
    const cta = page.locator("[data-hero-cta] a").first();
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toMatch(/^\/(login|e\/new)/);
  });
});
