import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { checkMessages, loadDir, main } from "../../scripts/check-messages";

const fixtures = resolve(__dirname, "../fixtures/messages");

describe("check-messages", () => {
  it("valid fixture passes", () => {
    expect(checkMessages(loadDir(resolve(fixtures, "valid")))).toEqual([]);
  });

  it("broken fixture fails: extra key, different variables, missing ru `few`", () => {
    const v = checkMessages(loadDir(resolve(fixtures, "broken")));
    expect(v).toContainEqual({ rule: "keys", key: "extra", detail: "missing in _keys.json" });
    expect(v).toContainEqual({ rule: "keys", key: "extra", detail: "missing in ru.json" });
    expect(v).toContainEqual(expect.objectContaining({ rule: "variables", key: "consent" }));
    expect(v).toContainEqual(
      expect.objectContaining({ rule: "ru-plural", key: "common.seats", detail: expect.stringContaining("few") }),
    );
  });

  it("CLI exits non-zero on the broken fixture and zero on the valid one", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(main(["--dir", resolve(fixtures, "broken")])).toBe(1);
    expect(main(["--dir", resolve(fixtures, "valid")])).toBe(0);
    err.mockRestore();
    log.mockRestore();
  });

  it("detects mismatched rich-text tags, select without other, empty values and ICU errors", () => {
    const keys = { a: "", b: "", c: "", d: "" };
    const kk = {
      a: "<termsLink>x</termsLink>",
      b: "{k, select, x {X} other {Y}}",
      c: "ok",
      d: "{n, plural, other {#}}",
    };
    const ru = {
      a: "<privacyLink>x</privacyLink>",
      b: "{k, select, x {X}}",
      c: " ",
      d: "{n, plural, one {#} few {#} many {#} other {#",
    };
    const rules = checkMessages({ keys, kk, ru }).map((x) => `${x.rule}:${x.key}`);
    expect(rules).toEqual(expect.arrayContaining(["tags:a", "select-other:b", "empty:c", "icu:d"]));
  });

  it("real content/messages pass (757 keys)", () => {
    const input = loadDir(resolve(__dirname, "../../content/messages"));
    expect(checkMessages(input)).toEqual([]);
  });
});
