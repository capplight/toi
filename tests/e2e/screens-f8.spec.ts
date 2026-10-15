import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, test } from "@playwright/test";
import { screenSizes, screensOut, screensTimeout } from "./screens-config";
import { world } from "./worlds";

/**
 * Ф8 handover screenshots: door helper (search, «Келді», offline, first open, revoked), table-number queue
 * (start, card, all sent), the table block on the guest page × 3 templates, the owner switch and the door link block.
 * 360 / 1440 (+320 with SCREENS_OUT), kk / ru.
 * Run: SCREENSHOTS=1 pnpm exec playwright test tests/e2e/screens-f8.spec.ts --project=desktop --workers=1 → docs/phases/F8-screens/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = screensOut("F8", "docs/phases/F8-screens");
const msgs = (l: "kk" | "ru") => JSON.parse(readFileSync(resolve(process.cwd(), `content/messages/${l}.json`), "utf8"));

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const { Client } = createRequire(import.meta.url)("pg") as typeof import("pg");
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    return (await c.query(query, params)).rows as T[];
  } finally {
    await c.end();
  }
}

async function ctx(browser: Browser, baseURL: string, locale: "kk" | "ru", w: number, h: number, session?: string) {
  const c = await browser.newContext({ baseURL, viewport: { width: w, height: h } });
  await c.addCookies([
    { name: "locale", value: locale, url: baseURL },
    ...(session ? [{ name: "toi_session", value: session, url: baseURL, httpOnly: true, secure: true }] : []),
  ]);
  await c.addInitScript(() => window.localStorage.setItem("toi.pilotBanner.dismissed", "1"));
  return c;
}

test("Ф8 handover screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(screensTimeout(600_000));
  const door = world("door");
  const queue = world("queue");
  await sql("update events set show_table_numbers = true where id = $1", [door.eventId]);
  // one family already arrived for the «Келді» state
  await sql("update families set arrived_at = now() - interval '20 minutes' where event_id = $1 and name = $2", [
    door.eventId,
    "Ербол нағашы отбасы",
  ]);

  for (const locale of ["kk", "ru"] as const) {
    const m = msgs(locale);
    for (const size of screenSizes()) {
      const sfx = `${size.name}_${locale}`;
      // door helper
      const c = await ctx(browser, baseURL!, locale, size.width, size.height);
      const p = await c.newPage();
      await p.goto(`/d/${door.doorToken}`);
      await p.locator(".door[data-ready]").waitFor();
      await p.screenshot({ path: `${OUT}/D1-saved_${sfx}.png` });
      await p.getByRole("searchbox").fill("Ер");
      await p.waitForTimeout(300);
      await p.screenshot({ path: `${OUT}/D2-search_${sfx}.png`, fullPage: size.width < 1024 });
      await p
        .locator(".res", { hasText: "Ерлан ағай отбасы" })
        .getByRole("button", { name: m.door.card.arrive })
        .click();
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}/D3-arrived-toast_${sfx}.png` });
      await c.setOffline(true);
      await p.waitForTimeout(300);
      await p
        .locator(".res", { hasText: "Ерлан ағай отбасы" })
        .getByRole("button", { name: m.door.card.unmark })
        .click();
      await p
        .locator(".res", { hasText: "Ерлан ағай отбасы" })
        .getByRole("button", { name: m.door.card.arrive })
        .click();
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}/D4-offline_${sfx}.png` });
      await p.getByRole("searchbox").fill("Ххх");
      await p.screenshot({ path: `${OUT}/D5-notfound_${sfx}.png` });
      await c.setOffline(false);
      await c.close();

      // guest page: the table block, 3 templates
      for (const tpl of ["ak-shanyrak", "kok-tun", "kyzgaldak"] as const) {
        await sql("update events set template_id = $2 where id = $1", [door.eventId, tpl]);
        const [g] = await sql<{ token: string }>(
          "select token from families where event_id = $1 and rsvp = 'yes' and table_no is not null order by table_no desc limit 1",
          [door.eventId],
        );
        const gc = await ctx(browser, baseURL!, locale, size.width, size.height);
        const gp = await gc.newPage();
        await gp.goto(`/i/${g!.token}?answered=1`);
        await gp.addStyleTag({ content: ".reveal{animation:none!important;opacity:1!important}" });
        await gp.locator("#table").scrollIntoViewIfNeeded();
        await gp.waitForTimeout(400);
        await gp.locator("#table").screenshot({ path: `${OUT}/G-table_${tpl}_${sfx}.png` });
        await gc.close();
      }
      await sql("update events set template_id = 'ak-shanyrak' where id = $1", [door.eventId]);

      // queue
      const qc = await ctx(browser, baseURL!, locale, size.width, size.height, queue.sessions.ake);
      await qc.route("https://wa.me/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "wa" }));
      const qp = await qc.newPage();
      await qp.goto(`/e/${queue.eventId}/table-queue`);
      await qp.screenshot({ path: `${OUT}/Q1-start_${sfx}.png` });
      await qp.getByRole("button", { name: m.tableQueue.start }).click();
      await qp.waitForTimeout(300);
      await qp.screenshot({ path: `${OUT}/Q2-card_${sfx}.png`, fullPage: size.width < 1024 });
      await qp.getByRole("button", { name: m.tableQueue.stop }).click();
      // owner settings: the switch and the door block
      await qp.goto(`/e/${queue.eventId}/settings`);
      await qp.screenshot({ path: `${OUT}/S-settings_${sfx}.png`, fullPage: true });
      await qp.goto(`/e/${queue.eventId}/settings/members`);
      await qp.screenshot({ path: `${OUT}/S-members-door_${sfx}.png`, fullPage: true });
      await qc.close();
    }
  }
  // first open without network; revoked link (kk, 360)
  const fc = await ctx(browser, baseURL!, "kk", 360, 740);
  await fc.route("**/api/door/**", (r) => r.abort("internetdisconnected"));
  const fp = await fc.newPage();
  await fp.goto(`/d/${door.doorToken}`);
  await fp.waitForTimeout(800);
  await fp.screenshot({ path: `${OUT}/D6-first-offline_360_kk.png` });
  await fc.close();
  const rc = await ctx(browser, baseURL!, "kk", 360, 740);
  const rp = await rc.newPage();
  await rp.goto(`/d/${"Z".repeat(22)}`);
  await rp.waitForTimeout(800);
  await rp.screenshot({ path: `${OUT}/D7-revoked_360_kk.png` });
  await rc.close();
  // queue: all sent
  await sql("update families set table_sent_at = now() where event_id = $1", [queue.eventId]);
  const ac = await ctx(browser, baseURL!, "kk", 360, 740, queue.sessions.ake);
  const ap = await ac.newPage();
  await ap.goto(`/e/${queue.eventId}/table-queue`);
  await ap.screenshot({ path: `${OUT}/Q3-all-sent_360_kk.png` });
  await ac.close();
});
