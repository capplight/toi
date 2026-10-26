"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createMusicUploadAction, removeMusicAction } from "@/server/actions/events";
import { MusicUpload, type MusicValue } from "@/ui/components/MusicUpload";

/** Music of an existing event (Ф5 §3.3): the same uploader as the wizard, bound to the event. */
export function SettingsMusic({ eventId, initial }: { eventId: string; initial: MusicValue }) {
  const [value, setValue] = useState<MusicValue>(initial);
  const router = useRouter();
  return (
    <MusicUpload
      value={value}
      onChange={(v) => {
        setValue(v);
        router.refresh();
      }}
      actions={{
        createUpload: async (x) => {
          const r = await createMusicUploadAction({ eventId, ...x });
          return r.ok ? r : { ok: false, error: "error" in r ? r.error : "failed" };
        },
        finalize: async (assetId) => {
          const res = await fetch("/api/media/finalize", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ assetId }),
          });
          return (await res.json()) as { ok: true; url: string } | { ok: false; error: string };
        },
        remove: async () => {
          await removeMusicAction({ eventId });
        },
      }}
    />
  );
}
