import { mkdirSync } from "node:fs";
import { type Browser, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф6 handover screenshots (DESIGN 8.19): «Қорытынды» for the owner and «Жастар», kk and ru, 360 and 1440,
 * 130 % at 360, 320 px. Not visual regression.
 * Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f6.spec.ts --project=desktop --workers=1 → docs/phases/F6-screens/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = "docs/phases/F6-screens";
const seed = () => world("base");

async function open(
  browser: Browser,
  baseURL: string,
  who: "ake" | "jas",
  locale: "kk" | "ru",
  width: number,
  height: number,
) {
  const c = await browser.newContext({ baseURL, viewport: { width, height }, deviceScaleFactor: 1 });
  await c.addCookies([
    { name: "toi_session", value: seed().sessions[who], url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: locale, url: baseURL },
  ]);
  // the owner's pilot banner is closed (it is not part of 8.19)
  await c.addInitScript(() => window.localStorage.setItem("toi.pilotBanner.dismissed", "1"));
  const page = await c.newPage();
  await page.goto(`/e/${seed().eventId}/summary`);
  await page.locator(".sum-main, .empty-state").first().waitFor();
  await page.waitForTimeout(400);
  return { c, page };
}

test("Ф6 handover screenshots", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const shots: [string, "ake" | "jas", "kk" | "ru", number, number, boolean, boolean?][] = [
    ["01-owner-kk-360", "ake", "kk", 360, 740, true],
    ["02-owner-kk-360-top", "ake", "kk", 360, 740, false],
    ["03-owner-ru-360", "ake", "ru", 360, 740, true],
    ["04-owner-kk-1440", "ake", "kk", 1440, 900, true],
    ["05-owner-ru-1440", "ake", "ru", 1440, 900, true],
    ["06-jastar-kk-360", "jas", "kk", 360, 740, true],
    ["07-jastar-ru-1440", "jas", "ru", 1440, 900, true],
    ["08-owner-kk-360-130pct", "ake", "kk", 360, 740, true, true],
    ["09-owner-kk-320", "ake", "kk", 320, 640, true],
    ["10-owner-kk-768", "ake", "kk", 768, 1024, true],
  ];
  for (const [name, who, locale, w, h, full, big] of shots) {
    const { c, page } = await open(browser, baseURL!, who, locale, w, h);
    if (big) await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
    await c.close();
  }
});
