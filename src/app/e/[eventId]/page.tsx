import { redirect } from "next/navigation";

/** The event opens on «Менің тізімім» (plan 11.1: guests/). */
export default async function EventIndex({ params }: PageProps<"/e/[eventId]">) {
  const { eventId } = await params;
  redirect(`/e/${eventId}/guests`);
}
