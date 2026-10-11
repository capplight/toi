"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Plan 7.5: while the tab is visible, ask for `seating_version` every 15 s (and once when the tab comes back);
 * when it differs from the rendered one, re-render the server page (`router.refresh`). Renders nothing.
 */
export function VersionPoll({
  eventId,
  version,
  everyMs = 15_000,
}: {
  eventId: string;
  version: number;
  everyMs?: number;
}) {
  const router = useRouter();
  const seen = useRef(version);
  useEffect(() => {
    seen.current = version;
  }, [version]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let busy = false;
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const res = await fetch(`/api/e/${eventId}/version`, { cache: "no-store" });
        if (!res.ok) return;
        const { version: v } = (await res.json()) as { version: number };
        if (v !== seen.current) {
          seen.current = v;
          router.refresh();
        }
      } catch {
        // offline: try again on the next tick
      } finally {
        busy = false;
      }
    };
    const start = () => {
      if (timer === null) timer = setInterval(check, everyMs);
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisible = () => {
      if (document.hidden) stop();
      else {
        void check();
        start();
      }
    };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [eventId, everyMs, router]);

  return null;
}
