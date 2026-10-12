import { describe, expect, it } from "vitest";
import { POLL_FAST_MS, POLL_SLOW_MS, pollDelay } from "@/ui/components/VersionPoll";

describe("RA Л2: version polling back-off", () => {
  it("15 s during the first 2 minutes after a change or tap, then 60 s", () => {
    expect(pollDelay(0)).toBe(POLL_FAST_MS);
    expect(pollDelay(119_999)).toBe(15_000);
    expect(pollDelay(120_000)).toBe(POLL_SLOW_MS);
    expect(pollDelay(3_600_000)).toBe(60_000);
  });
});
