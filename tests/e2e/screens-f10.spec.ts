import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф10 handover: the print page on screen (360 / 1440, kk / ru) and its PDF (A4, kk and ru) from world `base`.
 * Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f10.spec.ts --project=desktop --workers=1 → docs/phases/F10-screens/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = "docs/phases/F10-screens";

test("Ф10 handover screenshots and PDFs", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const w = world("base");
  for (const [name, locale, width] of [
    ["01-print-kk-360", "kk", 360],
    ["02-print-kk-1440", "kk", 1440],
    ["03-print-ru-1440", "ru", 1440],
  ] as const) {
    const c = await browser.newContext({ baseURL, viewport: { width, height: width > 1000 ? 900 : 740 } });
    await c.addCookies([
      { name: "toi_session", value: w.sessions.ake, url: baseURL!, httpOnly: true, secure: true },
      { name: "locale", value: locale, url: baseURL! },
    ]);
    const page = await c.newPage();
    await page.goto(`/e/${w.eventId}/print/tables`);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    if (width === 1440) {
      await page.emulateMedia({ media: "print" });
      await page.pdf({ path: `${OUT}/seating-${locale}.pdf`, format: "A4", printBackground: true });
      await page.pdf({ path: `${OUT}/seating-${locale}-bw-check.pdf`, format: "A4", printBackground: false });
    }
    await c.close();
  }
});
