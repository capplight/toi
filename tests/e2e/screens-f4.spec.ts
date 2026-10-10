import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Page, test } from "@playwright/test";

/**
 * Ф4 handover screenshots (brief §4): S1, S2 (all states), S3, S4, S5, «Жіберілді ме?», kk/ru, 360/1440, 130 %.
 * Not visual regression. Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f4.spec.ts --project=desktop
 * → docs/phases/F4-screens/ (adds a few guests to the seeded event).
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = "docs/phases/F4-screens";
const msgs = (l: "kk" | "ru") => JSON.parse(readFileSync(resolve(process.cwd(), `content/messages/${l}.json`), "utf8"));
const seed = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as {
    eventId: string;
    sessions: Record<string, string>;
  };
const SIZES = [
  { name: "360", width: 360, height: 740 },
  { name: "1440", width: 1440, height: 900 },
];

async function shot(page: Page, name: string, full = false) {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

for (const only of ["kk", "ru"] as const)
  test(`Ф4 handover screenshots ${only}`, async ({ page, context, baseURL }) => {
    test.setTimeout(600_000);
    const { eventId, sessions } = seed();
    const base = `/e/${eventId}/guests`;
    await context.addCookies([
      { name: "toi_session", value: sessions.ake!, url: baseURL!, httpOnly: true, secure: true },
    ]);
    await context.route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "wa" }));
    // the pilot banner is Ф1 behaviour; closed here to compare with the mockups
    await context.addInitScript(() => {
      try {
        localStorage.setItem("toi.pilotBanner.dismissed", "1");
      } catch {}
    });
    let n = 0;
    for (const locale of [only]) {
      if (locale === "ru") n = 2;
      const m = msgs(locale);
      await context.addCookies([{ name: "locale", value: locale, url: baseURL! }]);
      for (const size of SIZES) {
        const sfx = `${size.name}_${locale}`;
        await page.setViewportSize({ width: size.width, height: size.height });

        // S1
        await page.goto(base);
        await page.waitForLoadState("networkidle");
        await shot(page, `S1_${sfx}`);
        if (size.name === "360") await shot(page, `S1_${sfx}_full`, true);
        await page.locator(".counter.inv").click();
        await shot(page, `S1-filter_${sfx}`);
        await page.goto(base);
        await page.getByRole("searchbox").fill("Ерл zzz");
        await shot(page, `S1-search-empty_${sfx}`);

        // S4
        await page.goto(base);
        await page.locator(".guest .card-hit").first().click();
        await shot(page, `S4_${sfx}`);
        await page.getByRole("dialog").getByRole("button", { name: m.guestSheet.answer.yes }).click();
        await shot(page, `S4-answer-yes_${sfx}`);
        await page.getByRole("dialog").getByRole("button", { name: m.common.actions.delete }).click();
        await shot(page, `S4-delete_${sfx}`);

        // S2 states
        const name = page.getByLabel(m.guestForm.name.label, { exact: true });
        const submit = page.getByRole("button", { name: m.guestForm.submit, exact: true }).filter({ visible: true });
        await page.goto(`${base}/add`);
        await shot(page, `S2_${sfx}`);
        await submit.click();
        await shot(page, `S2-error_${sfx}`);
        await name.fill("Күләш");
        await page.getByLabel(m.guestForm.phone.label).fill("701 555 12 34");
        await submit.click();
        await shot(page, `S2-phone_${sfx}`);
        await page.goto(`${base}/add`);
        await name.fill("Ерлан");
        await submit.click();
        await shot(page, `S2-dup_${sfx}`);
        await page.goto(`${base}/add`);
        n += 1;
        const guest = `${["Бақытжан", "Нұрлыбек", "Жәнібек", "Дидарбек"][n - 1]} отбасы`;
        await name.fill(guest);
        await submit.click();
        await page.getByTestId("add-success").waitFor();
        await shot(page, `S2-ok_${sfx}`);
        await page.goto(`${base}/add`);
        await page.getByRole("button", { name: m.guestForm.category.addCustom }).click();
        await shot(page, `S3_${sfx}`);

        // «Жіберілді ме?» and the pending row
        await page.goto(`${base}?new=`);
        const card = page.locator(".guest", { hasText: guest });
        const popup = context.waitForEvent("page");
        await card.getByRole("link").first().click();
        await (await popup).close();
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await shot(page, `S6-ask_${sfx}`);
        await page.keyboard.press("Escape");
        await card.scrollIntoViewIfNeeded();
        await shot(page, `S6-pending_${sfx}`);
        await card.getByRole("button", { name: m.guests.card.pendingYes }).click();
        await shot(page, `S6-sent-toast_${sfx}`);

        // S5
        await page.goto(`${base}/no-answer`);
        await shot(page, `S5_${sfx}`);
        if (size.name === "360") await shot(page, `S5_${sfx}_full`, true);
      }
      // 130 % system text at 360
      await page.setViewportSize({ width: 360, height: 740 });
      for (const [label, path] of [
        ["S1", base],
        ["S2", `${base}/add`],
        ["S5", `${base}/no-answer`],
      ] as const) {
        await page.goto(path);
        await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
        await shot(page, `${label}_360_${locale}_130`);
      }
    }
  });
