"use client";

import { useTranslations } from "next-intl";
import { collator, daysAgo, guestStatus, plannedSeats } from "@/domain/guests/status";
import type { GuestsData, GuestView } from "@/server/guests/queries";
import { Button, ButtonLink } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { SendAsk, startSend, useConfirmSent, usePending, useWaLinks } from "../send-flow";
import { useSentAgo } from "../GuestsScreen";

const status = (g: GuestView) => guestStatus({ rsvp: g.rsvp, sentAt: g.sentAt ? new Date(g.sentAt) : null });

/** S5 «Жауап бермегендер» (DESIGN_v2 8.3, design_spec 4.8). */
export function NoAnswerScreen({ data, backHref }: { data: GuestsData; backHref: string }) {
  const t = useTranslations("noAnswer");
  const tc = useTranslations("guests.card");
  const link = useWaLinks(data.wa, data.appUrl);
  const sentAgo = useSentAgo(data.event.tz);
  const pending = usePending();
  const confirmSent = useConfirmSent();
  const category = (id: string) => data.categories.find((c) => c.id === id)?.label ?? "";

  // Who waits longest goes first.
  const waiting = data.guests
    .filter((g) => status(g) === "noAnswer")
    .sort((a, b) => (a.sentAt ?? "").localeCompare(b.sentAt ?? ""));
  const notSent = data.guests.filter((g) => status(g) === "notSent").sort((a, b) => collator().compare(a.name, b.name));
  const seats = waiting.reduce((s, g) => s + plannedSeats(g), 0);

  const pendingRow = (g: GuestView) =>
    pending?.familyId === g.id && pending.stage !== "ask" ? (
      <div className="pending-row">
        <Icon name="wa" size="sm" />
        <span>{tc("pendingConfirm")}</span>
        <Button variant="secondary" size="row" width="auto" onClick={() => void confirmSent(pending)}>
          {tc("pendingYes")}
        </Button>
      </div>
    ) : null;

  if (waiting.length === 0 && notSent.length === 0) {
    return (
      <div className="page-narrow">
        <EmptyState
          title={t("empty.title")}
          body={t("empty.body")}
          action={
            <ButtonLink href={backHref} variant="secondary" width="auto">
              {t("empty.back")}
            </ButtonLink>
          }
        />
      </div>
    );
  }

  return (
    <div className="page-narrow">
      <p className="na-intro">{t("intro")}</p>
      {waiting.length > 0 && (
        <section aria-labelledby="na-waiting">
          <h2 className="t-h2 na-head" id="na-waiting">
            {t("count", { families: waiting.length, seats })}
          </h2>
          {waiting.map((g) => {
            const reminded = g.remindedAt ? daysAgo(new Date(g.remindedAt), new Date(), data.event.tz) : null;
            const fam = { name: g.name, token: g.token, phone: g.phone };
            return (
              <article className="na-card" key={g.id} data-testid="na-card">
                <div className="name">{g.name}</div>
                <div className="meta">{t("card.meta", { category: category(g.categoryId), seats: g.expected })}</div>
                <div className="meta">{sentAgo(g.sentAt)}</div>
                {reminded !== null && (
                  <div className="done">
                    <Icon name="check" size="sm" />
                    {reminded === 0 ? t("card.remindedToday") : t("card.remindedDaysAgo", { days: reminded })}
                  </div>
                )}
                {pendingRow(g) ?? (
                  <a
                    className={reminded === 0 ? "btn text" : "btn wa-outline"}
                    href={link("reminder", fam)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => startSend(g.id, g.name, "reminder")}
                  >
                    <Icon name="bell" />
                    {reminded === null ? tc("remind") : t("card.remindAgain")}
                  </a>
                )}
              </article>
            );
          })}
        </section>
      )}
      {notSent.length > 0 && (
        <section aria-labelledby="na-notsent">
          <h2 className="t-h2 na-head" id="na-notsent">
            {t("notSent.title", { count: notSent.length })}
          </h2>
          {notSent.map((g) => (
            <article className="na-card" key={g.id}>
              <div className="name">
                {g.name} <span className="t-muted">· {tc("seatsApprox", { count: g.expected })}</span>
              </div>
              {pendingRow(g) ?? (
                <a
                  className="btn wa"
                  href={link("invite", { name: g.name, token: g.token, phone: g.phone })}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => startSend(g.id, g.name, "invite")}
                >
                  <Icon name="wa" />
                  {tc("sendWhatsApp")}
                </a>
              )}
            </article>
          ))}
        </section>
      )}
      <SendAsk />
    </div>
  );
}
