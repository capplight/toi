import { describe, expect, it } from "vitest";
import { maskPhone, normalizePhone } from "@/domain/guests/phone";

describe("normalizePhone", () => {
  it.each([
    ["8 701 123 45 67", "+77011234567"],
    ["+7 (701) 123-45-67", "+77011234567"],
    ["7011234567", "+77011234567"],
    ["701 123 45 67", "+77011234567"],
    ["77011234567", "+77011234567"],
    ["+77771234567", "+77771234567"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([
    ["", null],
    [null, null],
    [undefined, null],
    ["abc", null],
    ["12345", null],
    ["+7 701 123 45 67 89", null],
    ["9 701 123 45 67", null],
  ])("garbage %s → null", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
});

describe("maskPhone", () => {
  it("masks the middle digits", () => {
    expect(maskPhone("+77011234567")).toBe("+7 701 *** ** 67");
  });
  it("does not echo garbage", () => {
    expect(maskPhone("hello")).toBe("***");
  });
});
