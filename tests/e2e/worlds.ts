import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * e2e worlds (Ф6 review П1): independent copies of the demo event made by global-setup, one per writing spec.
 * `base` is never changed by a spec (except logins in auth.spec) — read the seed numbers there.
 */
export type WorldName =
  | "base"
  | "events"
  | "guests"
  | "invite"
  | "music"
  | "perf"
  | "summaryLive"
  | "screensF3"
  | "screensF4"
  | "screensF5"
  // Ф7b
  | "hallMobile"
  | "hallDesktop"
  | "hallConcurrency"
  | "screensF7b"
  // Ф8
  | "door"
  | "queue";

export type World = {
  eventId: string;
  /** ake, jas, akeSwitch_mobile, akeSwitch_desktop */
  sessions: Record<"ake" | "jas" | "akeSwitch_mobile" | "akeSwitch_desktop", string> & {
    /** Анасы (seating right) — only in the Ф7b «Зал» worlds. */
    ana?: string;
  };
  /** One-time member login links: Анасы (mobile), Жастар (desktop). */
  memberLinks: Record<string, string>;
  /** Guest links of Анасы's and Жастар's families (invite: all reset to «no answer»; summaryLive: sent, pending). */
  guests: { token: string; name: string }[];
  /** Member phones of this world (+7…): base = the demo numbers. */
  phones: Record<"ake" | "ana" | "jas", string>;
  /** Ф8: the event's door-helper token (/d/{token}). */
  doorToken: string;
};

export function world(name: WorldName): World {
  const all = JSON.parse(readFileSync(resolve(process.cwd(), "playwright/.cache/e2e-seed.json"), "utf8")) as Record<
    WorldName,
    World
  >;
  return all[name];
}
