import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/client-messages";

/** Client messages of «Үстел нөмірлерін жіберу» (Ф8): the queue and the wa.me table text. */
export default function Layout({ children }: { children: ReactNode }) {
  return <RouteMessages extra={["tableQueue", "wa.tableNumber"]}>{children}</RouteMessages>;
}
