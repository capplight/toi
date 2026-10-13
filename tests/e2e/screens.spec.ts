import { test } from "@playwright/test";
import { screenSizes, screensOut, screensTimeout } from "./screens-config";
import { world } from "./worlds";

/**
 * Handover screenshots (Ф1 brief §5), not visual regression (fonts render differently on Windows and Linux CI).
 * Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens.spec.ts --project=desktop  → docs/phases/F1-screens/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = screensOut("F1", "docs/phases/F1-screens");
const seed = () => world("base");
const SIZES = screenSizes();

test("handover screenshots", async ({ page, context, baseURL }) => {
  test.setTimeout(screensTimeout(300_000));
  const { eventId, sessions } = seed();
  await context.addCookies([
    { name: "toi_session", value: sessions.ake!, url: baseURL!, httpOnly: true, secure: true },
  ]);
  const shots: [string, string][] = [
    ["hall-demo", "/dev/ui/hall"],
    ["login", "/login"],
    ["join-expired", "/join/notatoken"],
    ["shell-guests", `/e/${eventId}/guests`],
    ["shell-summary", `/e/${eventId}/summary`],
  ];
  for (const locale of ["kk", "ru"] as const) {
    await context.addCookies([{ name: "locale", value: locale, url: baseURL! }]);
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const [name, path] of shots) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${name}_${size.name}_${locale}.png` });
      }
      // /dev/ui sections (every component, every state)
      await page.goto("/dev/ui");
      await page.waitForLoadState("networkidle");
      for (const id of ["button", "inputs", "guests", "banners", "summary", "tables", "hallmap"]) {
        await page.locator(`section#${id}`).screenshot({ path: `${OUT}/ui-${id}_${size.name}_${locale}.png` });
      }
    }
    // system text 130 % (DESIGN_v2 3.4) at 360
    await page.setViewportSize({ width: 360, height: 740 });
    for (const [name, path] of shots.slice(0, 2)) {
      await page.goto(path);
      await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
      await page.waitForTimeout(800); // let the toast and header settle after the size change
      await page.screenshot({ path: `${OUT}/${name}_360_${locale}_130.png` });
    }
  }
  // Sheet (table 7) and the event menu at 360 and 1440, kk
  await context.addCookies([{ name: "locale", value: "kk", url: baseURL! }]);
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/dev/ui");
    await page.getByRole("button", { name: /Sheet/ }).click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/sheet-table7_${size.name}_kk.png` });
    await page.keyboard.press("Escape");
    await page.goto(`/e/${eventId}/guests`);
    await page
      .getByRole("button", { name: /Той мәзірі/ })
      .filter({ visible: true })
      .first()
      .click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/event-menu_${size.name}_kk.png` });
  }
});
