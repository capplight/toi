"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { guestStatus } from "@/domain/guests/status";
import type { WaKind } from "@/domain/guests/wa";
import {
  deleteFamilyAction,
  recordAnswerAction,
  restoreFamilyAction,
  revertAnswerAction,
} from "@/server/actions/guests";
import type { GuestsData, GuestView } from "@/server/guests/queries";
import { Button, ButtonLink } from "@/ui/components/Button";
import { Stepper } from "@/ui/components/Controls";
import { StatusBadge } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { AlertDialog, Sheet } from "@/ui/components/Sheet";
import { showToast, useUndoToast } from "@/ui/components/Toast";

type Link = (kind: WaKind, family: { name: string; token: string; phone: string | null }) => string;

/** S4 guest sheet (DESIGN_v2 8.4, design_spec 4.7). */
export function GuestSheet({
  guest,
  data,
  onClose,
  link,
  sentAgo,
  onSend,
  editHref,
}: {
  guest: GuestView | null;
  data: GuestsData;
  onClose: () => void;
  link: Link;
  sentAgo: (iso: string | null) => string | undefined;
  onSend: (g: GuestView, kind: WaKind) => void;
  editHref: (id: string) => string;
}) {
  return (
    <Sheet open={guest !== null} onOpenChange={(o) => !o && onClose()} title={guest?.name ?? ""}>
      {guest && (
        <SheetBody
          key={`${guest.id}-${guest.version}`}
          guest={guest}
          data={data}
          onClose={onClose}
          link={link}
          sentAgo={sentAgo}
          onSend={onSend}
          editHref={editHref}
        />
      )}
    </Sheet>
  );
}

function SheetBody({
  guest: g,
  data,
  onClose,
  link,
  sentAgo,
  onSend,
  editHref,
}: {
  guest: GuestView;
  data: GuestsData;
  onClose: () => void;
  link: Link;
  sentAgo: (iso: string | null) => string | undefined;
  onSend: (g: GuestView, kind: WaKind) => void;
  editHref: (id: string) => string;
}) {
  const t = useTranslations("guestSheet");
  const tc = useTranslations("guests.card");
  const tf = useTranslations("guestForm.seats");
  const ts = useTranslations("common.status");
  const ta = useTranslations("common.actions");
  const te = useTranslations("errors");
  const undoToast = useUndoToast();
  const [busy, start] = useTransition();
  const [answer, setAnswer] = useState<"yes" | null>(null);
  const [seats, setSeats] = useState(g.confirmed ?? g.expected);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = guestStatus({ rsvp: g.rsvp, sentAt: g.sentAt ? new Date(g.sentAt) : null });
  const category = data.categories.find((c) => c.id === g.categoryId)?.label ?? "";
  const addedBy = data.members.find((m) => m.id === g.memberId)?.label ?? "";
  const fam = { name: g.name, token: g.token, phone: g.phone };
  const failed = (r?: { error?: string }) =>
    showToast({ message: te(r?.error === "forbidden" ? "forbidden" : "unknown") });
  /** Server Action call: network failures (offline) → «Интернет жоқ…». */
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
      } catch {
        showToast({ message: te("network") });
      }
    });

  const saveAnswer = (attending: boolean) =>
    run(async () => {
      const r = await recordAnswerAction({ familyId: g.id, attending, seats: attending ? seats : undefined });
      if (!r.ok || !("previous" in r)) return failed("error" in r ? r : undefined);
      onClose();
      const message = attending ? t("answer.toastYes", { seats, name: g.name }) : t("answer.toastNo", { name: g.name });
      undoToast(message, () => void revertAnswerAction({ familyId: g.id, previous: r.previous }));
    });

  const remove = () =>
    run(async () => {
      const r = await deleteFamilyAction({ familyId: g.id });
      setConfirmDelete(false);
      if (!r.ok) return failed(r);
      onClose();
      undoToast(t("delete.toast", { name: g.name }), () => void restoreFamilyAction({ familyId: g.id }));
    });

  const wa =
    status === "notSent"
      ? { kind: "invite" as const, variant: "wa" as const, icon: "wa" as const, label: t("actions.send") }
      : status === "noAnswer"
        ? {
            kind: "reminder" as const,
            variant: "wa-outline" as const,
            icon: "bell" as const,
            label: t("actions.remind"),
          }
        : {
            kind: "invite" as const,
            variant: "wa-outline" as const,
            icon: "send" as const,
            label: t("actions.resend"),
          };

  return (
    <>
      <div className="sheet-status">
        <StatusBadge status={status} seats={status === "yes" ? (g.confirmed ?? 0) : undefined} />
        {status === "noAnswer" && <span>{sentAgo(g.remindedAt ?? g.sentAt)}</span>}
        {g.answeredByMember && status !== "notSent" && status !== "noAnswer" && <span>{ts("answeredByPhone")}</span>}
      </div>
      <dl className="kv">
        <dt>{t("fields.category")}</dt>
        <dd>{category}</dd>
        <dt>{t("fields.seats")}</dt>
        <dd>
          {status === "yes"
            ? tc("seats", { count: g.confirmed ?? 0 })
            : status === "no"
              ? "—"
              : tc("seatsApprox", { count: g.expected })}
        </dd>
        {g.phoneText && (
          <>
            <dt>{t("fields.phone")}</dt>
            <dd className="num">{g.phoneText}</dd>
          </>
        )}
        <dt>{t("fields.table")}</dt>
        <dd>{g.tableNo ? tc("table", { number: g.tableNo }) : t("fields.notSeated")}</dd>
        <dt>{t("fields.addedBy")}</dt>
        <dd>{addedBy}</dd>
      </dl>

      <div className="answer-block">
        <p className="field-label" id={`ans-${g.id}`}>
          {t("answer.title")}
        </p>
        <div className="sheet-actions two" role="group" aria-labelledby={`ans-${g.id}`}>
          <Button
            variant="secondary"
            icon="yes"
            aria-pressed={answer === "yes" || g.rsvp === "yes"}
            onClick={() => setAnswer("yes")}
          >
            {t("answer.yes")}
          </Button>
          <Button
            variant="secondary"
            icon="no"
            aria-pressed={g.rsvp === "no"}
            loading={busy && answer === null}
            onClick={() => saveAnswer(false)}
          >
            {t("answer.no")}
          </Button>
        </div>
        {answer === "yes" && (
          <>
            <Stepper
              value={seats}
              onChange={setSeats}
              label={t("answer.seatsLabel")}
              unit={tf("unit", { count: seats })}
              limitHint={seats <= 1 ? tf("min", { min: 1 }) : tf("max", { max: 20 })}
              decreaseLabel={tf("decrease")}
              increaseLabel={tf("increase")}
            />
            <Button className="mt-3" loading={busy} onClick={() => saveAnswer(true)}>
              {t("answer.save")}
            </Button>
          </>
        )}
      </div>

      <div className="sheet-actions mt-6">
        <a
          className={`btn ${wa.variant}`}
          href={link(wa.kind, fam)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            onSend(g, wa.kind);
            onClose();
          }}
        >
          <Icon name={wa.icon} />
          {wa.label}
        </a>
        <div className="sheet-actions two">
          <ButtonLink href={editHref(g.id)} variant="secondary" icon="pencil">
            {ta("edit")}
          </ButtonLink>
          <Button variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>
            {ta("delete")}
          </Button>
        </div>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("delete.title")}
        description={t("delete.confirm", { name: g.name })}
        confirmLabel={t("delete.yes")}
        cancelLabel={t("delete.no")}
        onConfirm={remove}
      />
    </>
  );
}
