import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasPlaceholder, presets } from "@/domain/invitations/presets";
import { checkPresets, PRESET_KINDS } from "../../scripts/check-presets";
import { memberDefaults, validateEvent, validateHallInput } from "@/server/events/service";

describe("invitation presets (А6, content/invitation-presets.json)", () => {
  it("kk № 1 and № 3 for a wedding, one text for sündet; ru № 1 and № 2; «Басқа» has texts", () => {
    expect(presets("uilenu_toi", "kk").map((p) => p.id)).toEqual(["kk-uilenu-1", "kk-uilenu-3"]);
    expect(presets("sundet", "kk")).toHaveLength(1);
    expect(presets("uilenu_toi", "ru").map((p) => p.id)).toEqual(["ru-uilenu-1", "ru-uilenu-2"]);
    expect(presets("other", "kk").length).toBeGreaterThan(0);
  });

  it("the content file passes the check: all kinds × kk/ru, no samples, no names-with-endings", () => {
    const file = JSON.parse(readFileSync(resolve(process.cwd(), "content/invitation-presets.json"), "utf8"));
    expect(checkPresets(file)).toEqual([]);
    for (const kind of PRESET_KINDS) for (const p of presets(kind, "kk")) expect(hasPlaceholder(p.text)).toBe(false);
  });

  it("the check catches a […] sample, a variable, a missing kind and a duplicate id", () => {
    const v = checkPresets({
      version: 1,
      kk: {
        uilenu_toi: [{ id: "a", text: "Ұлымыз [Айбек] пен" }],
        kyz_uzatu: [{ id: "a", text: "{title} тойына" }],
        sundet: [{ id: "c", text: "ok" }],
        besik: [{ id: "d", text: "ok" }],
        merey: [{ id: "e", text: "<b>ok</b>" }],
      },
      ru: {},
    });
    const rules = v.map((x) => `${x.rule}:${x.where}`);
    expect(rules).toEqual(
      expect.arrayContaining([
        "chars:kk/uilenu_toi/a",
        "chars:kk/kyz_uzatu/a",
        "id:kk/kyz_uzatu/a",
        "chars:kk/merey/e",
        "kind:kk/other",
        "kind:ru/uilenu_toi",
      ]),
    );
  });

  it("hasPlaceholder: any square bracket blocks saving", () => {
    expect(hasPlaceholder("Сіздерді [Дана]ның тойына")).toBe(true);
    expect(hasPlaceholder("half ] bracket")).toBe(true);
    expect(hasPlaceholder("Ұлымыз бен келініміздің")).toBe(false);
    expect(hasPlaceholder(null)).toBe(false);
  });
});

describe("event and member validation", () => {
  const base = {
    kind: "uilenu_toi" as const,
    title: " Айбек пен Дана ",
    startsOn: "2026-11-15",
    startsAt: "18:00",
    templateId: "ak-shanyrak" as const,
  };
  it("a [ ] sample in the invitation text → placeholderLeft (А6)", () => {
    expect(validateEvent({ ...base, invitationTextKk: "Ұлымыз [Айбек] пен" })).toEqual({
      ok: false,
      field: "textKk",
      error: "placeholderLeft",
    });
    expect(validateEvent({ ...base, invitationTextRu: "Наш [сын]" })).toMatchObject({ error: "placeholderLeft" });
  });
  it("title trimmed as typed; map link must start with https://", () => {
    const v = validateEvent(base);
    expect(v.ok && v.value.title).toBe("Айбек пен Дана");
    expect(validateEvent({ ...base, mapUrl: "http://x" })).toEqual({ ok: false, field: "mapUrl" });
    expect(validateEvent({ ...base, startsOn: "15.11.2026" })).toEqual({ ok: false, field: "date" });
  });
  it("hall limits 1–60 tables, 6–16 seats, 2 or 4 rows", () => {
    expect(validateHallInput({ columns: 4, tables: 60, seatsPerTable: 16 })).toBe(true);
    expect(validateHallInput({ columns: 4, tables: 0, seatsPerTable: 12 })).toBe(false);
    expect(validateHallInput({ columns: 4, tables: 10, seatsPerTable: 17 })).toBe(false);
  });
  it("«Кім?» → label, kind, rights, default category", () => {
    expect(memberDefaults("mother", null, "kk")).toMatchObject({ label: "Анасы", kind: "parent", category: "nagashy" });
    expect(memberDefaults("couple", null, "ru")).toMatchObject({
      kind: "couple",
      category: "dos",
      rights: { canEditSeating: false },
    });
    expect(memberDefaults("other", " Әпкесі ", "kk")).toMatchObject({ label: "Әпкесі", kind: "other" });
  });
});
