import { getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { ForbiddenError, UnauthorizedError } from "@/server/auth/access";
import { requireUser } from "@/server/authz";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { tableQueueView } from "@/server/tableQueue/service";
import "@/ui/queue.css";
import { TableQueue } from "./TableQueue";

/** Ф8 «Үстел нөмірлерін жіберу» (DESIGN 8.18): owner and members with the seating right; others — 404. */
export default async function TableQueuePage({ params }: PageProps<"/e/[eventId]/table-queue">) {
  const { eventId } = await params;
  const raw = await getLocale();
  try {
    const user = await requireUser();
    const data = await tableQueueView(db(), user, eventId, {
      locale: isLocale(raw) ? raw : "kk",
      appUrl: env().APP_URL,
    });
    return <TableQueue data={data} />;
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect("/login");
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}
