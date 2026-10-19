import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { world } from "./worlds";

// Expected strings come from content/messages (decision Д5).
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));

const needDb = () =>
  // Ф0 review Н5: skip only locally; in CI the global setup already failed without DATABASE_URL.
  test.skip(
    !process.env.DATABASE_URL && !process.env.CI,
    "No Postgres: set DATABASE_URL (e.g. pnpm db:local --memory).",
  );

const seed = () => world("base");

/** `pnpm admin:owner-link` (CLI of plan 6.1 flow 4) → the printed URL. */
function ownerLink(phone: string): string {
  const secret = () => randomBytes(32).toString("base64");
  const out = execFileSync(process.execPath, ["--import", "tsx", "scripts/admin-owner-link.ts", phone], {
    env: {
      ...process.env,
      APP_URL: `http://localhost:${process.env.E2E_PORT ?? 3100}`,
      APP_DOMAIN: "toi-pilot.vercel.app",
      DATABASE_DRIVER: process.env.DATABASE_DRIVER ?? "pg",
      SESSION_SECRET: secret(),
      OTP_HMAC_SECRET: secret(),
      CRON_SECRET: secret(),
    },
    encoding: "utf8",
  });
  const url = out.split("\n").find((l) => l.includes("/join/"));
  if (!url) throw new Error("no link printed");
  return new URL(url.trim()).pathname;
}

// Different numbers per project so parallel runs don't hit the per-number limits.
const phoneFor = (project: string, base: number) =>
  `+7701${base}${project === "mobile" ? "1" : "2"}${String(Date.now()).slice(-4)}`;

test.describe("login by link (plan 6.1 flow 1/4)", () => {
  test("GET does not spend the link; «Кіру» logs in; re-use is rejected", async ({ page }, info) => {
    needDb();
    const path = ownerLink(phoneFor(info.project.name, 10));
    await page.goto(path);
    await expect(page.getByTestId("join-valid")).toBeVisible();
    await page.reload(); // previews/bots: GET again — still valid
    await expect(page.getByRole("heading", { name: kk.auth.join.greeting })).toBeVisible();

    await page.getByRole("button", { name: kk.auth.join.submit }).click();
    // Ф3: an owner (founder's link) without events goes straight to the wizard «Жаңа той».
    await expect(page).toHaveURL(/\/e\/new$/);
    await expect(page.getByTestId("wizard-step-kind")).toBeVisible();

    // The same link again → «Сілтеме жарамсыз»
    await page.goto(path);
    await expect(page.getByTestId("join-expired")).toBeVisible();
    await expect(page.getByRole("heading", { name: kk.auth.join.expired.title })).toBeVisible();
  });

  test("a superseded (revoked) link shows the expired screen with SMS login", async ({ page }, info) => {
    needDb();
    const phone = phoneFor(info.project.name, 20);
    const first = ownerLink(phone);
    ownerLink(phone); // new link revokes the first
    await page.goto(first);
    await expect(page.getByTestId("join-expired")).toBeVisible();
    await page.getByRole("link", { name: kk.auth.join.expired.smsLogin }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("garbage token → expired screen", async ({ page }) => {
    needDb();
    await page.goto("/join/notatoken");
    await expect(page.getByTestId("join-expired")).toBeVisible();
  });
});

test.describe("member login link (plan 6.1 flow 1, scope 'events' v1.5)", () => {
  test("the member's link → their event; «Мои тои» lists only it; label from the link", async ({ page }, info) => {
    needDb();
    const { eventId, memberLinks } = seed();
    await page.goto(memberLinks[info.project.name]!);
    await expect(page.getByTestId("join-valid")).toBeVisible();
    await expect(page.getByText("Айбек пен Дана")).toBeVisible();
    await page.getByRole("button", { name: kk.auth.join.submit }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${eventId}/guests$`));
    await page.goto("/e");
    await expect(page.getByRole("link")).toHaveCount(1);
    await expect(page.getByRole("link").first()).toHaveAttribute("href", `/e/${eventId}`);
  });
});

test.describe("login by SMS code (console provider, plan 6.1 flow 2)", () => {
  test("phone → code from the console provider → the member's event", async ({ page }, info) => {
    needDb();
    // Seeded demo members: Анасы (mobile project) / Жастар (desktop project).
    const phone = info.project.name === "mobile" ? "8 700 000 00 02" : "+7 700 000 00 03";
    await page.goto("/login");
    await page.getByLabel(kk.auth.login.phoneLabel).fill(phone);
    await page.getByRole("button", { name: kk.auth.login.submit }).click();
    const devCode = page.getByTestId("dev-code");
    await expect(devCode).toBeVisible();
    const code = (await devCode.textContent())!.replace(/\D/g, "");
    expect(code).toHaveLength(6);
    await page.getByLabel(kk.auth.code.inputLabel).fill(code);
    await page.getByRole("button", { name: kk.auth.join.submit }).click();
    await expect(page).toHaveURL(new RegExp(`/e/${seed().eventId}/guests$`));
    await expect(page.getByTestId("event-page")).toContainText("Айбек пен Дана");
  });

  test("non-mobile number is rejected with the message from content/messages", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(kk.auth.login.phoneLabel).fill("+7 905 123 45 67");
    await page.getByRole("button", { name: kk.auth.login.submit }).click();
    await expect(page.getByRole("alert").filter({ hasText: kk.auth.login.errors.phoneNotMobile })).toBeVisible();
  });
});

test.describe("access", () => {
  test("/e without a session → /login (proxy)", async ({ page }) => {
    await page.goto("/e");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a logged-in stranger cannot open someone else's event (404)", async ({ page }, info) => {
    needDb();
    await page.goto(ownerLink(phoneFor(info.project.name, 30)));
    await page.getByRole("button", { name: kk.auth.join.submit }).click();
    await expect(page).toHaveURL(/\/e$/);
    const res = await page.goto(`/e/${seed().eventId}`);
    expect(res?.status()).toBe(404);
  });
});
