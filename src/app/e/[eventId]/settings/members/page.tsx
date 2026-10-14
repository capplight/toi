import { asc, eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, requireOwner, UnauthorizedError } from "@/server/authz";
import { db } from "@/server/db";
import { membersView } from "@/server/events/service";
import { categories, events } from "@/server/schema";
import { isLocale } from "@/i18n/config";
import { translator } from "@/i18n/messages";
import { env } from "@/server/env";
import { waUrl } from "@/domain/guests/wa";
import { doorUrl, waDoorText } from "@/domain/guests/wa-table";
import { MembersScreen } from "./MembersScreen";

/** «Тізімді кім толтырады» (Ф3, mockup 11): owner only. */
export default async function MembersPage({ params }: PageProps<"/e/[eventId]/settings/members">) {
  const { eventId } = await params;
  let m;
  try {
    m = await requireOwner(eventId);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const locale = await getLocale();
  const [members, cats, [ev]] = await Promise.all([
    membersView(db(), m.user, eventId),
    db().select().from(categories).where(eq(categories.eventId, eventId)).orderBy(asc(categories.seatingRank)),
    db().select().from(events).where(eq(events.id, eventId)),
  ]);
  if (!ev) notFound();
  // Ф8: «Кіреберіс сілтемесі» — the helper's link in a wa.me text (wa.doorLink), no feature flag any more.
  const loc = isLocale(locale) ? locale : "kk";
  const tr = translator(loc);
  const doorText = waDoorText(
    (k, v) => tr(`wa.${k}`, v),
    loc,
    {
      kind: ev.kind,
      title: ev.title,
      hostsLine: ev.hostsLine,
      startsOn: ev.startsOn,
      startsAt: ev.startsAt,
      venueName: ev.venueName,
      tz: ev.tz,
    },
    ev.doorToken,
    env().APP_URL,
  );
  return (
    <MembersScreen
      eventId={eventId}
      members={members}
      categories={cats.map((c) => ({
        id: c.id,
        code: c.code ?? undefined,
        label: locale === "ru" ? (c.labelRu ?? c.labelKk) : c.labelKk,
      }))}
      door={{ waHref: waUrl(doorText, null), url: doorUrl(env().APP_URL, ev.doorToken) }}
    />
  );
}
