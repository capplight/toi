import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/ui/components/Display";
import { VersionPoll } from "@/ui/components/VersionPoll";
import { hallPageData } from "./data";
import { HallScreen } from "./HallScreen";

/** H2 «Зал» (Ф7b). No hall yet: H1 for those with the seating right (H2-N), a note for «Тек тізім». */
export default async function HallPage({ params }: PageProps<"/e/[eventId]/hall">) {
  const { eventId } = await params;
  const v = await hallPageData(eventId);
  if (!v.hall) {
    if (v.canSeat) redirect(`/e/${eventId}/hall/setup`);
    const t = await getTranslations("hall");
    return (
      <>
        <h1 className="t-h1 page desk-only">{t("map.title")}</h1>
        <EmptyState title={t("setup.notConfigured")} />
        <VersionPoll eventId={eventId} version={v.seatingVersion} />
      </>
    );
  }
  return (
    <>
      <HallScreen v={v} tz={v.event.tz} />
      <VersionPoll eventId={eventId} version={v.seatingVersion} />
    </>
  );
}
