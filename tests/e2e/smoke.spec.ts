import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// Expected strings are read from content/messages — never copied (decision Д5).
const read = (lang: "kk" | "ru") =>
  JSON.parse(readFileSync(resolve(process.cwd(), "content/messages", `${lang}.json`), "utf8"));
const kk = read("kk");
const ru = read("ru");

test.describe("Ф0 smoke", () => {
  test("/ opens in Kazakh by default with html[lang=kk]", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "kk");
    await expect(page.getByText(kk.common.actions.save, { exact: true })).toBeVisible();
  });

  test("locale cookie ru → html[lang=ru] and Russian strings", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "locale", value: "ru", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByText(ru.common.actions.save, { exact: true })).toBeVisible();
  });

  test("temporary switcher sets the cookie and switches language", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: kk.common.lang.ru }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await page.getByRole("button", { name: ru.common.lang.kk }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "kk");
  });

  test("/api/health answers db: ok", async ({ request }) => {
    test.skip(
      !process.env.DATABASE_URL,
      "No Postgres: DATABASE_URL is not set (CI uses the postgres:16 service; locally use the Neon `dev` branch).",
    );
    const res = await request.get("/api/health");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, db: "ok" });
    expect(typeof body.commit).toBe("string");
    expect(Number.isNaN(Date.parse(body.time))).toBe(false);
  });

  test("/api/health has the documented shape and no extra details", async ({ request }) => {
    const res = await request.get("/api/health");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["commit", "db", "ok", "time"]);
    expect(["ok", "error"]).toContain(body.db);
  });
});
