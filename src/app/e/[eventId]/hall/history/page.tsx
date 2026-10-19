import { getLocale } from "next-intl/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { events } from "@/server/schema";
import { historyView } from "@/server/seating/view";
import { VersionPoll } from "@/ui/components/VersionPoll";
import { memberOr404 } from "../../guests/data";
import { HistoryScreen } from "./HistoryScreen";

/** H7 «Өзгерістер тарихы» (design_spec 4.17, DESIGN 8.13). */
export default async function HallHistoryPage({ params }: PageProps<"/e/[eventId]/hall/history">) {
  const { eventId } = await params;
  const m = await memberOr404(eventId);
  const h = await historyView(db(), m.user, eventId);
  const [ev] = await db().select({ tz: events.tz }).from(events).where(eq(events.id, eventId));
  const locale = await getLocale();
  const categories = Object.fromEntries(
    h.categories.map((c) => [c.id, locale === "ru" ? (c.labelRu ?? c.labelKk) : c.labelKk]),
  );
  return (
    <>
      <HistoryScreen
        eventId={eventId}
        tz={ev?.tz ?? "Asia/Almaty"}
        entries={h.entries}
        categories={categories}
        canSeat={h.canSeat}
        me={h.meMemberId}
        seatingVersion={h.seatingVersion}
      />
      <VersionPoll eventId={eventId} version={h.seatingVersion} />
    </>
  );
}
