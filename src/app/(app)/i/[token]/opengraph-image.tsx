import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { eventDateParts } from "@/domain/invitations/dates";
import { translator } from "@/i18n/messages";
import { db } from "@/server/db";
import { loadGuestPage } from "@/server/invite/guest";
import { templateKey } from "@/server/invite/render";

/**
 * OG image of the guest link (Ф5 §3.2, DESIGN 8.17): 1200×630, template background + SVG ornament,
 * «Құрметті {familyName}!» and «{title} · {date}». Fonts: the same subsets as WOFF (Satori does not read WOFF2).
 * Personal → never cached publicly beyond a day; unknown token → a neutral card (no existence oracle in the image).
 */
export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Той";

const STYLE = {
  "ak-shanyrak": { bg: "linear-gradient(160deg, #F4ECDD, #E9DAC0)", ink: "#2B2116", ink2: "#6A5A45", orn: "#B48A3E" },
  "kok-tun": { bg: "linear-gradient(160deg, #0F2338, #081626)", ink: "#F4EBDA", ink2: "#C9BFAE", orn: "#D8B26A" },
  kyzgaldak: { bg: "linear-gradient(160deg, #F8ECE6, #F0D9CE)", ink: "#3B1219", ink2: "#7A4A50", orn: "#B48A3E" },
} as const;

const font = (f: string) => readFile(join(process.cwd(), "src/server/invite/fonts", f));

export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await loadGuestPage(db(), token);
  const locale = page?.event.defaultLocale ?? "kk";
  const t = translator(locale);
  const s = STYLE[templateKey(page?.event.templateId ?? "ak-shanyrak")];
  const [serif, sans] = await Promise.all([font("cormorant-garamond-600-kk.woff"), font("onest-400-kk.woff")]);
  const parts = page ? eventDateParts(page.event.startsOn, page.event.startsAt, locale, page.event.tz) : null;
  return new ImageResponse(
    <div
      style={{ width: "100%", height: "100%", display: "flex", background: s.bg, color: s.ink, fontFamily: "Onest" }}
    >
      <div style={{ width: 420, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg
          width="300"
          height="300"
          viewBox="-50 -50 100 100"
          fill="none"
          stroke={s.orn}
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <circle r="30" />
          <circle r="25" />
          <path d="M-10 -28 Q-14 0 -10 28 M10 -28 Q14 0 10 28 M-28 -10 Q0 -14 28 -10 M-28 10 Q0 14 28 10" />
          <path d="M38 0 L47 0 M33 19 L41 23.5 M19 33 L23.5 41 M0 38 L0 47 M-19 33 L-23.5 41 M-33 19 L-41 23.5 M-38 0 L-47 0 M-33 -19 L-41 -23.5 M-19 -33 L-23.5 -41 M0 -38 L0 -47 M19 -33 L23.5 -41 M33 -19 L41 -23.5" />
        </svg>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 80 }}>
        <div style={{ fontFamily: "Cormorant", fontSize: 64, lineHeight: 1.1 }}>
          {page ? t("og.invite.imageTitle", { familyName: page.family.name }) : t("og.siteName")}
        </div>
        {page && parts && (
          <div style={{ marginTop: 28, fontSize: 34, color: s.ink2 }}>
            {t("og.invite.description", { eventTitle: page.event.title, date: `${parts.day} ${parts.month}` })}
          </div>
        )}
        <div style={{ marginTop: 40, width: 220, height: 2, background: s.orn }} />
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Cormorant", data: serif, weight: 600, style: "normal" },
        { name: "Onest", data: sans, weight: 400, style: "normal" },
      ],
      headers: { "cache-control": "public, max-age=86400", "x-robots-tag": "noindex" },
    },
  );
}
