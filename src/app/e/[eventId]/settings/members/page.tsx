import { asc, eq } from "drizzle-orm";
import { getLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { ForbiddenError, requireOwner, UnauthorizedError } from "@/server/authz";
import { db } from "@/server/db";
import { membersView } from "@/server/events/service";
import { categories } from "@/server/schema";
import { MembersScreen } from "./MembersScreen";

/** Hidden until Ф8 (helper at the entrance): otherwise the owner would send a link to a page that does not exist yet. */
const DOOR_HELPER = process.env.NEXT_PUBLIC_FEATURE_DOOR === "1";

/** «Тізімді кім толтырады» (Ф3, mockup 11): owner only. */
export default async function MembersPage({ params }: PageProps<"/e/[eventId]/settings/members">) {
  const { eventId } = await params;
  let m;
  try {
    m = await requireOwner(eventId);
  } catch (err) {
    if (err instanceof UnauthorizedError) redirect("/login");
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const locale = await getLocale();
  const [members, cats] = await Promise.all([
    membersView(db(), m.user, eventId),
    db().select().from(categories).where(eq(categories.eventId, eventId)).orderBy(asc(categories.seatingRank)),
  ]);
  return (
    <MembersScreen
      eventId={eventId}
      members={members}
      categories={cats.map((c) => ({
        id: c.id,
        code: c.code ?? undefined,
        label: locale === "ru" ? (c.labelRu ?? c.labelKk) : c.labelKk,
      }))}
      doorHelper={DOOR_HELPER}
    />
  );
}
