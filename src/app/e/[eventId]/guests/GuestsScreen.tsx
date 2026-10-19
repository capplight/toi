import { getTranslations } from "next-intl/server";
import { compareGuests, daysAgo, guestStatus, listTotals } from "@/domain/guests/status";
import type { GuestsData } from "@/server/guests/queries";
import { ButtonLink } from "@/ui/components/Button";
import { Banner, EmptyState, EventHero, LinkRow, LinkRows } from "@/ui/components/Display";
import { guestListHtml, StaticCounter } from "./list-html";
import { GuestsIsland } from "./GuestsIsland";
import { asLike, chatUrl } from "./list-shared";

/**
 * S1 «Менің тізімім» (DESIGN_v2 8.1, design_spec 4.1, mockup 01) — a server component (RA Л1, Ф6 review §4).
 * The cards and groups are one server HTML string (no hydration), the counters server elements without handlers; `GuestsIsland` is the only hydrated part
 * (search, sheet, «Жіберілді ме?», one delegated listener). Same markup and classes as before.
 */
export async function GuestsScreen({
  data,
  kindLabel,
  flashId,
}: {
  data: GuestsData;
  kindLabel: string;
  flashId: string | null;
}) {
  const t = await getTranslations("guests.list");
  const tu = await getTranslations("common.units");
  const tc = await getTranslations("guests.card");
  const ts = await getTranslations("common.status");
  const tn = await getTranslations("guestSheet.fields");
  const ta = await getTranslations("common.a11y");
  const tt = await getTranslations("common.time");

  const base = `/e/${data.event.id}/guests`;
  const listParam = data.list.own ? "" : `list=${data.list.memberId}`;
  const withList = (path: string) => (listParam ? `${path}?${listParam}` : path);
  const shown = data.members.find((m) => m.id === data.list.memberId);
  const title = data.list.own ? t("title") : (shown?.listName ?? t("title"));
  const totals = listTotals(data.guests.map(asLike));
  const empty = data.guests.length === 0;
  const others = data.members.filter((m) => m.id !== data.list.memberId);
  const now = new Date();
  const sentAgo = (iso: string | null) => {
    if (!iso) return undefined;
    const d = daysAgo(new Date(iso), now, data.event.tz);
    return d === 0 ? tt("sentToday") : d === 1 ? tt("sentYesterday") : tt("sentDaysAgo", { days: d });
  };

  const groups = data.categories
    .map((c) => {
      const guests = data.guests.filter((g) => g.categoryId === c.id);
      return { category: c, guests: [...guests].sort((a, b) => compareGuests(asLike(a), asLike(b))) };
    })
    .filter((x) => x.guests.length > 0);

  const listHtml = guestListHtml(
    groups.map(({ category, guests }) => ({
      id: category.id,
      label: category.label,
      code: category.code,
      count: `${tu("families", { count: guests.length })} · ${tu("seats", { count: listTotals(guests.map(asLike)).seats })}`,
      cards: guests.map((g) => {
        const status = guestStatus(asLike(g));
        const seats = status === "yes" ? (g.confirmed ?? 0) : g.expected;
        const seatsText = status === "yes" ? tc("seats", { count: seats }) : tc("seatsApprox", { count: seats });
        const statusText = ts(status);
        return {
          id: g.id,
          name: g.name,
          status,
          hasPhone: Boolean(g.phone),
          flash: g.id === flashId,
          waBase: chatUrl(g.phone),
          text: {
            a11y: tc("a11y", {
              name: g.name,
              status: statusText,
              seats: seatsText,
              table: g.tableNo ? tc("table", { number: g.tableNo }) : tn("notSeated"),
            }),
            badge: status === "yes" && seats ? ts("yesWithSeats", { seats }) : statusText,
            seats: status !== "yes" && status !== "no" ? seatsText : undefined,
            table: g.tableNo ? tc("table", { number: g.tableNo }) : undefined,
            phoneIcon: tc("phoneIcon"),
            send: tc("sendWhatsApp"),
            remind: tc("remind"),
            opensWhatsApp: ta("opensWhatsApp"),
            sentAgo: status === "noAnswer" ? sentAgo(g.remindedAt ?? g.sentAt) : undefined,
          },
        };
      }),
    })),
  );

  return (
    <div className="page guests-page" data-guests-root>
      <div className="col-main">
        <div className="page-head desk-only o1">
          <div className="ttl">
            <h1 className="t-h1">{title}</h1>
            <p>
              {t("subtitleWithTotal", {
                list: shown?.listName ?? "",
                total: t("total", { families: totals.families, seats: totals.seats }),
              })}
            </p>
          </div>
          <ButtonLink href={withList(`${base}/add`)} icon="plus" width="auto">
            {t("addButton")}
          </ButtonLink>
        </div>

        {empty ? (
          <GuestsIsland data={data} flashId={flashId} />
        ) : (
          <div className="o5">
            <GuestsIsland data={data} flashId={flashId} />
          </div>
        )}

        <div className="o6 guest-groups">
          <div data-slot="list-status" />
          {empty ? (
            <EmptyState title={t("empty.title")} body={t("empty.body")} />
          ) : (
            // one HTML string: no hydration, no RSC elements for the cards (RA Л1)
            <div className="guest-list" dangerouslySetInnerHTML={{ __html: listHtml }} />
          )}
        </div>
      </div>

      <div className="col-aside">
        <div className="o1">
          <EventHero
            compact="phone"
            title={data.event.title}
            kindLabel={kindLabel}
            dateLine={data.event.dateLine}
            venue={data.event.venue ?? undefined}
          />
        </div>
        {!empty && (
          <div className="o3">
            <div className="counters compact-phone" role="group" aria-label={t("counters.label")}>
              <StaticCounter kind="yes" filter="yes" text={t("counters.yes", { count: totals.yesSeats })} />
              <StaticCounter kind="inv" filter="noAnswer" text={t("counters.noAnswer", { count: totals.noAnswer })} />
              <StaticCounter kind="no" filter="no" text={t("counters.no", { count: totals.no })} />
            </div>
            <p className="totals-line">{t("total", { families: totals.families, seats: totals.seats })}</p>
          </div>
        )}
        {totals.noAnswer > 0 && (
          <div className="o4">
            <Banner
              kind="remind"
              className="compact-phone"
              title={t("remindBanner.title", { count: totals.noAnswer })}
              text={t("remindBanner.action")}
              href={withList(`${base}/no-answer`)}
            />
          </div>
        )}
        {others.length > 0 && (
          <div className="o7 other-lists">
            <LinkRows title={t("otherLists.title")}>
              {others.map((m) => (
                <LinkRow
                  key={m.id}
                  href={m.isMe ? base : `${base}?list=${m.id}`}
                  icon="users"
                  title={m.isMe ? `${t("title")} · ${m.listName}` : m.listName}
                  subtitle={`${tu("families", { count: m.families })} · ${tc("seatsApprox", { count: m.seats })}`}
                />
              ))}
            </LinkRows>
          </div>
        )}
      </div>

      <div className="sticky-cta">
        <ButtonLink href={withList(`${base}/add`)} icon="plus">
          {t("addButton")}
        </ButtonLink>
      </div>
    </div>
  );
}
