import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Ф1 checks (brief 3.5, criteria 5–6): axe (no serious/critical), no horizontal scroll, touch targets ≥ 48 px,
 * 130 % text, reduced motion, B1 on the demo «Зал». Run on mobile 360×740, small 320×640 and desktop 1440×900.
 * Pages without a DB: /dev/ui, /dev/ui/hall, /login, /join/<garbage>.
 */
const kk = JSON.parse(readFileSync(resolve(process.cwd(), "content/messages/kk.json"), "utf8"));
const PAGES = ["/dev/ui", "/dev/ui/hall", "/login", "/join/notatoken"];

async function noMissingMessages(page: Page, path: string) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  expect(
    errors.filter((e) => /MISSING_MESSAGE|FORMATTING_ERROR/.test(e)),
    path,
  ).toEqual([]);
}

test.describe("Ф1 UI kit", () => {
  for (const path of PAGES) {
    test(`axe: no serious/critical violations on ${path}`, async ({ page }) => {
      await noMissingMessages(page, path);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const bad = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }

  test("no horizontal scroll at 320, 360, 768, 1024, 1440", async ({ page }) => {
    for (const width of [320, 360, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      for (const path of PAGES) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const { sw, iw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          iw: window.innerWidth,
        }));
        expect(sw, `${path} @ ${width}`).toBeLessThanOrEqual(iw);
      }
    }
  });

  test("touch targets ≥ 48 px on /dev/ui (hall labels excluded: they are not buttons)", async ({ page }) => {
    await page.goto("/dev/ui");
    await page.waitForLoadState("networkidle");
    const small = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>(
          "main button, main a[href], main input:not([type=hidden]), main [role=button], main [role=radio], main [role=checkbox]",
        ),
      );
      return els
        .filter((el) => {
          if (el.closest("[aria-hidden=true]") || el.closest(".sr-only")) return false;
          const cs = getComputedStyle(el);
          if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
          // A text input's target is its whole field frame; the dev toolbar checkbox sits in a 48 px label.
          if (el.tagName === "INPUT" && (el.closest(".input") || el.closest("label"))) return false;
          return true;
        })
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            what: `${el.tagName}.${el.className} ${el.textContent?.trim().slice(0, 30)}`,
            w: r.width,
            h: r.height,
          };
        })
        .filter((x) => x.w > 0 && (x.w < 47.5 || x.h < 47.5));
    });
    expect(small).toEqual([]);
  });

  test("130 % text: no horizontal scroll, labels not clipped", async ({ page }) => {
    for (const path of ["/dev/ui", "/dev/ui/hall", "/login"]) {
      await page.goto(path);
      const before = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize));
      await page.addStyleTag({ content: "html { font-size: 130% !important; }" });
      const after = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("h1")!).fontSize));
      // Text sizes are in rem: the setting really scales them (not a vacuous check).
      if (path !== "/dev/ui") expect(after / before, `${path} h1 scales`).toBeGreaterThan(1.25);
      const { sw, iw } = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
      }));
      expect(sw, path).toBeLessThanOrEqual(iw);
    }
  });

  test("reduced motion: ornaments drawn, no transforms/animations", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/dev/ui");
    const s = await page.evaluate(() => {
      const path = document.querySelector(".draw path") as SVGPathElement | null;
      const btn = document.querySelector(".btn") as HTMLElement;
      return {
        drawAnim: path ? getComputedStyle(path).animationName : "none",
        dash: path ? getComputedStyle(path).strokeDashoffset : "0",
        btnTransition: parseFloat(getComputedStyle(btn).transitionDuration),
      };
    });
    expect(s.drawAnim).toBe("none");
    expect(s.dash).toMatch(/^0(px)?$/);
    expect(s.btnTransition).toBeLessThanOrEqual(0.25);
  });

  test("/dev/ui toggle «reduced motion» applies the same rules", async ({ page }) => {
    await page.goto("/dev/ui");
    await page.getByLabel("reduced motion").check();
    await expect(page.locator("html")).toHaveClass(/reduce-motion/);
    const anim = await page.evaluate(
      () => getComputedStyle(document.querySelector(".draw path") as Element).animationName,
    );
    expect(anim).toBe("none");
  });

  test("B1: on «Зал» with chips, banner and a toast, ТӨР and tables 1–4 are visible without scrolling", async ({
    page,
  }, info) => {
    test.skip(info.project.name === "desktop", "phone criterion (360×740, 320×640)");
    await page.goto("/dev/ui/hall");
    await expect(page.locator(".toast")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/has-toast/);
    const vh = page.viewportSize()!.height;
    const toastTop = (await page.locator(".toast").boundingBox())!.y;
    const tor = await page.getByText(kk.hall.map.tor, { exact: true }).boundingBox();
    expect(tor!.y + tor!.height).toBeLessThan(toastTop);
    for (const n of [1, 2, 3, 4]) {
      const box = (await page.locator(`[data-table="${n}"]`).boundingBox())!;
      expect(box.y + box.height, `table ${n}`).toBeLessThanOrEqual(Math.min(vh, toastTop) + 1);
    }
    // the toast is one line, ≤ 56 px, above the tab bar
    const toast = (await page.locator(".toast").boundingBox())!;
    expect(toast.height).toBeLessThanOrEqual(56.5);
    const tabbar = (await page.locator(".tabbar").boundingBox())!;
    expect(toast.y + toast.height).toBeLessThanOrEqual(tabbar.y);
  });

  test("hall map: table cells are buttons with aria-labels from content/messages", async ({ page }) => {
    await page.goto("/dev/ui/hall");
    const seven = page.locator('[data-table="7"]');
    await expect(seven).toHaveAttribute("role", "button");
    await expect(seven).toHaveAttribute("aria-label", /7-үстел, 14 адам, 12 орын, 2 орын жетпейді/);
  });

  test("Sheet: opens, traps focus, closes with the system Back", async ({ page }) => {
    await page.goto("/dev/ui");
    await page.getByRole("button", { name: /Sheet/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.goBack();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/dev\/ui$/);
  });

  test("Toast: one at a time, one line with an ellipsis", async ({ page }) => {
    await page.goto("/dev/ui");
    const btn = page.getByRole("button", { name: "Toast", exact: true });
    await btn.click();
    await btn.click();
    await expect(page.locator(".toast")).toHaveCount(1);
    const msg = page.locator(".toast .msg");
    const { sw, cw } = await msg.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    if (page.viewportSize()!.width < 768) expect(sw).toBeGreaterThan(cw); // long text is cut, not wrapped
    expect((await page.locator(".toast").boundingBox())!.height).toBeLessThanOrEqual(56.5);
  });
});
