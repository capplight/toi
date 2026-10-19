import { describe, expect, it } from "vitest";
import { assertStepContract, SeatingContractError } from "@/server/seating/adapter";

/** Ф7b brief §2 «Защита адаптера»: a `noop` step must not move anybody (seats never change without a version). */
describe("withSeating contract guard", () => {
  const delta = { familyId: "f1", from: 1, to: 2, locked: true };

  it("throws when a noop step returns deltas", () => {
    expect(() => assertStepContract({ noop: true, result: { deltas: [delta] } })).toThrow(SeatingContractError);
  });

  it("accepts noop without deltas and a normal step with deltas", () => {
    expect(() => assertStepContract({ noop: true, result: { deltas: [] } })).not.toThrow();
    expect(() => assertStepContract({ result: { deltas: [delta] } })).not.toThrow();
    expect(() => assertStepContract({ noop: false, result: { deltas: [delta] } })).not.toThrow();
  });
});
