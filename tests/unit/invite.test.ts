import { describe, expect, it } from "vitest";
import { daysUntil, eventDateParts, isLite, monogram, rsvpClosesAt, splitTitle } from "@/domain/invitations/dates";
import { escapeHtml, html, raw } from "@/server/invite/html";
import { ISLAND_JS } from "@/server/invite/island";

describe("guest page dates (Asia/Almaty)", () => {
  it("«Жексенбі · 15 · қараша · 18:00» and ru", () => {
    expect(eventDateParts("2026-11-15", "18:00:00", "kk")).toEqual({
      weekday: "Жексенбі",
      day: "15",
      month: "қараша",
      time: "18:00",
    });
    expect(eventDateParts("2026-11-15", null, "ru")).toEqual({
      weekday: "Воскресенье",
      day: "15",
      month: "ноября",
      time: null,
    });
  });

  it("days until the event count calendar days in Almaty (late evening UTC is already the next day there)", () => {
    expect(daysUntil("2026-11-15", new Date("2026-10-09T12:00:00Z"))).toBe(37);
    expect(daysUntil("2026-11-15", new Date("2026-11-14T18:59:00Z"))).toBe(1); // 23:59 on the 14th
    expect(daysUntil("2026-11-15", new Date("2026-11-14T19:00:00Z"))).toBe(0); // 00:00 on the 15th
    expect(daysUntil("2026-11-15", new Date("2026-11-16T10:00:00Z"))).toBe(-1);
  });

  it("answers close at the start of the event day in Almaty unless set", () => {
    expect(rsvpClosesAt("2026-11-15", null).toISOString()).toBe("2026-11-14T19:00:00.000Z");
    const custom = new Date("2026-11-10T00:00:00Z");
    expect(rsvpClosesAt("2026-11-15", custom)).toBe(custom);
  });

  it("title split around «пен» / «и», seal monogram, lite heuristic", () => {
    expect(splitTitle("Айбек пен Дана")).toEqual({ a: "Айбек", amp: "пен", b: "Дана" });
    expect(splitTitle("Нұрислам")).toBeNull();
    expect(monogram("Айбек пен Дана")).toEqual(["А", "Д"]);
    expect(monogram("Нұрислам")).toEqual(["Н", null]);
    expect(isLite({ reducedMotion: true })).toBe(true);
    expect(isLite({ reducedMotion: false, cores: 4, memoryGb: 2 })).toBe(true);
    expect(isLite({ reducedMotion: false, cores: 8, memoryGb: 2 })).toBe(false);
    expect(isLite({ reducedMotion: false })).toBe(false);
  });
});

describe("tagged templates escape everything except raw() (spike result)", () => {
  it("escapes text and attributes", () => {
    const name = `"><script>alert(1)</script>`;
    expect(html`<p title="${name}">${name}</p>`.toString()).toBe(
      '<p title="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(html`<b>${raw("<i>x</i>")}</b>`.toString()).toBe("<b><i>x</i></b>");
    expect(html`${[html`<a></a>`, "<"]}${null}${false}`.toString()).toBe("<a></a>&lt;");
    expect(escapeHtml("a&b'c")).toBe("a&amp;b&#39;c");
  });

  it("the island script stays within the budget (≤ 10 KB raw)", () => {
    expect(ISLAND_JS.length).toBeLessThan(10_000);
    expect(ISLAND_JS).not.toMatch(/innerHTML\s*=/);
  });
});
