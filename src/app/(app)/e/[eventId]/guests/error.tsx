"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/ui/components/Button";
import { Banner } from "@/ui/components/Display";

/** S1-Err: the list did not load (network / server). «Қайталау» re-renders the segment. */
export default function GuestsError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("guests.list");
  const ta = useTranslations("common.actions");
  return (
    <div className="page-narrow">
      <Banner kind="error" title={t("loadError")} live />
      <Button variant="secondary" className="mt-4" icon="refresh" onClick={reset}>
        {ta("retry")}
      </Button>
    </div>
  );
}
