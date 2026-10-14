import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф8 (brief §4): the door helper offline (service worker + IndexedDB), two devices converge; the table-number
 * queue (wa.me link → «Жіберілді» → table_sent_at); the table block and mini-map on the guest page (360 / 320 /
 * 1440, Ф5 budget); axe and 130 %. Worlds `door` and `queue` — nothing else writes there.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const needDb = () => test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres: set DATABASE_URL.");

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

async function noScroll(page: Page) {
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
  expect(sw).toBeLessThanOrEqual(iw);
}

async function openDoor(page: Page, token: string) {
  await page.goto(`/d/${token}`);
  await expect(page.locator(".door[data-ready]")).toBeVisible({ timeout: 15_000 });
  // the service worker took the page and cached what it loaded
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null, null, { timeout: 15_000 });
  await page.waitForFunction(async (p) => Boolean(await caches.match(location.origin + p)), `/d/${token}`, {
    timeout: 15_000,
    polling: 500,
  });
}

test.describe("Ф8 door helper", () => {
  test.beforeEach(() => needDb());

  test("offline: search by 2 letters → «Келді» → reload offline → back online the mark reaches the database", async ({
    page,
    context,
  }, info) => {
    test.skip(info.project.name !== "mobile", "one device flow per run (the database is shared by projects)");
    test.setTimeout(90_000);
    const w = world("door");
    await openDoor(page, w.doorToken);
    await expect(page.getByText(kk.door.saveHint)).toBeVisible();

    await context.setOffline(true);
    await expect(page.locator(".net.off")).toBeVisible();
    await page.getByRole("searchbox").fill("ерл");
    const card = page.locator(".res", { hasText: "Ерлан ағай отбасы" });
    await expect(card.locator("mark")).toHaveText("Ерл");
    await card.getByRole("button", { name: kk.door.card.arrive }).click();
    await expect(card).toHaveClass(/arrived/);
    await expect(card.getByText(kk.door.card.pendingSync)).toBeVisible();
    await expect(page.locator(".door-toast")).toContainText("Ерлан ағай отбасы");
    // the toast is at the top, not over the results
    const toastBox = (await page.locator(".door-toast").boundingBox())!;
    expect(toastBox.y).toBeLessThan(100);

    // reload without network: the service worker serves the page, IndexedDB keeps the mark and the outbox
    await page.reload();
    await expect(page.locator(".door[data-ready]")).toBeVisible();
    await page.getByRole("searchbox").fill("Ерлан");
    await expect(page.locator(".res.arrived", { hasText: "Ерлан ағай отбасы" })).toBeVisible();
    await expect(page.locator(".net.off")).toContainText("1");

    await context.setOffline(false);
    await expect
      .poll(
        async () =>
          (
            await sql<{ a: Date | null }>("select arrived_at as a from families where event_id = $1 and name = $2", [
              w.eventId,
              "Ерлан ағай отбасы",
            ])
          )[0]?.a,
        { timeout: 40_000 },
      )
      .not.toBeNull();
    await expect(page.locator(".net.off")).toHaveCount(0);
  });

  test("two devices: a mark on one reaches the other after its sync", async ({ browser, baseURL }, info) => {
    test.skip(info.project.name !== "desktop", "second device flow runs once");
    test.setTimeout(90_000);
    const w = world("door");
    const a = await browser.newContext({ baseURL });
    const b = await browser.newContext({ baseURL });
    const pa = await a.newPage();
    const pb = await b.newPage();
    await openDoor(pa, w.doorToken);
    await openDoor(pb, w.doorToken);
    await pa.getByRole("searchbox").fill("Күләш");
    await pa.locator(".res", { hasText: "Күләш апай" }).getByRole("button", { name: kk.door.card.arrive }).click();
    await expect(pa.locator(".net .spin")).toHaveCount(0, { timeout: 15_000 });
    // device B: reload (sync on open) and look
    await pb.reload();
    await pb.getByRole("searchbox").fill("Күләш");
    await expect(pb.locator(".res.arrived", { hasText: "Күләш апай" })).toBeVisible({ timeout: 20_000 });
    // B removes the mark later; A converges after its sync
    await pb.locator(".res", { hasText: "Күләш апай" }).getByRole("button", { name: kk.door.card.unmark }).click();
    await expect(pb.locator(".res.arrived", { hasText: "Күләш апай" })).toHaveCount(0);
    await expect(pb.locator(".net .spin")).toHaveCount(0, { timeout: 15_000 });
    await pa.reload();
    await pa.getByRole("searchbox").fill("Күләш");
    await expect(
      pa.locator(".res", { hasText: "Күләш апай" }).getByRole("button", { name: kk.door.card.arrive }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await a.close();
    await b.close();
  });

  test("first open without network → «бірінші рет ашу үшін интернет керек»; rotated link → «сілтеме жабылды»", async ({
    browser,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== "mobile", "once");
    const c = await browser.newContext({ baseURL });
    const p = await c.newPage();
    // the page itself comes from the server, the snapshot request fails
    await c.route("**/api/door/**", (r) => r.abort("internetdisconnected"));
    await p.goto(`/d/${world("door").doorToken}`);
    await expect(p.getByText(kk.door.status.firstLoadNeedsNet)).toBeVisible();
    await c.close();
    const c2 = await browser.newContext({ baseURL });
    const p2 = await c2.newPage();
    await p2.goto(`/d/${"Z".repeat(22)}`);
    await expect(p2.getByText(kk.door.status.linkRevoked)).toBeVisible();
    await c2.close();
  });

  test("axe and 130 % on the helper page", async ({ page }) => {
    await page.goto(`/d/${world("door").doorToken}`);
    await expect(page.locator(".door[data-ready]")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("searchbox").fill("ер");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await noScroll(page);
  });
});

async function asOwner(context: BrowserContext, baseURL: string, w = world("queue")) {
  await context.addCookies([
    { name: "toi_session", value: w.sessions.ake, url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: "kk", url: baseURL },
  ]);
}

test.describe("Ф8 table numbers", () => {
  test.beforeEach(() => needDb());

  test("queue: «WhatsApp-қа жіберу» opens wa.me with the table text → back → «Жіберілді» → table_sent_at; resume", async ({
    page,
    context,
    baseURL,
  }, info) => {
    test.skip(info.project.name !== "mobile", "the queue world is shared by projects");
    const w = world("queue");
    await asOwner(context, baseURL!);
    let waUrl = "";
    await context.route("https://wa.me/**", (r) => {
      waUrl = r.request().url();
      return r.fulfill({ status: 200, contentType: "text/html", body: "<title>wa</title>wa" });
    });
    await page.goto(`/e/${w.eventId}/summary`);
    await page.getByRole("link", { name: kk.summary.tableQueueEntry }).click();
    await expect(page).toHaveURL(/table-queue$/);
    await page.getByRole("button", { name: kk.tableQueue.start }).click();
    // the queue order (table, then name); families without a phone are skipped with «Өткізіп жіберу»
    const queue = await sql<{ name: string; table_no: number; phone: string | null }>(
      "select name, table_no, phone from families where event_id = $1 and table_no is not null and rsvp <> 'no' order by table_no, name",
      [w.eventId],
    );
    const at = queue.findIndex((f) => f.phone);
    for (const f of queue.slice(0, at)) {
      await expect(page.locator(".tq-name")).toHaveText(f.name);
      await page.getByRole("button", { name: kk.tableQueue.skip }).click();
    }
    const first = queue[at]!;
    await expect(page.locator(".tq-name")).toHaveText(first.name);
    await expect(page.locator(".tq-table")).toHaveText(
      kk.tableQueue.current.table.replace("{number}", String(first.table_no)),
    );
    await page.getByRole("button", { name: kk.tableQueue.open }).click();
    await page.waitForURL(/wa\.me/);
    const text = decodeURIComponent(new URL(waUrl).searchParams.get("text") ?? "");
    expect(waUrl).toContain(`https://wa.me/${first.phone!.replace(/\D/g, "")}`);
    expect(text).toContain(`${first.table_no}-үстел`);
    expect(text).toContain("/i/");
    expect(text).toContain("#table");
    await page.goBack();
    await page.getByRole("button", { name: kk.tableQueue.next }).click();
    await expect(page.locator(".tq-progress .num")).toContainText("1 /");
    const [row] = await sql<{ t: Date | null }>(
      "select table_sent_at as t from families where event_id = $1 and name = $2",
      [w.eventId, first.name],
    );
    expect(row!.t).not.toBeNull();
    // stop and come back: «Тоқтаған жерден жалғастыру (№N)» — the next family without table_sent_at that was not
    // skipped in this session (here: the one after the sent family)
    await page.getByRole("button", { name: kk.tableQueue.stop }).click();
    await page.reload();
    await expect(
      page.getByRole("button", { name: kk.tableQueue.resume.replace("{position}", String(at + 2)) }),
    ).toBeVisible();
  });

  test("guest page: switch on → number and mini-map (360 / 320 / 1440), Ф5 budget kept; axe, 130 %", async ({
    page,
    context,
    baseURL,
  }, info) => {
    const w = world("door");
    await sql("update events set show_table_numbers = true where id = $1", [w.eventId]);
    const [f] = await sql<{ token: string; table_no: number }>(
      "select token, table_no from families where event_id = $1 and table_no is not null and rsvp = 'yes' order by table_no limit 1",
      [w.eventId],
    );
    await context.addCookies([{ name: "locale", value: "kk", url: baseURL! }]);
    const bytes: number[] = [];
    page.on("response", async (r) => {
      if (r.request().resourceType() === "document") bytes.push((await r.body().catch(() => Buffer.alloc(0))).length);
    });
    await page.goto(`/i/${f!.token}?answered=1#table`);
    const block = page.locator("#table");
    await expect(block.getByText(kk.invite.table.title)).toBeVisible();
    await expect(block.locator(".n")).toHaveText(String(f!.table_no));
    await expect(
      block.getByRole("img", { name: kk.invite.table.mapA11y.replace("{number}", String(f!.table_no)) }),
    ).toBeVisible();
    expect(bytes[0]).toBeLessThan(150_000); // Ф5 budget: everything before music ≤ 150 KB (the document is a part)
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await noScroll(page);
    if (info.project.name === "mobile") {
      await page.setViewportSize({ width: 320, height: 640 });
      await noScroll(page);
    }
  });
});
