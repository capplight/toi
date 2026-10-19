import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { maskPhones, PHONE_MASK, scrubEvent } from "@/sentry.scrub";

describe("sentry scrub", () => {
  it.each(["+77011234567", "77011234567", "87011234567", "+7 (701) 123-45-67", "8 701 123 45 67"])(
    "masks %s",
    (phone) => {
      expect(maskPhones(`call ${phone} now`)).toBe(`call ${PHONE_MASK} now`);
    },
  );

  it("removes request bodies/cookies and masks phones deep in the event", () => {
    const event = {
      type: undefined,
      message: "otp for +77011234567",
      request: { url: "https://x/api?phone=87011234567", data: { phone: "+77011234567" }, cookies: { s: "1" } },
      extra: { nested: [{ phone: "+7 701 123 45 67" }] },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/701/);
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
  });
});
