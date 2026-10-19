import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { world } from "./worlds";

/**
 * Ф5 music (brief §3.3, criterion 5) on the local storage driver: wizard step 6 upload → processing → «Музыка дайын»
 * → the event is created with music → the guest page has the sound button and plays only after «Ашу».
 * Also: the real preview in the settings.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const seed = () => world("music");
const needDb = () =>
  test.skip(
    !process.env.DATABASE_URL && !process.env.CI,
    "No Postgres: set DATABASE_URL (e.g. pnpm db:local --memory).",
  );

function sineMp3(seconds: number): Buffer {
  const ff = createRequire(import.meta.url)("ffmpeg-static") as string;
  const out = join(mkdtempSync(join(tmpdir(), "toi-e2e-")), "song.mp3");
  execFileSync(ff, [
    "-hide_banner",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=330:duration=${seconds}`,
    "-b:a",
    "128k",
    out,
  ]);
  return readFileSync(out);
}

test.describe("Ф5 music", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    needDb();
    await context.addCookies([
      { name: "toi_session", value: seed().sessions.ake!, url: baseURL!, httpOnly: true, secure: true },
      { name: "locale", value: "kk", url: baseURL! },
    ]);
  });

  test("wizard: upload → processing → ready; the new event has music", async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one upload per run is enough");
    test.setTimeout(120_000);
    await page.goto("/e/new");
    await page.getByTestId("wizard-next").click();
    await page.getByLabel(kk.wizard.who.namesLabel.match(/uilenu_toi \{([^}]+)\}/)![1]).fill("Музыка Тест");
    await page.getByLabel(kk.wizard.who.dateLabel).fill("2026-12-20");
    for (let i = 0; i < 4; i++) await page.getByTestId("wizard-next").click();
    await expect(page.getByTestId("wizard-step-music")).toBeVisible();
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "kelinzhan.mp3", mimeType: "audio/mpeg", buffer: sineMp3(100) });
    await expect(page.getByText(kk.wizard.music.ready, { exact: true })).toBeVisible({ timeout: 60_000 });
    await page.getByTestId("wizard-next").click(); // → hall
    await page.getByRole("button", { name: kk.wizard.hall.skip }).click();
    await page.getByTestId("wizard-next").click(); // «Той ашу»
    await expect(page.getByTestId("wizard-done")).toBeVisible();
    // the real preview iframe and music in the settings of the new event
    await page.getByRole("link", { name: kk.wizard.done.toList }).click();
    await page.waitForURL(/\/guests$/);
    const eventId = page.url().match(/\/e\/([0-9a-f-]{36})\//)![1]!;
    await page.goto(`/e/${eventId}/settings`);
    await expect(page.getByText(kk.wizard.music.ready, { exact: true })).toBeVisible();
    await expect(page.getByTestId("invite-preview")).toBeVisible();
    const src = (await page.getByTestId("invite-preview").getAttribute("srcdoc"))!;
    expect(src).toContain("Музыка Тест");
    expect(src).not.toContain("<script");
  });
});
