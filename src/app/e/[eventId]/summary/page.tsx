import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { isLocale } from "@/i18n/config";
import { requireUser } from "@/server/authz";
import { db } from "@/server/db";
import { summaryView } from "@/server/summary/queries";
import { EmptyState, EventHero, LinkRow, LinkRows, ProgressBar } from "@/ui/components/Display";
import { Icon, type IconName } from "@/ui/components/Icon";
import { VersionPoll } from "@/ui/components/VersionPoll";
import { memberOr404 } from "../guests/data";

/** Numbers of a formatted message in the large stat style (the text stays one string from content/messages). */
function Stat({ text }: { text: string }): ReactNode {
  return text.split(/(\d[\d   ]*\d|\d)/).map((part, i) =>
    i % 2 === 1 ? (
      <b key={i} className="num">
        {part}
      </b>
    ) : (
      part
    ),
  );
}

function Tile({ kind, text, note }: { kind: "yes" | "inv" | "no"; text: string; note?: string }) {
  const icon: IconName = kind === "yes" ? "yes" : kind === "inv" ? "clock" : "no";
  const [label, ...rest] = text.split(" · ");
  return (
    <div className={`sum-tile ${kind}`}>
      <Icon name={icon} />
      <b className="lbl">{label}</b>
      {rest.map((r) => (
        <span key={r} className="val">
          <Stat text={r} />
        </span>
      ))}
      {note && <span className="note">{note}</span>}
    </div>
  );
}

/**
 * «Қорытынды» (Ф6, DESIGN 8.19): the restaurant number, answers, categories, invitation funnel (owner),
 * lists and the budget entry (phone). Server-rendered on every visit + `seating_version` polling (plan 7.5).
 */
export default async function SummaryPage({ params }: PageProps<"/e/[eventId]/summary">) {
  const { eventId } = await params;
  await memberOr404(eventId);
  const user = await requireUser();
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "kk";
  const v = await summaryView(db(), user, eventId, { locale });
  const t = await getTranslations("summary");
  const tu = await getTranslations("common.units");
  const tk = await getTranslations("events.kind");
  const tn = await getTranslations("nav");
  const th = await getTranslations("hall.setup");
  const base = `/e/${eventId}`;

  const hero = (
    <EventHero
      compact="phone"
      title={v.event.title}
      kindLabel={tk("select", { kind: v.event.kind })}
      dateLine={v.event.dateLine}
      venue={v.event.venue ?? undefined}
    />
  );
  const budget = v.budget && (
    <div className="mob-only">
      <LinkRows>
        <LinkRow href={`${base}/budget`} icon="wallet" title={tn("budget")} />
      </LinkRows>
    </div>
  );

  if (v.empty) {
    return (
      <div className="summary">
        <h1 className="t-h1 page desk-only">{t("title")}</h1>
        {hero}
        <EmptyState title={t("empty")} />
        {budget}
        <VersionPoll eventId={eventId} version={v.version} />
      </div>
    );
  }

  const { people, tables } = v.restaurant;
  const restaurant = tables === null ? tu("people", { count: people }) : t("restaurant", { people, tables });
  // Share of the seats to plan for (all categories add up to «N адам»).
  const maxCat = Math.max(1, people);
  const funnelMax = Math.max(1, v.funnel?.total ?? 1);

  return (
    <div className="summary">
      <h1 className="t-h1 page desk-only">{t("title")}</h1>
      {hero}
      <div className="sum-top">
        <section
          className="sum-main"
          aria-label={tables === null ? restaurant : t("restaurantA11y", { people, tables })}
        >
          <p className="line" aria-hidden="true">
            <Stat text={restaurant} />
          </p>
          <p className="hint">{t("restaurantHint")}</p>
          {tables === null && (
            <p className="hint">
              <a href={`${base}/hall`}>{th("title")}</a>
            </p>
          )}
        </section>
        <div className="sum-tiles">
          <Tile kind="yes" text={t("tiles.yes", v.tiles.yes)} />
          <Tile
            kind="inv"
            text={t("tiles.pending", { families: v.tiles.pending.families, seats: v.tiles.pending.seats })}
            note={
              v.tiles.pending.notSent > 0 ? t("tiles.pendingNotSent", { count: v.tiles.pending.notSent }) : undefined
            }
          />
          <Tile kind="no" text={t("tiles.no", v.tiles.no)} />
        </div>
      </div>

      <div className="sum-cols">
        <section className="sum-card" aria-labelledby="sum-cats">
          <h2 id="sum-cats" className="t-h2">
            {t("byCategory.title")}
          </h2>
          <ul className="sum-bars">
            {v.byCategory.map((c) => {
              const label = t("byCategory.row", { category: c.label, seats: c.seats });
              return (
                <li key={c.id}>
                  <span className="row">
                    <span className="sw" style={{ background: `var(--cat-${c.code ?? "baska"})` }} aria-hidden="true" />
                    {label}
                  </span>
                  <ProgressBar value={c.seats} max={maxCat} label={label} />
                </li>
              );
            })}
          </ul>
        </section>

        <div className="sum-side">
          {v.funnel && (
            <section className="sum-card" aria-labelledby="sum-funnel">
              <h2 id="sum-funnel" className="t-h2">
                {t("funnel.title")}
              </h2>
              <ul className="sum-bars">
                {(["sent", "opened", "answered"] as const).map((k) => {
                  const label = t(`funnel.${k}`, { count: v.funnel![k] });
                  return (
                    <li key={k}>
                      <span className="row">{label}</span>
                      <ProgressBar value={v.funnel![k]} max={funnelMax} label={label} />
                    </li>
                  );
                })}
              </ul>
              <p className="hint">{t("funnel.hint")}</p>
            </section>
          )}
          <LinkRows title={t("byList.title")}>
            {v.byList.map((m) => (
              <LinkRow
                key={m.memberId}
                href={m.isMe ? `${base}/guests` : `${base}/guests?list=${m.memberId}`}
                icon="users"
                title={m.title}
                subtitle={`${tu("families", { count: m.families })} · ${tu("seatsApprox", { count: m.seats })}`}
              />
            ))}
          </LinkRows>
          {budget}
        </div>
      </div>
      <VersionPoll eventId={eventId} version={v.version} />
    </div>
  );
}
