import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф4 brief 2.4: 65 families — «Менің тізімім» interactive in < 1 s on the mobile profile with CPU ×4.
 * Ф6 review П2: its own fixed event (world `perf`: 65 families, 1/3 not sent, 1/3 sent without an answer, 1/3
 * answered), so no other spec changes what is measured. In CI also run with `--repeat-each=3`: if the warm median
 * grows by more than 30 % against the first repeat, the test fails («рост») and attaches the Chrome CPU profile.
 * Tracing is off here: it records DOM snapshots and screenshots during the run, which would be measured too.
 */
test.use({ trace: "off", video: "off", screenshot: "off" });

const seed = () => world("perf");
const list = () => `/e/${seed().eventId}/guests`;

test.describe("Ф4 performance", () => {
  test("65 families: interactive in < 1 s on the mobile profile with CPU ×4", async ({
    page,
    context,
    baseURL,
  }, info) => {
    test.skip(!process.env.DATABASE_URL && !process.env.CI, "No Postgres: set DATABASE_URL.");
    test.skip(info.project.name !== "mobile", "mobile profile only");
    // 1 warm-up + 4 calibration + 6 list loads at CPU ×4 — more than the default 30 s on a slow machine.
    test.setTimeout(180_000);
    await context.addCookies([
      { name: "toi_session", value: seed().sessions.ake, url: baseURL!, httpOnly: true, secure: true },
      { name: "locale", value: "kk", url: baseURL! },
    ]);
    // Warm the server (compiled route, DB pool) and the browser code cache: a member opens the list many
    // times a day. The first, uncached load is logged too (handover: measured, not asserted).
    await page.goto(list());
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const measure = async (path = list(), selector = ".counter.no") => {
      await page.goto(path, { waitUntil: "commit" });
      // Interactive = hydrated: React has attached its props to the counter (it reacts to taps from now on).
      return page
        .waitForFunction(
          (sel) => {
            const el = document.querySelector(sel);
            if (!el || !Object.keys(el).some((k) => k.startsWith("__reactProps"))) return false;
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
            return performance.now() - nav.responseStart;
          },
          selector,
          { polling: "raf", timeout: 15_000 },
        )
        .then((h) => h.jsonValue() as Promise<number>);
    };
    // Calibration (Ф5 review, ruling 1): the near-empty «Зал» frame on the same machine. If even that takes over
    // 0.5 s, the machine is overloaded — locally the figures are only logged; CI stays strict.
    const hallPath = `/e/${seed().eventId}/hall`;
    await measure(hallPath, ".tab");
    const frame = [
      await measure(hallPath, ".tab"),
      await measure(hallPath, ".tab"),
      await measure(hallPath, ".tab"),
    ].sort((x, y) => x - y)[1]!;
    const first = await measure();
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.start");
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) runs.push(await measure());
    const { profile } = await cdp.send("Profiler.stop");
    const order = runs.map(Math.round).join(", ");
    runs.sort((x, y) => x - y);
    const ms = runs[2]!; // median of 5 warm loads
    await page.locator(".counter.no").click();
    await expect(page.locator(".counter.no")).toHaveAttribute("aria-pressed", "true");
    const overloaded = !process.env.CI && frame > 500;
    console.log(
      `S1 interactive (CPU ×4): first uncached ${Math.round(first)} ms; warm runs ${order} ms; ` +
        `frame «Зал» ${Math.round(frame)} ms; S1/frame ${(ms / frame).toFixed(2)}${overloaded ? " — machine overloaded, not asserted" : ""}`,
    );
    // Growth between repeats (--repeat-each): medians of this worker's repeats, kept next to the test results.
    const file = join(info.project.outputDir, "guests-perf-repeats.json");
    const medians: number[] =
      info.repeatEachIndex > 0 && existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as number[]) : [];
    medians.push(ms);
    writeFileSync(file, JSON.stringify(medians));
    const growth = medians.length > 1 ? ms / medians[0]! - 1 : 0;
    if (medians.length > 1)
      console.log(
        `repeat ${info.repeatEachIndex}: warm median ${Math.round(ms)} ms, ${(growth * 100).toFixed(0)} % vs the first`,
      );
    if (overloaded) {
      info.annotations.push({ type: "machine overloaded", description: `frame ${Math.round(frame)} ms > 500 ms` });
      return;
    }
    if (growth > 0.3) {
      info.annotations.push({ type: "рост", description: `warm median ${medians.map(Math.round).join(" → ")} ms` });
      await info.attach("chrome-cpu-profile.cpuprofile", {
        body: JSON.stringify(profile),
        contentType: "application/json",
      });
    }
    expect(growth, "warm S1 grows between repeats (рост)").toBeLessThanOrEqual(0.3);
    expect(ms).toBeLessThan(1000);
  });
});
