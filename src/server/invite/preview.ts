import { rsvpClosesAt } from "@/domain/invitations/dates";
import type { Locale } from "@/i18n/config";
import { messagesByLocale } from "@/i18n/messages";
import { env } from "../env";
import type { GuestPage } from "./guest";
import { renderInvite } from "./render";

/**
 * The wizard/settings preview (Ф5 §3.4): the guest page of the chosen template built from draft data, without
 * scripts, form actions, pings or music — shown in `<iframe srcdoc sandbox>` inside the phone frame.
 */
export type PreviewDraft = {
  kind: string;
  title: string;
  hostsLine?: string | null;
  startsOn: string;
  startsAt?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  textKk?: string | null;
  textRu?: string | null;
  templateId: string;
  locale: Locale;
};

export function renderPreview(d: PreviewDraft): string {
  const startsOn = /^\d{4}-\d{2}-\d{2}$/.test(d.startsOn) ? d.startsOn : new Date().toISOString().slice(0, 10);
  const page: GuestPage = {
    token: "preview",
    family: {
      id: "preview",
      // A sample family name for the preview only (the guest sees their own).
      name: messagesByLocale[d.locale].guestForm.name.placeholder.replace(/^[^:]*:\s*/, ""),
      rsvp: "pending",
      expected: 2,
      confirmed: null,
      answeredByGuest: false,
      openedBefore: true,
    },
    event: {
      id: "preview",
      kind: d.kind,
      title: d.title.trim() || "—",
      hostsLine: d.hostsLine ?? null,
      startsOn,
      startsAt: d.startsAt ?? null,
      tz: "Asia/Almaty",
      venueName: d.venueName ?? null,
      venueAddress: d.venueAddress ?? null,
      mapUrl: null,
      textKk: d.textKk ?? null,
      textRu: d.textRu ?? null,
      templateId: d.templateId,
      defaultLocale: d.locale,
      closesAt: rsvpClosesAt(startsOn, null),
    },
    musicKey: null,
    table: null,
  };
  return renderInvite(page, {
    locale: d.locale,
    nonce: "",
    now: new Date(),
    open: true,
    view: "form",
    appUrl: env().APP_URL,
    preview: true,
  });
}
