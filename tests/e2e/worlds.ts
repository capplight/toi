import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * e2e worlds (Ф6 review П1): independent copies of the demo event made by global-setup, one per writing spec.
 * `base` is never changed by a spec (except logins in auth.spec) — read the seed numbers there.
 */
export type WorldName =
  "base" | "events" | "guests" | "invite" | "music" | "perf" | "summaryLive" | "screensF3" | "screensF4" | "screensF5";

export type World = {
  eventId: string;
  /** ake, jas, akeSwitch_mobile, akeSwitch_desktop */
  sessions: Record<"ake" | "jas" | "akeSwitch_mobile" | "akeSwitch_desktop", string>;
  /** One-time member login links: Анасы (mobile), Жастар (desktop). */
  memberLinks: Record<string, string>;
  /** Guest links of Анасы's and Жастар's families (invite: all reset to «no answer»; summaryLive: sent, pending). */
  guests: { token: string; name: string }[];
};

export function world(name: WorldName): World {
  const all = JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as Record<
    WorldName,
    World
  >;
  return all[name];
}
