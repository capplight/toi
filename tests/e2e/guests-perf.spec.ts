import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Ф4 brief 2.4: 65 seed families — «Менің тізімім» interactive in < 1 s on the mobile profile with CPU ×4.
 * Tracing is off here: it records DOM snapshots and screenshots during the run, which would be measured too.
 */
test.use({ trace: "off", video: "off", screenshot: "off" });

const seed = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as {
    eventId: string;
    sessions: Record<"ake" | "jas", string>;
  };
const list = () => `/e/${seed().eventId}/guests`;

test.describe("Ф4 performance", () => {
  test("65 families: interactive in < 1 s on the mobile profile with CPU ×4", async ({
    page,
    context,
    baseURL,
  }, info) => {
    test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres: set DATABASE_URL.");
    test.skip(info.project.name !== "mobile", "mobile profile only");
    await context.addCookies([
      { name: "toi_session", value: seed().sessions.ake, url: baseURL!, httpOnly: true, secure: true },
      { name: "locale", value: "kk", url: baseURL! },
    ]);
    // Warm the server (compiled route, DB pool) and the browser code cache: a member opens the list many
    // times a day. The first, uncached load is logged too (handover: measured, not asserted).
    await page.goto(list());
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const measure = async () => {
      await page.goto(list(), { waitUntil: "commit" });
      // Interactive = hydrated: React has attached its props to the counter (it reacts to taps from now on).
      return page
        .waitForFunction(
          () => {
            const el = document.querySelector(".counter.no");
            if (!el || !Object.keys(el).some((k) => k.startsWith("__reactProps"))) return false;
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
            return performance.now() - nav.responseStart;
          },
          undefined,
          { polling: "raf", timeout: 15_000 },
        )
        .then((h) => h.jsonValue() as Promise<number>);
    };
    const first = await measure();
    const runs = [await measure(), await measure(), await measure()].sort((x, y) => x - y);
    const ms = runs[1]!;
    await page.locator(".counter.no").click();
    await expect(page.locator(".counter.no")).toHaveAttribute("aria-pressed", "true");
    console.log(
      `S1 interactive (CPU ×4): first uncached ${Math.round(first)} ms; warm runs ${runs.map(Math.round).join(", ")} ms`,
    );
    expect(ms).toBeLessThan(1000);
  });
});
