import { redirect } from "next/navigation";
import { VersionPoll } from "@/ui/components/VersionPoll";
import { hallPageData } from "../data";
import { OrderScreen } from "./OrderScreen";

/** H5 «Отырғызу реті» (DESIGN 8.11, decision Р4). */
export default async function HallOrderPage({ params }: PageProps<"/e/[eventId]/hall/order">) {
  const { eventId } = await params;
  const v = await hallPageData(eventId);
  if (!v.hall) redirect(`/e/${eventId}/hall`);
  return (
    <>
      <OrderScreen v={v} />
      <VersionPoll eventId={eventId} version={v.seatingVersion} />
    </>
  );
}
