import type { Env } from "@/server/env";
import { ConsoleProvider } from "./console";
import { MobizonProvider } from "./mobizon";
import { SmscKzProvider } from "./smsc";
import type { SmsProvider } from "./types";

export type { SmsProvider, SmsStatus, SendResult } from "./types";
export { ConsoleProvider, MobizonProvider, SmscKzProvider };

/**
 * Provider by name. Returns null when the provider's variables are not set
 * (optional module switched off, brief Ф0 3.3).
 */
export function createSmsProvider(
  name: "console" | "smsc" | "mobizon",
  e: Pick<Env, "smsc" | "mobizon">,
): SmsProvider | null {
  switch (name) {
    case "console":
      return new ConsoleProvider();
    case "smsc":
      return e.smsc ? new SmscKzProvider(e.smsc) : null;
    case "mobizon":
      return e.mobizon ? new MobizonProvider(e.mobizon) : null;
  }
}
