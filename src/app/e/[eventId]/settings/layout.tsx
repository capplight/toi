import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/client-messages";

/** Client messages of settings: music upload, list-makers (members, roles, default category) (RA review П1). */
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RouteMessages
      extra={[
        "wizard.music",
        "members",
        "roles",
        "guestForm",
        "category",
        "settings.showTableNo",
        "settings.saved",
        "members.door",
        "wa.doorLink",
      ]}
    >
      {children}
    </RouteMessages>
  );
}
