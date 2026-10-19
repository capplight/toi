"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

/** `matchMedia` as React state (SSR: false). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const DESKTOP = "(min-width: 1024px)";

/**
 * The system «Back» closes an open sheet/dialog (Ф1 brief 3.2, DESIGN_v2 7): opening pushes a history entry,
 * popstate closes; closing from the UI pops our entry.
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const pushed = useRef(false);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) {
      if (pushed.current) {
        pushed.current = false;
        if (window.history.state?.toiSheet) window.history.back();
      }
      return;
    }
    window.history.pushState({ ...(window.history.state ?? {}), toiSheet: true }, "");
    pushed.current = true;
    const onPop = () => {
      if (!pushed.current) return;
      pushed.current = false;
      close.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open]);
}
