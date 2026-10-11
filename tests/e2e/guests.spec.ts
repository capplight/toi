import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф4 «Гости» (brief 2.4): add → highlighted card, duplicates by phone and by name, wa.me link and
 * «Жіберілді ме?», answer by phone, delete + «Қайтару», «Жауап бермегендер», 65 families < 1 s, axe, 130 %.
 * Runs on mobile 360×740 and desktop 1440×900 against the seeded demo event (global setup). Every test works
 * on guests it adds itself (names/phones unique per project and run), so projects can run in parallel.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const seed = () => world("guests");
const needDb = () =>
  test.skip(
    !process.env.DATABASE_URL && !process.env.CI,
    "No Postgres: set DATABASE_URL (e.g. pnpm db:local --memory).",
  );

async function login(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    { name: "toi_session", value: seed().sessions.ake, url: baseURL, httpOnly: true, secure: true },
    { name: "locale", value: "kk", url: baseURL },
  ]);
}

const list = () => `/e/${seed().eventId}/guests`;
/** Unique Latin name (never «similar» to the Kazakh seed names or to each other) and phone per test. */
function unique(project: string) {
  const letters = "BCDFGHJKLMNPRSTVWXZ";
  const bytes = randomBytes(10);
  const word = Array.from(bytes.subarray(0, 7), (b) => letters[b % letters.length]).join("");
  const digits = Array.from(bytes.subarray(0, 7), (b) => String(b % 10)).join("");
  return {
    name: `${word} ${project === "desktop" ? "D" : "M"} qonaq`,
    phone: `70${project === "desktop" ? 9 : 8}${digits}`,
  };
}

const visible = (page: Page, role: "button" | "link", name: string) =>
  page.getByRole(role, { name, exact: true }).filter({ visible: true }).first();

async function addGuest(page: Page, name: string, phone = "") {
  await page.goto(`${list()}/add`);
  await page.getByLabel(kk.guestForm.name.label, { exact: true }).fill(name);
  if (phone) await page.getByLabel(kk.guestForm.phone.label).fill(phone);
  await visible(page, "button", kk.guestForm.submit).click();
}

const card = (page: Page, name: string) => page.locator(".guest", { hasText: name });

