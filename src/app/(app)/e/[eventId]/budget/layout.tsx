import type { ReactNode } from "react";
import { RouteMessages } from "@/i18n/client-messages";

/** Client messages of «Шығындар» (Ф9). */
export default function Layout({ children }: { children: ReactNode }) {
  return <RouteMessages extra={["budget"]}>{children}</RouteMessages>;
}
