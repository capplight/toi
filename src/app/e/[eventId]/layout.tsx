import { and, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getFormatter, getMessages, getTranslations } from "next-intl/server";
import { pickMessages, SHELL_MESSAGES } from "@/i18n/client-messages";
import { notFound, redirect } from "next/navigation";
import { logoutAction } from "@/server/actions/auth";
import { setLocale } from "@/server/actions/locale";
import { ForbiddenError, requireMember, UnauthorizedError } from "@/server/authz";
import { db } from "@/server/db";
import { listKind } from "@/server/guests/queries";
import { eventMembers, events } from "@/server/schema";
import { EventShell } from "./EventShell";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

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
  // List names of all members (top-bar title of «Басқа тізімдер», S1).
  const memberRows = await db()
    .select({ id: eventMembers.id, label: eventMembers.label, memberKind: eventMembers.memberKind })
    .from(eventMembers)
    .where(and(eq(eventMembers.eventId, eventId), isNull(eventMembers.removedAt)));
  const lists = Object.fromEntries(
    memberRows.map((r) => {
      const kind = listKind(r);
      return [r.id, kind === "custom" ? t("roles.listOf.custom", { label: r.label }) : t(`roles.listOf.${kind}`)];
    }),
  );
  // RA review П1: only the frame's messages here; each route layout adds its own (src/i18n/client-messages.tsx).
  const messages = pickMessages((await getMessages()) as never, SHELL_MESSAGES);
  return (
    <NextIntlClientProvider messages={messages}>
      <EventShell
        event={{ id: eventId, title: ev.title, dateLine }}
        user={{ name: m.label, roleLabel, permissionLabel, initial: (m.label[0] ?? "?").toUpperCase() }}
        isOwner={owner}
        canManageBudget={owner || m.canManageBudget}
        actions={{ setLocale, logout: logoutAction }}
        lists={lists}
        myMemberId={m.memberId}
      >
        {children}
      </EventShell>
    </NextIntlClientProvider>
  );
}
