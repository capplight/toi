"use client";

import { useTranslations } from "next-intl";
import { Toaster as SonnerToaster, toast as sonner } from "sonner";
import { DESKTOP, useMediaQuery } from "../lib/hooks";
import { Icon } from "./Icon";

/**
 * Toast rule B1 (DESIGN_v2 7, design review):
 * - one line ≤ 56 px; a long text is cut with «…» (the full text lives in «Өзгерістер тарихы»);
 * - sits above the tab bar, or above the sticky main button when the screen has one;
 * - while visible, the scroll area gets a bottom padding of its height (body.has-toast);
 * - only one at a time; 8 s; «Қайтару»; paused while hovered/touched (Sonner).
 * The door helper variant (top, 4 s) is Ф8.
 */
const DURATION = 8000;

/** Mount once per screen. `hasCta` = the screen has a sticky main button above the tabs. */
export function Toaster({ hasCta = false }: { hasCta?: boolean }) {
  const desktop = useMediaQuery(DESKTOP);
  const tablet = useMediaQuery("(min-width: 768px)");
  // Bottom offsets: tab bar 72 + 8 (+ CTA 80) on phones; 24 / 96 on ≥ 768; 24 on ≥ 1024.
  const bottom = desktop ? 24 : tablet ? (hasCta ? 96 : 24) : 72 + 8 + (hasCta ? 80 : 0);
  return (
    <SonnerToaster
      position={desktop ? "bottom-right" : "bottom-center"}
      visibleToasts={1}
      offset={{ bottom, right: 32 }}
      mobileOffset={{ bottom, left: 16, right: 16 }}
      toastOptions={{ unstyled: true, duration: DURATION }}
      gap={8}
    />
  );
}

function setHasToast(on: boolean) {
  document.body.classList.toggle("has-toast", on);
}

export type ShowToast = { message: string; undoLabel?: string; onUndo?: () => void };

/** Show a toast; any previous toast is dismissed first (one at a time). */
export function showToast({ message, undoLabel, onUndo }: ShowToast): string | number {
  sonner.dismiss();
  setHasToast(true);
  const done = () => setHasToast(false);
  return sonner.custom(
    (id) => (
      <div className="toast" role="status" aria-live="polite">
        <span className="msg" title={message}>
          {message}
        </span>
        {onUndo && undoLabel && (
          <button
            type="button"
            className="undo"
            onClick={() => {
              onUndo();
              sonner.dismiss(id);
              done();
            }}
          >
            <Icon name="undo" size="sm" />
            {undoLabel}
          </button>
        )}
        <span className="timer" aria-hidden="true" />
      </div>
    ),
    { duration: DURATION, onDismiss: done, onAutoClose: done },
  );
}

/** Convenience for the common «… · Қайтару» toast with the label from content/messages. */
export function useUndoToast() {
  const t = useTranslations("common.actions");
  return (message: string, onUndo?: () => void) => showToast({ message, undoLabel: t("undo"), onUndo });
}
