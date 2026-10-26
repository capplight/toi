"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { setShowTableNumbersAction } from "@/server/actions/tableQueue";
import { showToast } from "@/ui/components/Toast";

/** Ф8 owner switch «Үстел нөмірін көрсету» (settings.showTableNo): guests see their table and the mini-map. */
export function SettingsTableNumbers({ eventId, initial }: { eventId: string; initial: boolean }) {
  const t = useTranslations("settings");
  const [on, setOn] = useState(initial);
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="sw-row"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => {
        const next = !on;
        setOn(next);
        start(async () => {
          const r = await setShowTableNumbersAction({ eventId, on: next });
          if (!r.ok) setOn(!next);
          else showToast({ message: t("saved") });
        });
      }}
    >
      <span className="tx">
        <b>{t("showTableNo.label")}</b>
        <span>{t("showTableNo.hint")}</span>
      </span>
      <span className="switch" aria-hidden="true" />
    </button>
  );
}
