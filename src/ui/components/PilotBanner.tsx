"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Icon } from "./Icon";

const KEY = "toi.pilotBanner.dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked (private mode, WebView): show, closing works for this page view
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

/**
 * «Тестовая версия» — only for the event owner (decision Д4/14). Ф1 review П3: it can be closed («✕»), the choice
 * is remembered on this device; the frame never shows it on «Зал» (criterion B1).
 */
export function PilotBanner({ isOwner }: { isOwner: boolean }) {
  const t = useTranslations("legal");
  const tc = useTranslations("common.actions");
  const [closed, setClosed] = useState(false);
  // The server does not know the device's choice: hidden on the server, read from storage on the client.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  if (!isOwner || dismissed || closed) return null;
  return (
    <div className="pilot-banner" role="note">
      <Icon name="alert" size="sm" />
      <span className="grow">{t("pilotBanner")}</span>
      <button
        type="button"
        className="pilot-close"
        aria-label={tc("close")}
        onClick={() => {
          setClosed(true);
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            // not remembered — acceptable
          }
        }}
      >
        <Icon name="x" size="sm" />
      </button>
    </div>
  );
}
