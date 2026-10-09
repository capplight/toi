import { and, asc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";
import { currentUser } from "@/server/authz";
import { db } from "@/server/db";
import { eventMembers, events } from "@/server/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Temporary «Менің тойларым» (neutral styles; the real screen is Ф1/Ф3). */
export default async function EventsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const t = await getTranslations();
  const format = await getFormatter();
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
    .where(and(eq(eventMembers.userId, user.userId), isNull(eventMembers.removedAt), isNull(events.deletedAt)))
    .orderBy(asc(events.startsOn));

  return (
    <main className="mx-auto max-w-md space-y-4 p-4" data-testid="events-page">
      <h1 className="text-2xl font-semibold">{t("events.list.title")}</h1>
      {rows.length === 0 ? (
        <div className="space-y-2">
          <p className="font-semibold">{t("auth.noEvents.title")}</p>
          <p>{t("auth.noEvents.body")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link className="block min-h-12 rounded border border-neutral-400 p-3" href={`/e/${r.id}`}>
                {t("events.list.item", {
                  eventTitle: r.title,
                  date: format.dateTime(new Date(`${r.startsOn}T12:00:00Z`), { day: "numeric", month: "long" }),
                  role: r.role === "owner" ? t("roles.owner") : r.label,
                })}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={logoutAction}>
        <button type="submit" className="min-h-12 rounded border border-neutral-500 px-4">
          {t("auth.logout.confirmTitle")}
        </button>
      </form>
    </main>
  );
}
