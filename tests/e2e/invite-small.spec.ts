import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/** Ф5 review, ruling 3: the guest page on the smallest phone (project `small`, 320×640) — no horizontal scroll, targets ≥ 48 px. */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const seed = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as {
    guests: { token: string; name: string }[];
  };

async function noScroll(page: Page, where: string) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw, where).toBeLessThanOrEqual(iw);
}

async function smallTargets(page: Page, scope: string) {
  return page.evaluate((sel) => {
    const out: string[] = [];
    document.querySelectorAll<HTMLElement>(`${sel} button, ${sel} a, ${sel} input[type=number]`).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (el.offsetParent !== null && r.height > 0 && (r.height < 47.5 || r.width < 47.5))
        out.push(`${el.outerHTML.slice(0, 60)} ${r.width}×${r.height}`);
    });
    return out;
  }, scope);
}

test("guest page at 320×640: envelope, invitation and form fit; targets ≥ 48 px", async ({ page }) => {
  test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres");
  const g = seed().guests[22]!;
  await page.goto(`/i/${g.token}`);
  await noScroll(page, "envelope");
  expect(await smallTargets(page, ".scene")).toEqual([]);
  await page.getByRole("button", { name: kk.invite.envelope.open }).click();
  await expect(page.locator("html")).toHaveClass(/opened/, { timeout: 5000 });
  await noScroll(page, "invitation");
  await page.locator("#rsvp").scrollIntoViewIfNeeded();
  expect(await smallTargets(page, ".rsvp")).toEqual([]);
  await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
  await noScroll(page, "invitation at 130 %");
});
