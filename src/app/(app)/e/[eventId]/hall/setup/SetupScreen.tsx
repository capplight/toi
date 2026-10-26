"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { type SeatingState, setupHall, totals } from "@/domain/seating";
import { setupHallAction } from "@/server/actions/events";
import { Button } from "@/ui/components/Button";
import { Icon } from "@/ui/components/Icon";
import { showToast } from "@/ui/components/Toast";
import { HallPreview, HallSetupForm, type HallValue } from "@/ui/hall/HallSetupForm";
import { cn } from "@/ui/lib/cn";
import { useSeatingUndoToast } from "../hall-client";

/**
 * H1 «Залды баптау»: the Ф3 form; on the desktop settings left, live preview of the empty hall right with the
 * total card under it (DESIGN 8.6). The totals and «how many families move» come from the engine on the client
 * (the server repeats it, plan 7.1): a smaller hall warns how many families will be re-seated.
 */
export function SetupScreen({
  eventId,
  event,
  state,
  initial,
  hadHall,
  seatingVersion,
}: {
  eventId: string;
  event: { title: string; kind: string };
  state: SeatingState;
  initial: HallValue;
  hadHall: boolean;
  seatingVersion: number;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [value, setValue] = useState<HallValue>(initial);
  const [pending, start] = useTransition();
  const undoToast = useSeatingUndoToast(eventId);

  const { tot, moved } = useMemo(() => {
    const next = setupHall(state, value);
    return {
      tot: totals(next.state),
      moved: next.deltas.filter((d) => d.from !== null).length,
    };
  }, [state, value]);
  const missing = Math.max(0, -tot.free);
  const short = missing > 0;
  const guests = tot.toSeat > 0;

  const save = () =>
    start(async () => {
      const r = await setupHallAction({ eventId, hall: value, seatingVersion });
      if ("error" in r) return void showToast({ message: t("errors.forbidden") });
      if (!r.ok) {
        showToast({ message: t("errors.conflict") });
        router.refresh();
        return;
      }
      undoToast(t("hall.setup.savedToast", { tables: value.tables, seats: value.seatsPerTable }), r.historyId);
      router.push(`/e/${eventId}/hall`);
    });

  const summary = guests && (
    <div className={cn("setup-sum", short && "short")} role="status" data-testid="setup-summary">
      <div>{t("hall.setup.summary.guests", { seats: tot.toSeat })}</div>
      <div className="muted">{t("hall.setup.summary.breakdown", { yes: tot.confirmed, pending: tot.expected })}</div>
      {short ? (
        <div className="bad">
          <Icon name="alert" size="sm" />
          {t("hall.setup.summary.short", { missing, tables: Math.ceil(missing / value.seatsPerTable) })}
        </div>
      ) : (
        <div className="ok">{t("hall.setup.summary.enough", { free: tot.free })}</div>
      )}
    </div>
  );
  const shrink = hadHall && moved > 0 && (
    <div className="info-banner" role="status" data-testid="setup-moves">
      <Icon name="alert" />
      <span>{t("hall.order.preview.moves", { count: moved })}</span>
    </div>
  );

  return (
    <div className="setup-screen">
      <h1 className="t-h1 desk-only" style={{ gridColumn: "1 / -1", margin: 0 }}>
        {t("hall.setup.title")}
      </h1>
      <div style={{ display: "grid", gap: "1rem" }}>
        <HallSetupForm value={value} onChange={setValue} eventKind={event.kind} eventTitle={event.title} />
        <div className="mob-only" style={{ display: "grid", gap: "1rem" }}>
          {summary}
          {shrink}
        </div>
        <div className="setup-actions">
          <Button variant="primary" loading={pending} onClick={save}>
            {t("hall.setup.submit")}
          </Button>
        </div>
      </div>
      <div className="setup-side desk-only">
        <HallPreview value={value} eventKind={event.kind} eventTitle={event.title} />
        {summary}
        {shrink}
      </div>
    </div>
  );
}
