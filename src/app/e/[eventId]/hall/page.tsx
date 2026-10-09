import { getTranslations } from "next-intl/server";

/** «Зал» — placeholder until Ф7b (Ф1: frame only; the HallMap component is on /dev/ui). */
export default async function HallPage() {
  const t = await getTranslations("meta.pages");
  return <h1 className="t-h1 page desk-only">{t("hall")}</h1>;
}
