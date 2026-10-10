import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";
import { sessionEventIds } from "@/server/auth/session";
import { currentUser } from "@/server/authz";
import { canCreateEvents } from "@/server/events/service";
import { db } from "@/server/db";
import { eventMembers, events } from "@/server/schema";
import { EmptyState, LinkRow, LinkRows } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import Link from "next/link";
import { Mark } from "@/ui/ornaments/generated";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * «Менің тойларым» (Ф3): «Жаңа той ашу» for those who may create events (scope 'all' + allowed_owners); an owner
 * without events goes straight to the wizard after the first login. Others see `events.list.createRestricted`.
 */
export default async function EventsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();
  const format = await getFormatter();
  // Scope 'events' (member link login): only the events of this session (plan 6.1 v1.5).
  const scoped = await sessionEventIds(db(), user);
  const rows = await db()
    .select({
      id: events.id,
      title: events.title,
      startsOn: events.startsOn,
      role: eventMembers.role,
      label: eventMembers.label,
    })
    .from(eventMembers)
    .innerJoin(events, eq(events.id, eventMembers.eventId))
    .where(
      and(
        eq(eventMembers.userId, user.userId),
        isNull(eventMembers.removedAt),
        isNull(events.deletedAt),
        scoped === null ? undefined : scoped.length ? inArray(events.id, scoped) : sql`false`,
      ),
    )
    .orderBy(asc(events.startsOn));
  const can = await canCreateEvents(db(), user);
  if (rows.length === 0 && can === "ok") redirect("/e/new");

  return (
    <main className="content" data-testid="events-page" style={{ paddingBottom: 48 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0 20px" }}>
        <span className="wordmark">
          <Mark />
          <b>{t("meta.appName")}</b>
        </span>
      </div>
      <h1 className="t-h1" style={{ marginBottom: 16 }}>
        {t("events.list.title")}
      </h1>
      {can === "ok" && (
        <Link href="/e/new" className="btn primary mb-4" data-testid="create-event">
          <Icon name="plus" />
          {t("events.list.create")}
        </Link>
      )}
      {rows.length === 0 ? (
        <EmptyState title={t("auth.noEvents.title")} body={t("auth.noEvents.body")} />
      ) : (
        <LinkRows>
          {rows.map((r) => (
            <LinkRow
              key={r.id}
              href={`/e/${r.id}`}
              icon="cal"
              title={r.title}
              subtitle={t("events.list.item", {
                eventTitle: r.title,
                date: format.dateTime(new Date(`${r.startsOn}T12:00:00Z`), { day: "numeric", month: "long" }),
                role: r.role === "owner" ? t("roles.owner") : r.label,
              })}
            />
          ))}
        </LinkRows>
      )}
      {can !== "ok" && <p className="t-body t-muted mt-4">{t("events.list.createRestricted")}</p>}
      <form action={logoutAction} style={{ marginTop: 24 }}>
        <button type="submit" className="btn secondary">
          {t("nav.logout")}
        </button>
      </form>
    </main>
  );
}
