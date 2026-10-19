import { describe, expect, it } from "vitest";
import { dupPairs, nameKey, pairKey, similar } from "@/domain/guests/duplicates";
import { fullReseat } from "@/domain/seating";
import { expectedDuplicatePairs, sampleFamilies } from "../fixtures/sample-event";
import { sampleState } from "./seating/helpers";

describe("duplicates (plan 7.7)", () => {
  it("nameKey: first meaningful word, stop words and parentheses removed", () => {
    expect(nameKey("Ерлан ағай отбасы")).toBe("ерлан");
    expect(nameKey("Сапарбаевтар (бас құда)")).toBe("сапарбаевтар");
    expect(nameKey("Нұрлан мен Әсем")).toBe("нұрлан");
    expect(nameKey("ағай отбасы")).toBe("");
    expect(nameKey(null)).toBe("");
    expect(nameKey("«Бақытжан», Омаров")).toBe("бақытжан");
  });

  it("similar: same key, empty keys never match", () => {
    expect(similar("Ерлан", "Ерлан ағай отбасы")).toBe(true);
    expect(similar("ағай", "апай")).toBe(false);
    expect(similar("Ерлан", "Ербол")).toBe(false);
  });

  it("sample: exactly one pair — f38 (table 12) and f15 (table 15), smaller table first", () => {
    const tables = new Map(fullReseat(sampleState()).state.families.map((f) => [f.id, f.tableNo]));
    const fams = sampleFamilies.map((f) => ({
      id: f.id,
      name: f.name,
      rsvp: f.rsvp,
      tableNo: tables.get(f.id) ?? null,
    }));
    const pairs = dupPairs(fams);
    expect(pairs.map(([a, b]) => [a.id, b.id])).toEqual([["f38", "f15"]]);
    expect(pairs.map(([a, b]) => pairKey(a.id, b.id))).toEqual(expectedDuplicatePairs.map(([a, b]) => pairKey(a, b)));
  });

  it("reviewed pairs and declined families are excluded; unseated sorts last", () => {
    const fams = [
      { id: "a", name: "Ерлан", rsvp: "yes" as const, tableNo: null },
      { id: "b", name: "Ерлан ағай", rsvp: "pending" as const, tableNo: 3 },
      { id: "c", name: "Ерлан", rsvp: "no" as const, tableNo: null },
    ];
    expect(dupPairs(fams).map(([x, y]) => [x.id, y.id])).toEqual([["b", "a"]]);
    expect(dupPairs(fams, new Set([pairKey("b", "a")]))).toEqual([]);
  });
});
