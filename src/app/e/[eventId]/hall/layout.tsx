import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/client-messages";

/** Client messages of «Зал» (Ф7a/Ф7b): hall map and setup (RA review П1). */
export default function Layout({ children }: { children: ReactNode }) {
  return <RouteMessages extra={["hall"]}>{children}</RouteMessages>;
}