test.describe("Ф4 guests", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    needDb();
    await login(context, baseURL!);
  });

  test("add a guest → «Қосылды!» → back to the list, the new card is highlighted", async ({ page }, info) => {
    const g = unique(info.project.name);
    await addGuest(page, g.name);
    const ok = page.getByTestId("add-success");
    await expect(ok).toBeVisible();
    await expect(ok).toContainText(kk.guestForm.success.title);
    await expect(page.getByText(kk.send.noPhoneHint)).toBeVisible();
    await page.getByRole("button", { name: kk.guestForm.success.backToList }).click();
    await expect(page).toHaveURL(/new=/);
    const c = card(page, g.name);
    await expect(c).toHaveClass(/flash/);
    await expect(c).toBeInViewport();
    await expect(c).toContainText(kk.common.status.notSent);
  });

  test("duplicate phone is blocked with the existing guest; a similar name asks «Бұл сол адам ба?»", async ({
    page,
  }) => {
    // Phone of «Күләш апай» (Анасы's list) in the seed.
    await addGuest(page, "Күләш", "701 555 12 34");
    const conflict = page.getByTestId("phone-conflict");
    await expect(conflict).toContainText("Күләш апай");
    await expect(
      page.getByText(kk.guestForm.phone.duplicate.replace("{inList}", kk.roles.inList.mother)),
    ).toBeVisible();
    await expect(page.getByTestId("add-success")).toHaveCount(0);

    await page.goto(`${list()}/add`);
    await page.getByLabel(kk.guestForm.name.label, { exact: true }).fill("Ерлан");
    await visible(page, "button", kk.guestForm.submit).click();
    await expect(page.getByRole("heading", { name: kk.guestForm.dup.title })).toBeVisible();
    await expect(page.locator(".dupcard", { hasText: "Ерлан ағай отбасы" })).toBeVisible();
    // The safe choice goes first and does not add.
    await page.getByRole("button", { name: kk.guestForm.dup.same }).click();
    await expect(page).toHaveURL(new RegExp(`${list()}$`));
    await expect(page.getByText(kk.guestForm.dup.notAddedToast.replace("{name}", "Ерлан"))).toBeVisible();
  });

  test("WhatsApp: wa.me link, return → «Жіберілді ме?» → «Жіберілмеген» becomes «Жауап жоқ»", async ({
    page,
    context,
  }, info) => {
    const g = unique(info.project.name);
    await addGuest(page, g.name, g.phone);
    await page.getByRole("button", { name: kk.guestForm.success.backToList }).click();
    const c = card(page, g.name);
    const send = c.getByRole("link", { name: new RegExp(kk.guests.card.sendWhatsApp) });
    await send.focus(); // the full text is attached lazily (pointer/focus/hover), see GuestCard WaHref
    const href = (await send.getAttribute("href"))!;
    expect(href).toMatch(new RegExp(`^https://wa\\.me/7${g.phone}\\?text=`));
    const text = decodeURIComponent(href.split("?text=")[1]!);
    expect(text).toContain(`құрметті ${g.name}!`);
    expect(text).toMatch(/\/i\/[0-9A-Za-z]{22}$/);
    expect(text).toContain("Айбек пен Дана");

    await context.route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "wa" }));
    const popup = context.waitForEvent("page");
    await send.click();
    await (await popup).close();
    // Back from WhatsApp: the page was hidden and becomes visible again.
    await page.evaluate(() => {
      const set = (v: string) => {
        Object.defineProperty(document, "visibilityState", { value: v, configurable: true });
        document.dispatchEvent(new Event("visibilitychange"));
      };
      set("hidden");
      set("visible");
    });
    const ask = page.getByRole("dialog", { name: kk.send.ask.title });
    await expect(ask).toBeVisible();
    await expect(ask).toContainText(g.name);
    await expect(ask.getByRole("button", { name: kk.send.ask.yes })).toBeFocused();
    await ask.getByRole("button", { name: kk.send.ask.yes }).click();
    await expect(page.getByText(kk.send.toast.invite)).toBeVisible();
    await expect(c).toContainText(kk.common.status.noAnswer);
    await expect(c).toContainText(kk.common.time.sentToday);
  });

  test("closed without an answer → the card keeps «Жіберілді ме?» with the same button", async ({
    page,
    context,
  }, info) => {
    const g = unique(info.project.name);
    await addGuest(page, g.name);
    await page.getByRole("button", { name: kk.guestForm.success.backToList }).click();
    const c = card(page, g.name);
    await context.route("https://wa.me/**", (r) => r.fulfill({ status: 200, body: "wa" }));
    const popup = context.waitForEvent("page");
    await c.getByRole("link", { name: new RegExp(kk.guests.card.sendWhatsApp) }).click();
    await (await popup).close();
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.keyboard.press("Escape");
    await expect(c).toContainText(kk.guests.card.pendingConfirm);
    await c.getByRole("button", { name: kk.guests.card.pendingYes }).click();
    await expect(c).toContainText(kk.common.status.noAnswer);
  });

  test("answer by phone, delete and «Қайтару»", async ({ page }, info) => {
    const g = unique(info.project.name);
    await addGuest(page, g.name);
    await page.getByRole("button", { name: kk.guestForm.success.backToList }).click();
    const c = card(page, g.name);
    await c.locator(".card-hit").click();
    const sheet = page.getByRole("dialog", { name: g.name });
    await sheet.getByRole("button", { name: kk.guestSheet.answer.no }).click();
    await expect(page.getByText(kk.guestSheet.answer.toastNo.replace("{name}", g.name))).toBeVisible();
    await expect(c).toContainText(kk.common.status.no);

    await c.locator(".card-hit").click();
    await page.getByRole("dialog", { name: g.name }).getByRole("button", { name: kk.common.actions.delete }).click();
    const alert = page.getByRole("alertdialog");
    await expect(alert.getByRole("heading")).toHaveText(kk.guestSheet.delete.title);
    await alert.getByRole("button", { name: kk.guestSheet.delete.yes }).click();
    await expect(c).toHaveCount(0);
    await page
      .getByRole("status")
      .filter({ hasText: kk.guestSheet.delete.toast.replace("{name}", g.name) })
      .getByRole("button", { name: kk.common.actions.undo })
      .click();
    await expect(c).toHaveCount(1);
  });

  test("«Жауап бермегендер»: from the banner, reminders are wa.me links", async ({ page }) => {
    await page.goto(list());
    const banner = page.locator("a.banner.remind");
    await expect(banner).toHaveAttribute("href", /\/guests\/no-answer$/);
    await page.goto((await banner.getAttribute("href"))!);
    await expect(page.getByText(kk.noAnswer.intro)).toBeVisible();
    const first = page.getByTestId("na-card").first();
    await expect(first.getByRole("link", { name: new RegExp(kk.guests.card.remind) })).toHaveAttribute(
      "href",
      /^https:\/\/wa\.me\/\d*\?text=/,
    );
    await expect(
      page.getByRole("heading", { name: new RegExp(kk.noAnswer.notSent.title.split(" ·")[0]) }),
    ).toBeVisible();
  });

  test("filters, search and empty search", async ({ page }) => {
    await page.goto(list());
    // tap until hydrated (a tap before hydration does nothing)
    const no = page.locator(".counter.no");
    await expect(async () => {
      if ((await no.getAttribute("aria-pressed")) !== "true") await no.click();
      await expect(no).toHaveAttribute("aria-pressed", "true", { timeout: 500 });
    }).toPass();
    await expect(page.locator(".guest", { hasText: "Гүлмира" })).toHaveCount(1);
    for (const status of await page.locator(".guest .badge").allTextContents())
      expect(status).toBe(kk.common.status.no);
    await page.getByRole("button", { name: kk.guests.list.filter.clear }).click();
    await page.getByRole("searchbox").fill("тимур");
    await expect(page.locator(".guest")).toHaveCount(1);
    await page.getByRole("searchbox").fill("Ерл zzz");
    await expect(page.getByText(kk.guests.list.search.empty.replace("{query}", "Ерл zzz"))).toBeVisible();
    await expect(page.getByRole("link", { name: kk.guests.list.search.addWithName })).toHaveAttribute(
      "href",
      /add\?name=/,
    );
  });

  test("axe: S1, S4, S2, S5 without serious/critical; 130 %: no horizontal scroll, counters fit", async ({ page }) => {
    const check = async (label: string) => {
      const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${label}: ${v.id} ${v.nodes[0]?.target}`)).toEqual([]);
    };
    await page.goto(list());
    await check("S1");
    await page.locator(".guest .card-hit").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await check("S4");
    await page.goto(`${list()}/add`);
    await check("S2");
    await page.goto(`${list()}/no-answer`);
    await check("S5");

    for (const path of [list(), `${list()}/add`, `${list()}/no-answer`]) {
      await page.goto(path);
      await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        tiles: Array.from(document.querySelectorAll<HTMLElement>(".counter")).map((t) => ({
          over: t.scrollWidth - t.clientWidth,
          right: t.getBoundingClientRect().right,
        })),
      }));
      expect(r.sw, path).toBeLessThanOrEqual(r.iw);
      for (const t of r.tiles) {
        expect(t.over, `${path} tile content`).toBeLessThanOrEqual(0);
        expect(t.right, `${path} tile edge`).toBeLessThanOrEqual(r.iw);
      }
    }
  });

  test("targets ≥ 48 px on S1 and S2", async ({ page }) => {
    for (const path of [list(), `${list()}/add`]) {
      await page.goto(path);
      const small = await page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>("main button, main a.btn, main .counter, main input"))
          .filter(
            (el) =>
              el.offsetParent !== null &&
              !el.closest(".stepper .val") &&
              el.getAttribute("aria-hidden") !== "true" &&
              getComputedStyle(el).pointerEvents !== "none",
          )
          .map((el) => ({ el: el.outerHTML.slice(0, 80), h: el.getBoundingClientRect().height }))
          .filter((x) => x.h > 0 && x.h < 47.5),
      );
      expect(small, path).toEqual([]);
    }
  });
});

test.describe("Ф4 review П3", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    needDb();
    await login(context, baseURL!);
  });

  test("system «Back» on a filled «Жаңа қонақ» asks «Қонақ сақталмайды. Шығасыз ба?»", async ({ page }) => {
    await page.goto(list());
    await page.goto(`${list()}/add`); // history: list → add
    await page.getByLabel(kk.guestForm.name.label, { exact: true }).fill("Қайтпайтын қонақ");
    await page.goBack();
    const alert = page.getByRole("alertdialog");
    await expect(alert.getByRole("heading")).toHaveText(kk.guestForm.leave.title);
    await alert.getByRole("button", { name: kk.guestForm.leave.no }).click();
    await expect(page).toHaveURL(/\/add/);
    await expect(page.getByLabel(kk.guestForm.name.label, { exact: true })).toHaveValue("Қайтпайтын қонақ");
    // the entry is back: «Back» asks again; «Иә, шығу» leaves to the list
    await page.goBack();
    await page.getByRole("alertdialog").getByRole("button", { name: kk.guestForm.leave.yes }).click();
    await expect(page).toHaveURL(new RegExp(`${list()}$`));
  });
});
