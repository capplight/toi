import { describe, expect, it } from "vitest";
import kk from "../../content/messages/kk.json" with { type: "json" };
import { pickMessages, SHELL_MESSAGES } from "@/i18n/client-messages";

describe("RA review П1: client messages per route", () => {
  it("picks namespaces and subtrees; merges a namespace with its subtree; unknown path throws", () => {
    const all = { a: { x: "1", y: { z: "2" } }, b: { q: "3" }, c: "4" };
    expect(pickMessages(all, ["a.y", "c"])).toEqual({ a: { y: { z: "2" } }, c: "4" });
    expect(pickMessages(all, ["a.y", "a"])).toEqual({ a: { x: "1", y: { z: "2" } } });
    expect(() => pickMessages(all, ["nope"])).toThrow(/unknown path nope/);
  });

  it("the shell set exists in content/messages and is a small part of all client strings", () => {
    const shell = JSON.stringify(pickMessages(kk as never, SHELL_MESSAGES)).length;
    expect(shell).toBeLessThan(JSON.stringify(kk).length / 5);
    expect(pickMessages(kk as never, ["guestForm.title"])).toEqual({ guestForm: { title: kk.guestForm.title } });
  });
});
