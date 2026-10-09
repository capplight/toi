import { getTranslations } from "next-intl/server";

/** «Менің тізімім» — placeholder until Ф4 (Ф1: frame only). */
export default async function GuestsPage() {
  const t = await getTranslations("meta.pages");
  return <h1 className="t-h1 page desk-only">{t("guests")}</h1>;
}
