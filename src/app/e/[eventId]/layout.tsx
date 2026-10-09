import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getMessages, getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";
import { setLocale } from "@/server/actions/locale";
import { ForbiddenError, requireMember, UnauthorizedError } from "@/server/authz";
import { db } from "@/server/db";
import { events } from "@/server/schema";
import { EventShell } from "./EventShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Namespaces the client components of working screens need (not all 757 strings). */
const CLIENT_NAMESPACES = [
  "common",
  "nav",
  "meta",
  "legal",
  "hall",
  "guests",
  "guestSheet",
  "summary",
  "budget",
  "errors",
  "roles",
];

/** Frame of every working screen of an event (Ф1): access check (Ф2) + the three navigation modes. */
export default async function EventLayout({ params, children }: LayoutProps<"/e/[eventId]">) {
  const { eventId } = await params;
  let m;
  try {
    m = await requireMember(eventId);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const [ev] = await db().select().from(events).where(eq(events.id, eventId));
  if (!ev) notFound();
  const t = await getTranslations();
  const format = await getFormatter();
  const date = format.dateTime(new Date(`${ev.startsOn}T12:00:00Z`), { day: "numeric", month: "long" });
  const dateLine = ev.startsAt ? `${date}, ${ev.startsAt.slice(0, 5)}` : date;
  const owner = m.role === "owner";
  const roleLabel = owner ? t("roles.owner") : m.label;
  const permissionLabel =
    owner || m.canEditSeating ? t("roles.permission.listAndSeating") : t("roles.permission.listOnly");
  const all = await getMessages();
  const messages = Object.fromEntries(CLIENT_NAMESPACES.map((k) => [k, all[k as keyof typeof all]]));
  return (
    <NextIntlClientProvider messages={messages}>
      <EventShell
        event={{ id: eventId, title: ev.title, dateLine }}
        user={{ name: m.label, roleLabel, permissionLabel, initial: (m.label[0] ?? "?").toUpperCase() }}
        isOwner={owner}
        canManageBudget={owner || m.canManageBudget}
        actions={{ setLocale, logout: logoutAction }}
      >
        {children}
      </EventShell>
    </NextIntlClientProvider>
  );
}
