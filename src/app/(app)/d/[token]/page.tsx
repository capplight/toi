import { eq } from "drizzle-orm";
import type { Metadata, Viewport } from "next";
import { getTranslations } from "next-intl/server";
import { RouteMessagesOnly } from "@/i18n/client-messages";
import { doorByToken, NotFoundError } from "@/server/auth/access";
import { db } from "@/server/db";
import { events } from "@/server/schema";
import "@/ui/door.css";
import { DoorApp } from "./DoorApp";

/**
 * Ф8 door helper (DESIGN 8.21): public by link, no session, no tabs or menu. The page always answers 200 so the
 * service worker can keep it; an unknown or rotated link shows `door.status.linkRevoked` (the API answers 404).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };
export const viewport: Viewport = { themeColor: "#0F2338" };

export default async function DoorPage({ params }: PageProps<"/d/[token]">) {
  const { token } = await params;
  let title = "";
  try {
    const { eventId } = await doorByToken(db(), token);
    const [ev] = await db().select({ title: events.title }).from(events).where(eq(events.id, eventId));
    title = ev?.title ?? "";
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  const t = await getTranslations("door.header");
  return (
    <RouteMessagesOnly paths={["door", "common.actions", "invite.table.unit"]}>
      <DoorApp token={token} title={title || t("subtitle")} />
    </RouteMessagesOnly>
  );
}
