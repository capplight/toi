import { describe, expect, it } from "vitest";
import { presetParts, presetPlain, presets } from "@/domain/invitations/presets";
import { memberDefaults, validateEvent, validateHallInput } from "@/server/events/service";

describe("invitation presets (Д4/12)", () => {
  it("kk № 1 and № 3 for a wedding, one text for sündet; ru № 1 and № 2", () => {
    expect(presets("uilenu_toi", "kk").map((p) => p.id)).toEqual(["kk-uilenu-1", "kk-uilenu-3"]);
    expect(presets("sundet", "kk")).toHaveLength(1);
    expect(presets("uilenu_toi", "ru").map((p) => p.id)).toEqual(["ru-uilenu-1", "ru-uilenu-2"]);
    expect(presets("other", "kk")).toEqual([]);
  });

  it("name places are highlighted; the saved text has no brackets, endings stay as written by the owner", () => {
    const t = presets("uilenu_toi", "kk")[0]!.text;
    expect(
      presetParts(t)
        .filter((p) => p.mark)
        .map((p) => p.text),
    ).toEqual(["Айбек", "Дана"]);
    expect(presetPlain(t)).toContain("Дананың");
    expect(presetPlain(t)).not.toContain("[");
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
