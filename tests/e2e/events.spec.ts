import AxeBuilder from "@axe-core/playwright";
import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";

/**
 * Ф3 (brief §3.3): the wizard with and without the hall, leaving, members (add → wa.me link → the person opens
 * it in another browser context → «Кіру» → the event), a link session cannot create events, `/join#switch`,
 * axe / 130 % for the wizard and the members screen. Runs on 360×740 and 1440×900 against the seeded DB.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const seed = () =>
  JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as {
    eventId: string;
    sessions: Record<string, string>;
  };
const needDb = () =>
  test.skip(
    !process.env.DATABASE_URL && !process.env.CI,
    "No Postgres: set DATABASE_URL (e.g. pnpm db:local --memory).",
  );

async function asOwner(context: BrowserContext, baseURL: string, session = "ake") {
  await context.addCookies([
    { name: "toi_session", value: seed().sessions[session]!, url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: "kk", url: baseURL },
  ]);
}

const next = (page: Page) => page.getByTestId("wizard-next").click();
const phone = () => `70${randomInt(10_000_000, 99_999_999)}`;

async function fillWizard(page: Page, opts: { hall: boolean; title: string }) {
  await page.goto("/e/new");
  await expect(page.getByTestId("wizard-step-kind")).toBeVisible();
  await expect(page.getByRole("radio", { name: kk.events.kind.uilenuToi })).toHaveAttribute("aria-checked", "true");
  await next(page);
  // who
  await next(page); // empty names → error, stays
  await expect(page.getByTestId("wizard-step-who")).toBeVisible();
  await page.getByLabel(kk.wizard.who.namesLabel.match(/uilenu_toi \{([^}]+)\}/)![1]).fill(opts.title);
  await page.getByLabel(kk.wizard.who.dateLabel).fill("2026-12-20");
  await page.getByLabel(kk.wizard.who.timeLabel).fill("18:00");
  await next(page);
  // venue: a link without https:// is refused
  await page.getByLabel(kk.wizard.venue.nameLabel).fill("«Алтын» мейрамханасы");
  await page.getByLabel(kk.wizard.venue.mapLabel).fill("2gis.kz/almaty/firm/1");
  await next(page);
  await expect(page.getByText(kk.wizard.venue.mapError)).toBeVisible();
  await page.getByLabel(kk.wizard.venue.mapLabel).fill("https://2gis.kz/almaty/firm/1");
  await next(page);
  // text: the first ready text
  await expect(page.getByTestId("wizard-step-text")).toBeVisible();
  await page.locator(".preset").first().click();
  await expect(page.locator(".preset").first()).toHaveAttribute("aria-checked", "true");
  await next(page);
  // template
  await page.getByRole("radio", { name: new RegExp(kk.wizard.template.kokTun) }).click();
  await next(page);
  // music (Ф5): later
  await page.getByRole("button", { name: kk.wizard.music.later }).click();
  // hall
  await expect(page.getByTestId("wizard-step-hall")).toBeVisible();
  if (opts.hall) await next(page);
  else await page.getByRole("button", { name: kk.wizard.hall.skip }).click();
  // review
  await expect(page.getByTestId("wizard-review")).toContainText(opts.title);
  await next(page);
  await expect(page.getByTestId("wizard-done")).toBeVisible();
}

test.describe("Ф3 wizard", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    needDb();
    await asOwner(context, baseURL!);
  });

  test("the owner creates an event with the hall: one call at the end, then «Тізім толтыратындарды қосу»", async ({
    page,
  }, info) => {
    const title = `Тест ${info.project.name} ${Date.now() % 100000}`;
    await fillWizard(page, { hall: true, title });
    await page.getByRole("link", { name: kk.wizard.done.inviteFamily }).click();
    await expect(page).toHaveURL(/\/settings\/members$/);
    await expect(page.getByTestId("member-card")).toHaveCount(1); // the owner
    // the event is in the list
    await page.goto("/e");
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("without the hall («Кейін баптаймын»)", async ({ page }, info) => {
    await fillWizard(page, { hall: false, title: `Залсыз ${info.project.name} ${Date.now() % 100000}` });
    await page.getByRole("link", { name: kk.wizard.done.toList }).click();
    await expect(page).toHaveURL(/\/guests$/);
  });

  test("leaving the wizard asks «Шығу керек пе?»; nothing is created", async ({ page }) => {
    await page.goto("/e/new");
    await page.getByRole("radio", { name: kk.events.kind.merey }).click();
    await page.getByRole("button", { name: kk.common.actions.back, exact: true }).first().click();
    const alert = page.getByRole("alertdialog");
    await expect(alert.getByRole("heading")).toHaveText(kk.wizard.leave.title);
    await alert.getByRole("button", { name: kk.wizard.leave.no }).click();
    await expect(page.getByTestId("wizard-step-kind")).toBeVisible();
    await page.getByRole("button", { name: kk.common.actions.back, exact: true }).first().click();
    await page.getByRole("alertdialog").getByRole("button", { name: kk.wizard.leave.yes }).click();
    await expect(page).toHaveURL(/\/e$/);
  });

  test("axe and 130 % on the wizard steps", async ({ page }) => {
    await page.goto("/e/new");
    for (const step of ["kind", "who"]) {
      await expect(page.getByTestId(`wizard-step-${step}`)).toBeVisible();
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual(
        [],
      );
      await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
      const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
      expect(sw).toBeLessThanOrEqual(iw);
      if (step === "kind") await next(page);
    }
  });
});

async function addMember(page: Page, context: BrowserContext, eventId: string, who: string) {
  let waUrl = "";
  await context.route("https://wa.me/**", (r) => {
    waUrl = r.request().url();
    return r.fulfill({ status: 200, body: "wa" });
  });
  await page.goto(`/e/${eventId}/settings/members`);
  await page.getByRole("button", { name: kk.members.add.button }).filter({ visible: true }).first().click();
  const sheet = page.getByRole("dialog", { name: kk.members.add.title });
  const num = phone();
  await sheet.getByLabel(kk.members.add.phoneLabel).fill(num);
  await sheet.getByRole("radio", { name: who }).click();
  await sheet.getByTestId("add-member-submit").click();
  await expect.poll(() => waUrl).toMatch(/^https:\/\/wa\.me\/7\d{10}\?text=/);
  const text = decodeURIComponent(waUrl.split("?text=")[1]!);
  const link = text.match(/https?:\/\/\S+\/join\/[0-9A-Za-z]{22}/)![0];
  return { num, path: new URL(link).pathname, waUrl };
}

async function freshContext(browser: Browser, baseURL: string) {
  const ctx = await browser.newContext({ baseURL });
  await ctx.addCookies([{ name: "locale", value: "kk", url: baseURL }]);
  return ctx;
}

test.describe("Ф3 members", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    needDb();
    await asOwner(context, baseURL!);
  });

  test("add «Анасы» → wa.me link → she opens it in another browser → «Кіру» → the event; a link session cannot create events", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    const { eventId } = seed();
    const m = await addMember(page, context, eventId, kk.roles.mother);
    expect(m.waUrl).toContain(`wa.me/7${m.num}`);
    const mom = await freshContext(browser, baseURL!);
    const p2 = await mom.newPage();
    await p2.goto(m.path);
    await p2.getByRole("button", { name: kk.auth.join.submit }).click();
    await expect(p2).toHaveURL(new RegExp(`/e/${eventId}`));
    await p2.goto("/e/new");
    await expect(p2.getByTestId("need-full-login")).toContainText(kk.wizard.needFullLogin.title);
    // the owner sees «Кірді»
    await page.goto(`/e/${eventId}/settings/members`); // the add sheet went to wa.me (location.assign)
    await expect(page.getByTestId("member-card").filter({ hasText: kk.roles.mother }).last()).toContainText("Кірді");
    await mom.close();
  });

  test("#switch: the owner's device opens another person's link → «Жоқ, қалсын» keeps the owner, «Иә» signs her in", async ({
    page,
    context,
    baseURL,
  }, info) => {
    await asOwner(context, baseURL!, `akeSwitch_${info.project.name}`);
    const { eventId } = seed();
    const m = await addMember(page, context, eventId, kk.roles.couple);
    await page.goto(m.path);
    const sw = page.getByTestId("join-switch");
    await expect(sw).toContainText(kk.auth.join.switchUser.title);
    await page.getByRole("link", { name: kk.auth.join.switchUser.cancel }).click();
    await expect(page).toHaveURL(/\/e$/);
    await expect(page.getByTestId("create-event")).toBeVisible(); // still the owner (scope all)
    await page.goto(m.path);
    await page.getByRole("button", { name: kk.auth.join.switchUser.confirm }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${eventId}`));
    await page.goto("/e/new");
    await expect(page.getByTestId("need-full-login")).toBeVisible(); // now the member's link session
  });

  test("duplicate phone, remove; axe and 130 % on the members screen", async ({ page, context }) => {
    const { eventId } = seed();
    const m = await addMember(page, context, eventId, kk.roles.couple);
    await page.goto(`/e/${eventId}/settings/members`);
    await page.getByRole("button", { name: kk.members.add.button }).filter({ visible: true }).first().click();
    const sheet = page.getByRole("dialog", { name: kk.members.add.title });
    await sheet.getByLabel(kk.members.add.phoneLabel).fill(m.num);
    await sheet.getByTestId("add-member-submit").click();
    await expect(sheet.getByText(kk.members.add.errors.alreadyMember)).toBeVisible();
    await page.keyboard.press("Escape");

    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
    await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
    const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth }));
    expect(sw).toBeLessThanOrEqual(iw);

    const card = page
      .getByTestId("member-card")
      .filter({ hasText: m.num.slice(-2) })
      .last();
    await card.getByRole("button", { name: kk.members.card.remove }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: kk.members.card.remove }).click();
    await expect(
      page.getByTestId("member-card").filter({ hasText: `+7 ${m.num.slice(0, 3)} *** ** ${m.num.slice(-2)}` }),
    ).toHaveCount(0);
  });
});
