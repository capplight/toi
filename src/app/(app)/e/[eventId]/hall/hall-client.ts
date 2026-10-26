"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import { undoSeatingChangeAction } from "@/server/actions/hall";
import { showToast } from "@/ui/components/Toast";
import type { HistoryEntry } from "@/server/seating/view";

/** Shared client helpers of the «Зал» screens (Ф7b). */

export type HallParams = { view: "map" | "list"; move: string | null };

/** «Схема | Тізім» and the «Ауыстыру» mode live in the URL (system «Back» leaves the move mode). */
export function useHallParams(): HallParams {
  const q = useSearchParams();
  return { view: q.get("view") === "list" ? "list" : "map", move: q.get("move") };
}

/** Change the hall URL without a server round trip (Next syncs `useSearchParams` with the History API). */
export function setHallParams(next: Partial<HallParams>, mode: "push" | "replace" = "replace") {
  const url = new URL(window.location.href);
  if (next.view !== undefined) {
    if (next.view === "list") url.searchParams.set("view", "list");
    else url.searchParams.delete("view");
  }
  if (next.move !== undefined) {
    if (next.move) url.searchParams.set("move", next.move);
    else url.searchParams.delete("move");
  }
  const s = `${url.pathname}${url.search}`;
  if (mode === "push") window.history.pushState(null, "", s);
  else window.history.replaceState(null, "", s);
}

/**
 * Toast «… · Қайтару» bound to a history record (plan 7.6, toast 8 s). The undo goes through `undoSeatingChange`;
 * a partial undo shows `hall.history.partialUndo`.
 */
export function useSeatingUndoToast(eventId: string) {
  const t = useTranslations();
  const router = useRouter();
  return useCallback(
    (message: string, historyId: number | null | undefined) => {
      showToast({
        message,
        undoLabel: historyId ? t("common.actions.undo") : undefined,
        onUndo: historyId
          ? async () => {
              const r = await undoSeatingChangeAction({ eventId, changeId: historyId });
              if ("ok" in r && r.ok && r.skipped > 0)
                showToast({ message: t("hall.history.partialUndo", { count: r.skipped }) });
              else if ("reason" in r && r.reason === "changed")
                showToast({ message: t("hall.history.partialUndo", { count: r.skipped }) });
              else if ("error" in r) showToast({ message: t("errors.forbidden") });
              router.refresh();
            }
          : undefined,
      });
    },
    [eventId, router, t],
  );
}

/**
 * Changes by somebody else (plan 7.5, DESIGN 8.7): `VersionPoll` re-renders the page when `seating_version`
 * grows; here the new history records of other members since the previous render give the toast
 * «Анасы: 2 жаңа өзгеріс» + «Тарих».
 */
export function useOthersChanged(opts: { version: number; recent: HistoryEntry[]; me: string; historyHref: string }) {
  const t = useTranslations("hall.map");
  const router = useRouter();
  const seen = useRef(opts.version);
  const { version, recent, me, historyHref } = opts;
  useEffect(() => {
    const prev = seen.current;
    seen.current = version;
    if (version <= prev) return;
    const theirs = recent.filter(
      (e) => e.seatingVersionAfter > prev && e.actorKind === "member" && e.actorMemberId && e.actorMemberId !== me,
    );
    if (!theirs.length) return;
    const member = theirs[0]!.actorLabel ?? "";
    const count = theirs.filter((e) => e.actorMemberId === theirs[0]!.actorMemberId).length;
    showToast({
      message: t("othersChanged", { member, count }),
      undoLabel: t("othersChangedAction"),
      icon: "history",
      onUndo: () => router.push(historyHref),
    });
  }, [version, recent, me, historyHref, router, t]);
}
