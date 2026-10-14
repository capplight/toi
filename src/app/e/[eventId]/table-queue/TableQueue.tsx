"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { waUrl } from "@/domain/guests/wa";
import { waTableText } from "@/domain/guests/wa-table";
import { markTableSentAction, restartTableQueueAction } from "@/server/actions/tableQueue";
import type { TableQueueView } from "@/server/tableQueue/service";
import { Button, ButtonLink } from "@/ui/components/Button";
import { ProgressBar } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";

/**
 * Ф8 «Үстел нөмірлерін жіберу» (DESIGN 8.18, mockup 12-table-queue): one family at a time.
 * «WhatsApp-қа жіберу» opens wa.me in this tab (`location.assign`, Ф3 review); after coming back —
 * «Жіберілді» (= `table_sent_at`, no «Жіберілді ме?» question) or «Өткізіп жіберу». «Тоқтату» goes back to the
 * start screen; the next visit offers «Тоқтаған жерден жалғастыру (№N)» (first family without `table_sent_at`).
 * Skipped families (this device) come back at the end. Desktop: the queue list on the left, the card on the right.
 */
const SKIP_KEY = (eventId: string) => `toi.tableQueue.skipped.${eventId}`;

function readSkipped(eventId: string): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(SKIP_KEY(eventId)) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function TableQueue({ data }: { data: TableQueueView }) {
  const t = useTranslations("tableQueue");
  const tw = useTranslations("wa");
  const locale = useLocale();
  const [items, setItems] = useState(data.items);
  const [running, setRunning] = useState(false);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [opened, setOpened] = useState<string | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => setItems(data.items), [data.items]);
  useEffect(() => {
    setSkipped(readSkipped(data.event.id));
  }, [data.event.id]);
  const saveSkipped = (ids: string[]) => {
    setSkipped(ids);
    try {
      sessionStorage.setItem(SKIP_KEY(data.event.id), JSON.stringify(ids));
    } catch {
      // private mode: this session only
    }
  };

  const total = items.length;
  const done = items.filter((i) => i.sentAt).length;
  const left = items.filter((i) => !i.sentAt);
  // the next family: first not sent and not skipped; when only skipped are left — the skipped ones again
  const current = left.find((i) => !skipped.includes(i.id)) ?? left[0] ?? null;
  const position = current ? items.indexOf(current) + 1 : 0;

  const text = useMemo(
    () =>
      current
        ? waTableText((k, v) => tw(k, v), locale, data.wa, { name: current.name, token: current.token, tableNo: current.tableNo }, data.appUrl)
        : "",
    [current, tw, locale, data.wa, data.appUrl],
  );

  const sent = (id: string) =>
    start(async () => {
      const r = await markTableSentAction({ familyId: id });
      if (r.ok && "sentAt" in r) setItems((xs) => xs.map((x) => (x.id === id ? { ...x, sentAt: r.sentAt } : x)));
      setOpened(null);
    });
  const skip = (id: string) => {
    saveSkipped([...skipped.filter((x) => x !== id), id]);
    setOpened(null);
  };

  const head = (
    <div className="tq-head">
      <div className="tq-progress">
        <span className="num">{t("progress", { done, total })}</span>
        <ProgressBar value={done} max={Math.max(total, 1)} label={t("progress", { done, total })} tone="success" />
      </div>
      {running && (
        <Button variant="text" size="row" width="auto" onClick={() => setRunning(false)}>
          {t("stop")}
        </Button>
      )}
    </div>
  );

  const list = (
    <ol className="tq-list" aria-label={t("title")}>
      {items.map((i) => (
        <li key={i.id} className={i.id === current?.id ? "cur" : undefined} aria-current={i.id === current?.id ? "step" : undefined}>
          <span className="tq-n">{i.tableNo}</span>
          <span className="tq-nm">{i.name}</span>
          <span className="tq-st">
            {i.sentAt ? (
              <>
                <Icon name="yes" size="sm" />
                {t("statusSent")}
              </>
            ) : skipped.includes(i.id) ? (
              t("statusSkipped")
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );

  // all sent
  if (total > 0 && done === total)
    return (
      <div className="tq">
        {head}
        <section className="card tq-card tq-done">
          <Icon name="yes" />
          <h2 className="t-h2">{t("allSent.title")}</h2>
          <p>{t("allSent.body", { count: total })}</p>
          <div className="tq-actions">
            <ButtonLink href={`/e/${data.event.id}/summary`} variant="secondary">
              {t("backToSummary")}
            </ButtonLink>
            <Button
              variant="text"
              loading={busy}
              onClick={() =>
                start(async () => {
                  await restartTableQueueAction({ eventId: data.event.id });
                  setItems((xs) => xs.map((x) => ({ ...x, sentAt: null })));
                  saveSkipped([]);
                })
              }
            >
              {t("allSent.restart")}
            </Button>
          </div>
        </section>
      </div>
    );

  // start screen
  if (!running)
    return (
      <div className="tq">
        {head}
        <section className="card tq-card">
          <h2 className="t-h2">{t("title")}</h2>
          <p>{t("intro", { count: total })}</p>
          {data.notSeated > 0 && <p className="note">{t("notSeatedNote", { count: data.notSeated })}</p>}
          <div className="tq-actions">
            {done > 0 && current ? (
              <Button onClick={() => setRunning(true)} icon="wa">
                {t("resume", { position })}
              </Button>
            ) : (
              <Button onClick={() => setRunning(true)} icon="wa" disabled={total === 0}>
                {t("start")}
              </Button>
            )}
          </div>
        </section>
        {total > 0 && <div className="desk-only">{list}</div>}
      </div>
    );

  return (
    <div className="tq">
      {head}
      <div className="tq-grid">
        <div className="desk-only tq-side">{list}</div>
        {current ? (
          <section className="card tq-card" aria-live="polite">
            {skipped.includes(current.id) && <p className="note">{t("skippedTitle")}</p>}
            <h2 className="tq-name">{current.name}</h2>
            <p className="tq-table">{t("current.table", { number: current.tableNo })}</p>
            {current.phone ? (
              <>
                <p className="tq-phone num">{current.phone}</p>
                <div className="tq-preview">
                  <span className="lbl">{t("current.previewLabel")}</span>
                  <p>{text}</p>
                </div>
                {opened === current.id ? (
                  <div className="tq-actions">
                    <Button loading={busy} onClick={() => sent(current.id)} icon="check">
                      {t("next")}
                    </Button>
                    <Button variant="text" onClick={() => skip(current.id)}>
                      {t("skip")}
                    </Button>
                  </div>
                ) : (
                  <div className="tq-actions">
                    <Button
                      variant="wa"
                      icon="wa"
                      onClick={() => {
                        setOpened(current.id);
                        window.location.assign(waUrl(text, current.phone));
                      }}
                    >
                      {t("open")}
                    </Button>
                    <Button variant="text" onClick={() => skip(current.id)}>
                      {t("skip")}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="note">{t("current.noPhone")}</p>
                <div className="tq-actions">
                  <Button variant="secondary" onClick={() => skip(current.id)}>
                    {t("skip")}
                  </Button>
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="card tq-card">
            <p>{t("done", { count: done })}</p>
            <ButtonLink href={`/e/${data.event.id}/summary`} variant="secondary">
              {t("backToSummary")}
            </ButtonLink>
          </section>
        )}
      </div>
    </div>
  );
}
