import { getTranslations } from "next-intl/server";
import { guestsPageData } from "./data";
import { GuestsScreen } from "./GuestsScreen";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

/** S1 «Менің тізімім» (Ф4). `?list=` — another member's list; `?new=` — highlight the card just added (W7). */
export default async function GuestsPage({ params, searchParams }: PageProps<"/e/[eventId]/guests">) {
  const { eventId } = await params;
  const q = await searchParams;
  const data = await guestsPageData(eventId, one(q.list));
  const t = await getTranslations("events.kind");
  const kindLabel = t("select", { kind: data.wa.kind });
  return <GuestsScreen data={data} kindLabel={kindLabel} flashId={one(q.new)} />;
}
