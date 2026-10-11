import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { ForbiddenError, requireOwner } from "@/server/authz";
import { db } from "@/server/db";
import { renderPreview } from "@/server/invite/preview";
import { events, mediaAssets } from "@/server/schema";
import { storage } from "@/server/storage";
import { LinkRow, LinkRows } from "@/ui/components/Display";
import { SettingsMusic } from "./SettingsMusic";

/** «Баптаулар» (owner only): members (Ф3), invitation — music and the real preview (Ф5). */
export default async function SettingsPage({ params }: PageProps<"/e/[eventId]/settings">) {
  const { eventId } = await params;
  try {
    await requireOwner(eventId);
  } catch (err) {
    if (err instanceof ForbiddenError) notFound();
    throw err;
  }
  const t = await getTranslations();
  const raw = await getLocale();
  const locale = isLocale(raw) ? raw : "kk";
  const [ev] = await db().select().from(events).where(eq(events.id, eventId));
  if (!ev) notFound();
  const [music] = ev.musicAssetId
    ? await db().select().from(mediaAssets).where(eq(mediaAssets.id, ev.musicAssetId))
    : [];
  const preview = renderPreview({
    kind: ev.kind,
    title: ev.title,
    hostsLine: ev.hostsLine,
    startsOn: ev.startsOn,
    startsAt: ev.startsAt,
    venueName: ev.venueName,
    venueAddress: ev.venueAddress,
    textKk: ev.invitationTextKk,
    textRu: ev.invitationTextRu,
    templateId: ev.templateId,
    locale,
  });
  return (
    <div className="page">
      <div className="col-main">
        <h1 className="t-h1 page desk-only">{t("meta.pages.settings")}</h1>
        <LinkRows>
          <LinkRow href={`/e/${eventId}/settings/members`} icon="users" title={t("settings.sections.members")} />
        </LinkRows>
        <section className="mt-6" aria-labelledby="set-inv">
          <h2 className="t-h2" id="set-inv">
            {t("settings.sections.invitation")}
          </h2>
          <h3 className="field-label mt-4">{t("wizard.music.title")}</h3>
          <SettingsMusic
            eventId={eventId}
            initial={
              music?.status === "ready"
                ? {
                    assetId: music.id,
                    url: await storage().getUrl(music.storageKey),
                    name: `${t("invite.header.musicLabel")}.mp3`,
                  }
                : null
            }
          />
          <p className="note">{t("wizard.music.rights")}</p>
        </section>
      </div>
      <div className="col-aside">
        <div className="phone-frame">
          <iframe title={t("wizard.template.preview")} srcDoc={preview} sandbox="" data-testid="invite-preview" />
        </div>
      </div>
    </div>
  );
}
