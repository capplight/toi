import { test } from "@playwright/test";
import { screenSizes, screensOut } from "./screens-config";

/**
 * RA handover screenshots of the new public pages (Л5): /privacy and /terms, kk / ru, 360 / 320 / 1440, 130 %.
 * Run: SCREENSHOTS=1 SCREENS_OUT=docs/phases/RA-screens pnpm test:e2e tests/e2e/screens-ra.spec.ts --project=desktop
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");
const OUT = screensOut("RA", "docs/phases/RA-screens/RA");

test("RA legal pages", async ({ browser, baseURL }) => {
  test.setTimeout(300_000);
  for (const page of ["privacy", "terms"] as const)
    for (const locale of ["kk", "ru"] as const)
      for (const size of screenSizes()) {
        for (const big of size.width === 360 ? [false, true] : [false]) {
          const c = await browser.newContext({ baseURL, viewport: { width: size.width, height: size.height } });
          await c.addCookies([{ name: "locale", value: locale, url: baseURL! }]);
          const p = await c.newPage();
          await p.goto(`/${page}`);
          if (big) await p.addStyleTag({ content: "html { font-size: 130% !important; }" });
          await p.screenshot({
            path: `${OUT}/L-${page}_${size.name}_${locale}${big ? "_130" : ""}.png`,
            fullPage: false,
          });
          await c.close();
        }
      }
});
