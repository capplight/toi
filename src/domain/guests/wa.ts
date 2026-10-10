/**
 * WhatsApp texts (CONTENT_REVIEW 6.2–6.4, brief Ф4 2.2). Pure TS: the message function is passed in
 * (server: `translator(locale)` with the `wa.` prefix; client: `useTranslations("wa")`), so the texts
 * always come from content/messages `wa.invite` / `wa.reminder` with `{kind}` and `{hasHosts}`.
 * The family name goes exactly as typed (nominative, decision Д4/1 — no case endings);
 * the guest link is `APP_URL/i/{token}`; the whole text is passed through `encodeURIComponent`.
 * Without a phone: `https://wa.me/?text=…` (the person picks the contact in WhatsApp).
 */
export type WaEvent = {
  kind: string;
  title: string;
  hostsLine: string | null;
  startsOn: string;
  startsAt: string | null;
  venueName: string | null;
  tz: string;
};

export type WaKind = "invite" | "reminder";
export type WaMessages = (key: WaKind, values: Record<string, string>) => string;

export function formatEventDate(ev: Pick<WaEvent, "startsOn" | "tz">, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: ev.tz }).format(
    new Date(`${ev.startsOn}T12:00:00Z`),
  );
}

export function guestLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, "")}/i/${token}`;
}

export function waText(
  kind: WaKind,
  t: WaMessages,
  locale: string,
  ev: WaEvent,
  family: { name: string; token: string },
  appUrl: string,
): string {
  const common = {
    familyName: family.name,
    eventTitle: ev.title,
    date: formatEventDate(ev, locale),
    time: ev.startsAt?.slice(0, 5) ?? "",
    link: guestLink(appUrl, family.token),
  };
  if (kind === "reminder") return t("reminder", common);
  const hostsLine = ev.hostsLine?.trim() ?? "";
  return t("invite", {
    ...common,
    kind: ev.kind,
    venue: ev.venueName ?? "",
    hasHosts: hostsLine ? "yes" : "no",
    hostsLine,
  });
}

/** `wa.me` link: digits of the guest's phone (or none), the whole text encoded. */
export function waUrl(text: string, phone: string | null): string {
  const to = phone ? phone.replace(/\D/g, "") : "";
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
