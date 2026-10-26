import { guestsPageData } from "../data";
import { NoAnswerScreen } from "./NoAnswerScreen";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

/** S5 «Жауап бермегендер» for the shown list (`?list=` — another member's list). */
export default async function NoAnswerPage({ params, searchParams }: PageProps<"/e/[eventId]/guests/no-answer">) {
  const { eventId } = await params;
  const list = one((await searchParams).list);
  const data = await guestsPageData(eventId, list);
  return (
    <NoAnswerScreen data={data} backHref={`/e/${eventId}/guests${list ? `?list=${encodeURIComponent(list)}` : ""}`} />
  );
}
