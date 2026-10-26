import { redirect } from "next/navigation";
import { hallPageData } from "../data";
import { SetupScreen } from "./SetupScreen";

/** H1 «Залды баптау» (design_spec 4.10, DESIGN 8.6). Seating right only; `?tables=N` from «Үстел қосу». */
export default async function HallSetupPage({ params, searchParams }: PageProps<"/e/[eventId]/hall/setup">) {
  const { eventId } = await params;
  const q = await searchParams;
  const v = await hallPageData(eventId);
  if (!v.canSeat) redirect(`/e/${eventId}/hall`);
  const asked = Number(Array.isArray(q.tables) ? q.tables[0] : q.tables);
  const per = v.hall?.seatsPerTable ?? 12;
  const initial = {
    columns: v.hall?.columns ?? 4,
    tables:
      Number.isInteger(asked) && asked >= 1 && asked <= 60
        ? asked
        : (v.hall?.tables ?? Math.min(60, Math.max(1, Math.ceil(v.totals.toSeat / per)))),
    seatsPerTable: per,
  } as const;
  return (
    <SetupScreen
      eventId={eventId}
      event={v.event}
      state={v.state}
      initial={initial}
      hadHall={Boolean(v.hall)}
      seatingVersion={v.seatingVersion}
    />
  );
}
