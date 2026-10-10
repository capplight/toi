import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Page, test } from "@playwright/test";

/**
 * Ф3 handover screenshots (brief §5): every wizard step, «Дайын!», leaving, the link-session screen, members (+ add,
 * duplicate, sign-out, remove, new link), `/join#switch`; 360 and 1440, kk and ru, 130 %. Not visual regression.
 * Run: SCREENSHOTS=1 pnpm test:e2e tests/e2e/screens-f3.spec.ts --project=desktop --workers=1 → docs/phases/F3-screens/
 */
test.skip(!process.env.SCREENSHOTS, "set SCREENSHOTS=1 to write handover screenshots");

const OUT = "docs/phases/F3-screens";
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
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
}

for (const locale of ["kk", "ru"] as const)
  test(`Ф3 handover screenshots ${locale}`, async ({ page, context, baseURL }) => {
    test.setTimeout(600_000);
    const m = msgs(locale);
    const { eventId, sessions } = seed();
    await context.addCookies([
      { name: "toi_session", value: sessions.ake!, url: baseURL!, httpOnly: true, secure: true },
      { name: "locale", value: locale, url: baseURL! },
    ]);
    let waUrl = "";
    await context.route("https://wa.me/**", (r) => {
      waUrl = r.request().url();
      return r.fulfill({ status: 200, body: "wa" });
    });
    const next = () => page.getByTestId("wizard-next").click();
    for (const size of SIZES) {
      const sfx = `${size.name}_${locale}`;
      await page.setViewportSize({ width: size.width, height: size.height });
      // wizard
      await page.goto("/e/new");
      await shot(page, `W1-kind_${sfx}`);
      await next();
      await next(); // shows the required-field error
      await page.getByRole("textbox").first().fill("Айбек пен Дана");
      await page.locator('input[type="date"]').fill("2026-11-15");
      await page.locator('input[type="time"]').fill("18:00");
      await page.getByRole("textbox").nth(1).fill("Серік — Гүлжан");
      await shot(page, `W2-who_${sfx}`);
      await next();
      await page.getByLabel(m.wizard.venue.nameLabel).fill("«Шаңырақ» мейрамханасы");
      await page.getByLabel(m.wizard.venue.addressLabel).fill("Атырау қ., Абай даңғылы, 15");
      await page.getByLabel(m.wizard.venue.mapLabel).fill("2gis.kz/atyrau/firm/7000");
      await next();
      await shot(page, `W3-venue-error_${sfx}`);
      await page.getByLabel(m.wizard.venue.mapLabel).fill("https://2gis.kz/atyrau/firm/7000");
      await next();
      await page.locator(".preset").first().click();
      await shot(page, `W4-text_${sfx}`, size.name === "360");
      await page.locator(".preset").first().getByRole("button").click();
      await shot(page, `W4-text-edit_${sfx}`);
      await next();
      await shot(page, `W5-template_${sfx}`);
      await next();
      await shot(page, `W6-music_${sfx}`);
      await next();
      await shot(page, `W7-hall_${sfx}`, size.name === "360");
      await next();
      await shot(page, `W8-review_${sfx}`, size.name === "360");
      if (size.name === "360") {
        await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
        await page.getByRole("button", { name: m.wizard.text.edit }).last().click(); // back to the hall step
        await shot(page, `W7-hall_360_${locale}_130`, true);
        await page.goto("/e/new");
      } else {
        await next();
        await shot(page, `W9-done_${sfx}`);
      }
      // leave
      await page.goto("/e/new");
      await page.getByRole("radio").nth(4).click();
      await page.getByRole("button", { name: m.common.actions.back, exact: true }).first().click();
      await shot(page, `W-leave_${sfx}`);

      // members
      await page.goto(`/e/${eventId}/settings/members`);
      await shot(page, `M-members_${sfx}`, size.name === "360");
      await page.getByRole("button", { name: m.members.add.button }).filter({ visible: true }).first().click();
      const sheet = page.getByRole("dialog");
      await sheet.getByRole("radio", { name: m.roles.other }).first().click();
      await shot(page, `M-add-other_${sfx}`);
      await sheet
        .getByLabel(m.members.add.phoneLabel)
        .fill("701 555 12 34".replace("555", String(randomInt(100, 999))));
      await sheet.getByRole("radio", { name: m.roles.mother }).click();
      await shot(page, `M-add_${sfx}`, size.name === "360");
      // duplicate: the seed's Анасы
      await sheet.getByLabel(m.members.add.phoneLabel).fill("700 000 00 02");
      await sheet.getByTestId("add-member-submit").click();
      await shot(page, `M-add-error_${sfx}`);
      await page.keyboard.press("Escape");
      const card = page.getByTestId("member-card").nth(1);
      await card.getByRole("button", { name: m.members.card.remove }).click();
      await shot(page, `M-remove_${sfx}`);
      await page.keyboard.press("Escape");
      await card.getByRole("button", { name: m.members.card.newLink }).click();
      await shot(page, `M-newlink_${sfx}`);
    }
    // 130 %
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`/e/${eventId}/settings/members`);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    await shot(page, `M-members_360_${locale}_130`);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/e/new");
    await shot(page, `W1-kind_320_${locale}`);

    // /join#switch: a fresh member's link opened on the owner's device
    await page.setViewportSize({ width: 360, height: 740 });
    waUrl = "";
    await page.goto(`/e/${eventId}/settings/members`);
    await page.getByRole("button", { name: m.members.add.button }).filter({ visible: true }).first().click();
    await page
      .getByRole("dialog")
      .getByLabel(m.members.add.phoneLabel)
      .fill(`70${randomInt(10_000_000, 99_999_999)}`);
    await page.getByRole("dialog").getByTestId("add-member-submit").click();
    await page.waitForURL(/wa\.me/);
    const link = decodeURIComponent(waUrl.split("?text=")[1]!).match(/\/join\/[0-9A-Za-z]{22}/)![0];
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(link);
      await shot(page, `J-switch_${size.name}_${locale}`);
    }
  });
