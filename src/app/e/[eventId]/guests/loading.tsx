import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/ui/components/Display";

/** S1-L (design_spec 4.1): grey blocks instead of counters and cards while the list loads. */
export default async function GuestsLoading() {
  const t = await getTranslations("common");
  return (
    <div className="page guests-page" aria-busy="true">
      <p className="sr-only" role="status">
        {t("loading")}
      </p>
      <div className="col-main">
        <div className="o5">
          <Skeleton height={56} />
        </div>
        <div className="o6 guest-groups skel-list">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} height={76} />
          ))}
        </div>
      </div>
      <div className="col-aside">
        <div className="o1">
          <Skeleton height={92} />
        </div>
        <div className="o3">
          <Skeleton height={72} />
        </div>
      </div>
    </div>
  );
}
