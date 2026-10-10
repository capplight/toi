"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useSyncExternalStore, useTransition } from "react";
import type { WaEvent, WaKind } from "@/domain/guests/wa";
import { waText, waUrl } from "@/domain/guests/wa";
import { markSentAction, waClickedAction } from "@/server/actions/guests";
import { Button } from "@/ui/components/Button";
import { Dialog } from "@/ui/components/Sheet";
import { showToast } from "@/ui/components/Toast";

/**
 * «Жіберілді ме?» (plan 6.3, DESIGN_v2 8.5, brief 2.2):
 * 1. the member taps «WhatsApp-қа жіберу» / «Еске салу» — a real wa.me link; we log `wa_clicked` and remember
 *    the family in sessionStorage (try/catch: private mode → memory only);
 * 2. when the page becomes visible again → the sheet «Шақыруды WhatsApp-та жібердіңіз бе?»
 *    («Иә, жіберілді» has focus · «Жоқ, әлі жібермедім»);
 * 3. closed without an answer → the card keeps a row «WhatsApp ашылды · Жіберілді ме?» with the same button.
 * `sent_at` is written only after «Иә» (acceptance 3).
 */

export type Pending = { familyId: string; name: string; kind: WaKind; stage: "away" | "ask" | "row" };

const KEY = "toi.waPending";
let memory: string | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return memory;
  }
}
function writeRaw(v: string | null) {
  memory = v;
  try {
    if (v === null) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, v);
  } catch {
    // private mode / storage blocked: memory only
  }
  listeners.forEach((l) => l());
}

let cacheRaw: string | null | undefined;
let cacheVal: Pending | null = null;
function snapshot(): Pending | null {
  const raw = readRaw();
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cacheVal = raw ? (JSON.parse(raw) as Pending) : null;
    } catch {
      cacheVal = null;
    }
  }
  return cacheVal;
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function setPending(p: Pending | null) {
  writeRaw(p ? JSON.stringify(p) : null);
}

export function usePending(): Pending | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

/** Builds wa.me links from content/messages `wa.*` (client side, one copy of the texts). */
export function useWaLinks(ev: WaEvent, appUrl: string) {
  const t = useTranslations("wa");
  const locale = useLocale();
  return useCallback(
    (kind: WaKind, family: { name: string; token: string; phone: string | null }) =>
      waUrl(
        waText(kind, (k, v) => t(k, v), locale, ev, family, appUrl),
        family.phone,
      ),
    [t, locale, ev, appUrl],
  );
}

/** Start the flow on a wa.me link click (the link itself opens WhatsApp). */
export function startSend(familyId: string, name: string, kind: WaKind) {
  setPending({ familyId, name, kind, stage: "away" });
  void waClickedAction({ familyId, kind }).catch(() => {});
}

/** Mount once per screen: listens for the return from WhatsApp and shows the sheet. */
export function SendAsk() {
  const t = useTranslations("send");
  const pending = usePending();
  const [busy, start] = useTransition();

  useEffect(() => {
    const onVisible = () => {
      const p = snapshot();
      if (document.visibilityState === "visible" && p?.stage === "away") setPending({ ...p, stage: "ask" });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const confirm = useConfirmSent();
  const open = pending?.stage === "ask";
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && pending) setPending({ ...pending, stage: "row" });
      }}
      title={t("ask.title")}
      footer={
        <div className="sheet-actions">
          <Button autoFocus loading={busy} onClick={() => pending && start(() => confirm(pending))}>
            {t("ask.yes")}
          </Button>
          <Button variant="secondary" onClick={() => setPending(null)}>
            {t("ask.no")}
          </Button>
        </div>
      }
    >
      {pending && (
        <>
          <p className="m-0 font-semibold">{pending.name}</p>
          <p className="t-body t-muted mt-1.5 mb-0">
            {pending.kind === "reminder" ? t("ask.bodyReminder") : t("ask.body")}
          </p>
        </>
      )}
    </Dialog>
  );
}

/** «Иә, жіберілді» (sheet or card row): sent_at / reminded_at + toast. */
export function useConfirmSent() {
  const t = useTranslations("send.toast");
  return useCallback(
    async (p: Pick<Pending, "familyId" | "kind">) => {
      const r = await markSentAction({ familyId: p.familyId, kind: p.kind });
      setPending(null);
      if (r.ok) showToast({ message: p.kind === "reminder" ? t("reminder") : t("invite") });
    },
    [t],
  );
}

/**
 * Navigate after a sheet/dialog closes: an open sheet holds a history entry (system «Back» closes it, Ф1) and
 * closing it calls `history.back()` — navigating in the same tick would be undone by that back.
 */
export function afterSheetClosed(fn: () => void) {
  if (!window.history.state?.toiSheet) return fn();
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", run);
    fn();
  };
  window.addEventListener("popstate", run);
  window.setTimeout(run, 400);
}
