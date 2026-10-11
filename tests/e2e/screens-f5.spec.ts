import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { type Browser, type Page, test } from "@playwright/test";

/**
 * Ф5 handover screenshots (brief §6): the three templates × envelope / opened invitation / answer form / answered /
 * closed / form error; 360 and 1440, kk and ru; 130 % at 360. Not visual regression.
 * Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f5.spec.ts --project=desktop --workers=1 → docs/phases/F5-screens/
 * (switches the seeded event's template directly in the test database).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = "docs/phases/F5-screens";
const seed = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as {
    eventId: string;
    guests: { token: string; name: string }[];
  };
const TEMPLATES = ["ak-shanyrak", "kok-tun", "kyzgaldak"] as const;
const SIZES = [
  { name: "360", width: 360, height: 740 },
  { name: "1440", width: 1440, height: 900 },
];

async function sql(query: string, params: unknown[]) {
  const { Client } = createRequire(import.meta.url)("pg") as typeof import("pg");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query(query, params);
  } finally {
    await c.end();
  }
}

const showAll = (p: Page) =>
  p.addStyleTag({
    content: ".reveal{animation:none!important;opacity:1!important}.paused,*{animation-play-state:running}",
  });

async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

async function ctx(browser: Browser, baseURL: string, locale: "kk" | "ru", size: (typeof SIZES)[number], js = true) {
  const c = await browser.newContext({
    baseURL,
    viewport: { width: size.width, height: size.height },
    javaScriptEnabled: js,
  });
  await c.addCookies([{ name: "locale", value: locale, url: baseURL }]);
  return c;
}

test("Ф5 handover screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(900_000);
  const { eventId, guests } = seed();
  let n = 0;
  const next = () => guests[n++ % guests.length]!;
  for (const tpl of TEMPLATES) {
    await sql("update events set template_id = $1, rsvp_closes_at = null where id = $2", [tpl, eventId]);
    for (const locale of ["kk", "ru"] as const) {
      for (const size of SIZES) {
        const sfx = `${tpl}_${size.name}_${locale}`;
        const g = next();
        await sql(
          "update families set rsvp='pending', confirmed_count=null, responded_at=null, answered_by=null where token=$1",
          [g.token],
        );
        const c = await ctx(browser, baseURL!, locale, size);
        const page = await c.newPage();
        // 1. envelope
        await page.goto(`/i/${g.token}`);
        await shot(page, `G1-envelope_${sfx}`);
        // 2–3. opened invitation (top, full)
        await page.locator("#open").click();
        await page.waitForTimeout(3200);
        await shot(page, `G3-invitation_${sfx}`);
        await showAll(page);
        if (size.name === "360") await shot(page, `G3-invitation_${sfx}_full`, true);
        // 4. the answer form
        await page.locator("#rsvp").scrollIntoViewIfNeeded();
        await shot(page, `G4-form_${sfx}`);
        // 5. answered
        await page.locator("#seats").fill("4");
        await page.locator("form.rsvp [type=submit]").click();
        await page.waitForURL(/answered=1/);
        await showAll(page);
        await page.locator("#rsvp").scrollIntoViewIfNeeded();
        await shot(page, `G5-answered_${sfx}`);
        await c.close();
        // 7. form error without JS (seats out of range → the page with the message)
        const g2 = next();
        await sql(
          "update families set rsvp='pending', confirmed_count=null, responded_at=null, answered_by=null where token=$1",
          [g2.token],
        );
        const noJs = await ctx(browser, baseURL!, locale, size, false);
        const p2 = await noJs.newPage();
        await p2.goto(`/i/${g2.token}`);
        await p2.locator("#seats").fill("45");
        await p2.locator("form.rsvp [type=submit]").click();
        await p2.locator(".rsvp .err").scrollIntoViewIfNeeded();
        await shot(p2, `G7-error_${sfx}`);
        await noJs.close();
      }
    }
    // 6. closed (answers after rsvp_closes_at)
    await sql("update events set rsvp_closes_at = now() - interval '1 hour' where id = $1", [eventId]);
    for (const size of SIZES) {
      const c = await ctx(browser, baseURL!, "kk", size);
      const page = await c.newPage();
      await page.goto(`/i/${next().token}?answered=1`);
      await showAll(page);
      await page.locator("#rsvp").scrollIntoViewIfNeeded();
      await shot(page, `G6-closed_${tpl}_${size.name}_kk`);
      await c.close();
    }
    await sql("update events set rsvp_closes_at = null where id = $1", [eventId]);
    // 130 % at 360
    const c = await ctx(browser, baseURL!, "kk", SIZES[0]!);
    const page = await c.newPage();
    const g = next();
    await page.goto(`/i/${g.token}`);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await shot(page, `G1-envelope_${tpl}_360_kk_130`);
    await page.locator("#open").click();
    await page.waitForTimeout(3200);
    await showAll(page);
    await page.locator("#rsvp").scrollIntoViewIfNeeded();
    await shot(page, `G4-form_${tpl}_360_kk_130`);
    await c.close();
  }
  await sql("update events set template_id = 'ak-shanyrak' where id = $1", [eventId]);
});
