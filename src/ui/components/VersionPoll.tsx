"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** RA Л2 (Ф6 review Н1): 15 s for the first 2 minutes after the last change or tap, then 60 s. */
export const POLL_FAST_MS = 15_000;
export const POLL_SLOW_MS = 60_000;
export const POLL_FAST_FOR_MS = 120_000;

export function pollDelay(sinceLastChangeMs: number): number {
  return sinceLastChangeMs < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS;
}

/**
 * Plan 7.5: while the tab is visible, ask `/api/e/[eventId]/version` — every 15 s while something is happening,
 * every 60 s after 2 quiet minutes (so a forgotten open tab does not keep the database awake), and at once when
 * the tab comes back. When `version` (or `activity`, if the screen passes it — «Қорытынды») differs from the
 * rendered one, re-render the server page (`router.refresh`). A change or a tap/key on the page counts as activity.
 * Renders nothing.
 */
export function VersionPoll({
  eventId,
  version,
  activity,
}: {
  eventId: string;
  version: number;
  /** Latest send / opening / answer (ISO); omit on screens that only follow seating. */
  activity?: string | null;
}) {
  const router = useRouter();
  const seen = useRef({ version, activity });
  const lastChange = useRef(0);
  useEffect(() => {
    seen.current = { version, activity };
    lastChange.current = Date.now();
  }, [version, activity]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    const schedule = () => {
      if (timer !== null) clearTimeout(timer);
      timer = document.hidden ? null : setTimeout(tick, pollDelay(Date.now() - lastChange.current));
    };
    const check = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const res = await fetch(`/api/e/${eventId}/version`, { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as { version: number; activity: string | null };
        const changed =
          next.version !== seen.current.version ||
          (seen.current.activity !== undefined && next.activity !== seen.current.activity);
        if (changed) {
          seen.current = {
            version: next.version,
            activity: seen.current.activity === undefined ? undefined : next.activity,
          };
          lastChange.current = Date.now();
          router.refresh();
        }
      } catch {
        // offline: try again on the next tick
      } finally {
        busy = false;
      }
    };
    const tick = () => {
      void check().finally(schedule);
    };
    const onVisible = () => {
      if (document.hidden) {
        if (timer !== null) clearTimeout(timer);
        timer = null;
      } else tick();
    };
    const onUse = () => {
      const wasSlow = Date.now() - lastChange.current >= POLL_FAST_FOR_MS;
      lastChange.current = Date.now();
      if (wasSlow) schedule(); // back to 15 s without waiting for the slow tick
    };
    lastChange.current = Date.now();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("pointerdown", onUse, { passive: true });
    document.addEventListener("keydown", onUse);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("pointerdown", onUse);
      document.removeEventListener("keydown", onUse);
    };
  }, [eventId, router]);

  return null;
}
