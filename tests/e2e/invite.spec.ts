import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Ф5 guest page `/i/{token}` (brief §3.5): envelope → «Ашу» → invitation → answer → «Рақмет»; answer without JS;
 * change of answer; repeat visit without the scene; lite / reduced motion; axe; 130 %; weight and JS budget.
 * Every test uses its own family (per project) from the seeded event.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const ru = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/ru.json"), "utf8"));
const seed = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as {
    eventId: string;
    sessions: Record<string, string>;
    guests: { token: string; name: string }[];
  };
const needDb = () =>
  test.skip(
    !process.env.DATABASE_URL && !process.env.CI,
    "No Postgres: set DATABASE_URL (e.g. pnpm db:local --memory).",
  );

/** n-th family for this test and project (mobile: 0–9, desktop: 10–19). */
function guest(project: string, n: number) {
  const g = seed().guests[(project === "desktop" ? 10 : 0) + n];
  if (!g) throw new Error("not enough pending families in the seed");
  return g;
}

async function openEnvelope(page: Page) {
  await page.getByRole("button", { name: kk.invite.envelope.open }).click();
  await expect(page.locator("html")).toHaveClass(/opened/, { timeout: 5000 });
}

test.describe("Ф5 guest page", () => {
  test.beforeEach(() => needDb());

  test("envelope → «Ашу» → invitation → «Келеміз» → «Рақмет»; repeat visit has no scene; change the answer", async ({
    page,
  }, info) => {
    const g = guest(info.project.name, 0);
    await page.goto(`/i/${g.token}`);
    await expect(page.locator(".env-to")).toHaveText(g.name);
    await expect(page.getByText(kk.invite.envelope.headline)).toBeVisible();
    await openEnvelope(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Айбек");
    await expect(page.getByText(kk.invite.greeting.replace("{familyName}", g.name))).toBeVisible();
    await page.locator("#rsvp").scrollIntoViewIfNeeded();
    await page.getByLabel(kk.invite.rsvp.yes).check();
    await page.locator("#seats").fill("3");
    await page.getByRole("button", { name: kk.invite.rsvp.submit }).click();
    await expect(page).toHaveURL(/answered=1/);
    await expect(page.getByText(kk.invite.thanks.yesTitle)).toBeVisible();
    await expect(page.getByText(kk.invite.thanks.yesSummary.replace("{seats}", "3"))).toBeVisible();
    // repeat visit: straight to the invitation
    await page.goto(`/i/${g.token}`);
    await expect(page.locator(".scene")).toHaveCount(0);
    await expect(page.getByText(kk.invite.thanks.yesTitle)).toBeVisible();
    // change the answer
    await page.getByRole("link", { name: kk.invite.thanks.change }).click();
    await page.getByLabel(kk.invite.rsvp.no).check();
    await expect(page.locator(".seats")).toBeHidden();
    await page.getByRole("button", { name: kk.invite.rsvp.submit }).click();
    await expect(page.getByText(kk.invite.thanks.noTitle)).toBeVisible();
  });

  test("the answer works without JavaScript (plain form POST → 303)", async ({ browser, baseURL }, info) => {
    const g = guest(info.project.name, 1);
    const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(`/i/${g.token}`);
    // <noscript> hides the envelope; the invitation and the form are there
    await expect(page.locator(".scene")).toBeHidden();
    await expect(page.getByRole("button", { name: kk.invite.rsvp.submit })).toBeVisible();
    await page.getByLabel(kk.invite.rsvp.no).check();
    await page.getByRole("button", { name: kk.invite.rsvp.submit }).click();
    await expect(page).toHaveURL(/answered=1/);
    await expect(page.getByText(kk.invite.thanks.noTitle)).toBeVisible();
    await ctx.close();
  });

  test("the owner sees the guest's answer at once (S1)", async ({ page, context, baseURL }, info) => {
    const g = guest(info.project.name, 2);
    await page.goto(`/i/${g.token}`);
    await openEnvelope(page);
    await page.getByLabel(kk.invite.rsvp.yes).check();
    await page.locator("#seats").fill("2");
    await page.getByRole("button", { name: kk.invite.rsvp.submit }).click();
    await expect(page).toHaveURL(/answered=1/);
    await context.addCookies([
      { name: "toi_session", value: seed().sessions.ake!, url: baseURL!, httpOnly: true, secure: true },
      { name: "locale", value: "kk", url: baseURL! },
    ]);
    // the family is in Анасы's or Жастар's list («Басқа тізімдер»): search there (search sees the whole list)
    await page.goto(`/e/${seed().eventId}/guests`);
    const lists = await page
      .locator(".other-lists a.link-row")
      .evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
    let found = false;
    for (const href of lists) {
      await page.goto(href);
      await page.getByRole("searchbox").fill(g.name);
      const card = page.locator(".guest", { hasText: g.name });
      await page.waitForTimeout(300);
      if ((await card.count()) > 0) {
        await expect(card.first()).toContainText(kk.common.status.yesWithSeats.replace("{seats}", "2"));
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  test("ru, lite under reduced motion, axe on envelope and invitation, 130 % without horizontal scroll", async ({
    page,
    context,
    baseURL,
  }, info) => {
    const g = guest(info.project.name, 3);
    await context.addCookies([{ name: "locale", value: "ru", url: baseURL! }]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/i/${g.token}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.locator("html")).toHaveClass(/lite/);
    await expect(page.getByText(ru.invite.envelope.headline)).toBeVisible();
    const check = async () => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      return r.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id} ${v.nodes[0]?.target}`);
    };
    expect(await check()).toEqual([]);
    await page.getByRole("button", { name: ru.invite.envelope.open }).click();
    await expect(page.locator("html")).toHaveClass(/opened/);
    expect(await check()).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);
  });

  test("budget: no React or external scripts; JS ≤ 15 KB; everything before music ≤ 150 KB", async ({ page }, info) => {
    const g = guest(info.project.name, 4);
    const sizes: { url: string; type: string; bytes: number }[] = [];
    page.on("response", async (r) => {
      const b = await r.body().catch(() => Buffer.alloc(0));
      sizes.push({
        url: r.url(),
        type: r.request().resourceType(),
        bytes: Number(r.headers()["content-length"] ?? b.length),
      });
    });
    await page.goto(`/i/${g.token}`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const scripts = sizes.filter((s) => s.type === "script");
    expect(scripts.map((s) => s.url)).toEqual([]); // the island is inline
    const inline = await page.evaluate(() => Array.from(document.scripts).reduce((n, s) => n + s.text.length, 0));
    expect(inline).toBeLessThan(15_000);
    const total = sizes.filter((s) => s.type !== "media").reduce((n, s) => n + s.bytes, 0);
    console.log(
      `guest page: ${sizes.length} requests, ${Math.round(total / 1024)} KB transferred before music; inline JS ${inline} B`,
    );
    expect(total).toBeLessThan(150 * 1024);
  });

  test("unknown token → 404 without details; headers", async ({ request }) => {
    const r = await request.get("/i/AAAAAAAAAAAAAAAAAAAAAA");
    expect(r.status()).toBe(404);
    expect(await r.text()).toContain(kk.invite.notFound.title);
    const ok = await request.get(`/i/${seed().guests[19]!.token}`);
    expect(ok.headers()["cache-control"]).toBe("private, no-store");
    expect(ok.headers()["x-robots-tag"]).toContain("noindex");
    expect(ok.headers()["content-security-policy"]).toMatch(/script-src 'nonce-/);
    const og = await request.get(`/i/${seed().guests[19]!.token}/opengraph-image`);
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toBe("image/png");
    expect((await og.body()).length).toBeLessThan(300 * 1024);
  });
});
