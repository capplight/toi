import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, requireMember, UnauthorizedError } from "@/server/authz";
import { db } from "@/server/db";
import { events } from "@/server/schema";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Temporary event page after login (neutral styles). «Менің тізімім» is Ф4; here only the access
 * check (requireMember) and the event title are shown.
 */
export default async function EventPage({ params }: PageProps<"/e/[eventId]">) {
  const { eventId } = await params;
  let m;
  try {
    m = await requireMember(eventId);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const t = await getTranslations();
  const [ev] = await db().select({ title: events.title }).from(events).where(eq(events.id, eventId));
  return (
    <main className="mx-auto max-w-md space-y-4 p-4" data-testid="event-page">
      <p className="text-sm text-neutral-600">{t("meta.pages.guests")}</p>
      <h1 className="text-2xl font-semibold">{ev?.title}</h1>
      <p>{m.role === "owner" ? t("roles.owner") : m.label}</p>
      <Link className="underline" href="/e">
        {t("events.list.title")}
      </Link>
    </main>
  );
}
