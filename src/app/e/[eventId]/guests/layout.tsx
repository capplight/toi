import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/client-messages";

/** Client messages of S1–S5: list, guest sheet, guest form, send flow, wa.me texts, categories, «Жауап бермегендер» (RA review П1). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RouteMessages extra={["guests", "guestSheet", "guestForm", "send", "wa", "category", "noAnswer", "roles"]}>
      {children}
    </RouteMessages>
  );
}
