"use client";

import { useEffect, useState } from "react";

type Draft = {
  kind: "uilenu_toi" | "kyz_uzatu" | "sundet" | "besik" | "merey" | "other";
  title: string;
  hostsLine: string | null;
  startsOn: string;
  startsAt: string | null;
  venueName: string | null;
  venueAddress: string | null;
  textKk: string | null;
  textRu: string | null;
  templateId: "ak-shanyrak" | "kok-tun" | "kyzgaldak";
  locale: "kk" | "ru";
};

/**
 * Real invitation preview (Ф5 §3.4): the server renders the same template by draft data; shown in
 * `<iframe srcdoc sandbox>` (no scripts, no forms, no navigation). Updated 400 ms after the last change.
 */
export function InvitePreview({
  draft,
  load,
  title,
}: {
  draft: Draft;
  load: (d: Draft) => Promise<{ ok: true; html: string } | { ok: false; error: string }>;
  title: string;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const key = JSON.stringify(draft);
  useEffect(() => {
    let alive = true;
    const id = window.setTimeout(() => {
      load(JSON.parse(key) as Draft)
        .then((r) => alive && r.ok && setHtml(r.html))
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [key, load]);
  return html ? <iframe title={title} srcDoc={html} sandbox="" loading="lazy" data-testid="invite-preview" /> : null;
}
