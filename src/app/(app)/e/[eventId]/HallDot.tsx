import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { hallAttention } from "@/server/seating/view";

/**
 * Red dot at «Зал» (Ф1 `hallAttention`), streamed (Ф7b review П1): the layout renders it inside
 * `<Suspense fallback={null}>`, so no event screen waits for it. Access is checked by the layout before.
 */
export async function HallDot({ eventId }: { eventId: string }) {
  if (!(await hallAttention(db(), eventId))) return null;
  const t = await getTranslations("nav.a11y");
  return (
    <>
      <i className="dot" aria-hidden="true" />
      <span className="sr-only">{t("attention")}</span>
    </>
  );
}
