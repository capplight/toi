import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * Client messages per route (RA review П1). The event layout sends only the small set the frame needs
 * (`SHELL_MESSAGES`); a route layout adds the namespaces of its own client components. Paths may point inside
 * a namespace (`"guestForm.title"`) to send only that subtree. Server components keep using all messages.
 */
export const SHELL_MESSAGES = [
  "common",
  "nav",
  "meta",
  "errors",
  "legal.pilotBanner",
  // EventShell top-bar titles of sub-screens
  "guestForm.title",
  "noAnswer.title",
  "members.title",
  // Ф7b: «Зал» sub-screen titles and the «Схема | Тізім» segment in the top bar
  "hall.map.view",
  "hall.setup.title",
  "hall.order.title",
  "hall.history.title",
  "hall.move.title",
  // Ф10: print page title in the top bar
  "print.title",
] as const;

type Tree = { [k: string]: string | Tree };

export function pickMessages(all: Tree, paths: readonly string[]): Tree {
  const out: Tree = {};
  for (const path of paths) {
    const keys = path.split(".");
    let src: string | Tree | undefined = all;
    for (const k of keys) src = typeof src === "object" ? src[k] : undefined;
    if (src === undefined) throw new Error(`client messages: unknown path ${path}`);
    let dst = out;
    keys.slice(0, -1).forEach((k) => {
      const next = dst[k];
      dst = (dst[k] = typeof next === "object" ? next : {}) as Tree;
    });
    const last = keys[keys.length - 1]!;
    const prev = dst[last];
    dst[last] = typeof prev === "object" && typeof src === "object" ? { ...prev, ...src } : src;
  }
  return out;
}

/** A provider with the shell set plus `extra` — a nested provider replaces (does not merge) the outer one. */
export async function RouteMessages({ extra, children }: { extra: readonly string[]; children: ReactNode }) {
  const all = (await getMessages()) as unknown as Tree;
  return (
    <NextIntlClientProvider messages={pickMessages(all, [...SHELL_MESSAGES, ...extra])}>
      {children}
    </NextIntlClientProvider>
  );
}

/** A provider with exactly `paths` (pages outside the event frame, e.g. the door helper). */
export async function RouteMessagesOnly({ paths, children }: { paths: readonly string[]; children: ReactNode }) {
  const all = (await getMessages()) as unknown as Tree;
  return <NextIntlClientProvider messages={pickMessages(all, paths)}>{children}</NextIntlClientProvider>;
}
