import { formatEventDate, guestLink, type WaEvent } from "./wa";

/**
 * Ф8: the table-number message (`wa.tableNumber`) and the door-helper link (`wa.doorLink`). Same rules as Ф4:
 * names as typed, the guest link opens the invitation at its table block (`#table`).
 */
export function waTableText(
  t: (key: "tableNumber", values: Record<string, string>) => string,
  locale: string,
  ev: WaEvent,
  family: { name: string; token: string; tableNo: number },
  appUrl: string,
): string {
  return t("tableNumber", {
    tableNo: String(family.tableNo),
    familyName: family.name,
    eventTitle: ev.title,
    date: ev.dateText ?? formatEventDate(ev, locale),
    time: ev.startsAt?.slice(0, 5) ?? "",
    venue: ev.venueName ?? "",
    link: `${guestLink(appUrl, family.token)}#table`,
  });
}

export function doorUrl(appUrl: string, doorToken: string): string {
  return `${appUrl.replace(/\/$/, "")}/d/${doorToken}`;
}

export function waDoorText(
  t: (key: "doorLink", values: Record<string, string>) => string,
  locale: string,
  ev: WaEvent,
  doorToken: string,
  appUrl: string,
): string {
  return t("doorLink", {
    eventTitle: ev.title,
    date: ev.dateText ?? formatEventDate(ev, locale),
    link: doorUrl(appUrl, doorToken),
  });
}
