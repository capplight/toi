import { describe, expect, it } from "vitest";
import { otpText } from "../../scripts/sms-test";

// Decision А2 / CONTENT_REVIEW 6.8: sms.otp with a 20-char domain fits one UCS-2 segment (70 chars).
describe("sms.otp length", () => {
  for (const lang of ["kk", "ru"] as const) {
    it(`${lang}: code 482913 + toi-pilot.vercel.app ≤ 70 chars, WebOTP line last`, () => {
      const text = otpText(lang, "482913", "toi-pilot.vercel.app");
      expect(text.length).toBeLessThanOrEqual(70);
      expect(text.split("\n").at(-1)).toBe("@toi-pilot.vercel.app #482913");
    });
  }
});
