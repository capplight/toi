import { nationalPart } from "@/domain/guests/phone";
import { db } from "@/server/db";
import { familyForEdit } from "@/server/guests/queries";
import { guestsPageData, memberOr404 } from "../data";
import { GuestForm } from "./GuestForm";

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : null);

/**
 * S2 «Жаңа қонақ» / «Қонақты өзгерту» (`?edit=`), DESIGN_v2 8.2, design_spec 4.2–4.6.
 * `?name=` prefills the name (from «Осы атпен қонақ қосу» on an empty search), `?list=` is where to return.
 */
export default async function AddGuestPage({ params, searchParams }: PageProps<"/e/[eventId]/guests/add">) {
  const { eventId } = await params;
  const q = await searchParams;
  const list = one(q.list);
  const data = await guestsPageData(eventId, list);
  const editId = one(q.edit);
  const edit = editId ? await familyForEdit(db(), await memberOr404(eventId), editId) : null;
  const initial = edit
    ? {
        id: edit.id,
        version: edit.version,
        name: edit.name,
        phone: nationalPart(edit.phone),
        categoryId: edit.categoryId,
        seats: edit.rsvp === "yes" ? (edit.confirmedCount ?? edit.expectedCount) : edit.expectedCount,
      }
    : null;
  return (
    <GuestForm
      key={editId ?? "new"}
      data={data}
      initial={initial}
      prefillName={one(q.name) ?? ""}
      backHref={`/e/${eventId}/guests${list ? `?list=${encodeURIComponent(list)}` : ""}`}
    />
  );
}
