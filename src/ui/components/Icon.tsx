import type { SVGProps } from "react";
import { cn } from "../lib/cn";

/** Ids of public/icons.svg (copied from design/v2/assets/icons; Lucide ISC + WhatsApp CC0). */
export type IconName =
  | "users"
  | "grid"
  | "plus"
  | "minus"
  | "user-plus"
  | "search"
  | "phone"
  | "yes"
  | "no"
  | "clock"
  | "send"
  | "bell"
  | "up"
  | "back"
  | "move"
  | "lock"
  | "history"
  | "undo"
  | "alert"
  | "list"
  | "sliders"
  | "x"
  | "check"
  | "eye"
  | "order"
  | "pin"
  | "cal"
  | "vol"
  | "mute"
  | "offline"
  | "wifi"
  | "wallet"
  | "chart"
  | "gear"
  | "door"
  | "refresh"
  | "music"
  | "printer"
  | "pencil"
  | "trash"
  | "sms"
  | "login"
  | "heart"
  | "wa";

const FILLED = new Set<IconName>(["wa"]);

/**
 * Icon from the sprite. Always decorative (`aria-hidden`): the visible label next to it carries the meaning
 * (DESIGN_v2 5: «всегда с подписью рядом»).
 */
export function Icon({
  name,
  size = "md",
  className,
  ...rest
}: { name: IconName; size?: "md" | "sm" | "xs" } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg
      className={cn("ico", size !== "md" && size, FILLED.has(name) && "fill", className)}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <use href={`/icons.svg#i-${name}`} />
    </svg>
  );
}
