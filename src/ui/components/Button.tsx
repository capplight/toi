import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn";
import { Icon, type IconName } from "./Icon";

/** DESIGN_v2 7 Button: heights 56/52/48, focus ring 3 px lapis, disabled 40 %, loading = spinner instead of icon. */
export const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "primary",
      wa: "wa",
      secondary: "secondary",
      "wa-outline": "wa-outline",
      danger: "danger",
      "danger-fill": "danger-fill",
      text: "text",
      icon: "icon",
    },
    size: { default: "", row: "row" },
    width: { full: "", auto: "auto" },
  },
  defaultVariants: { variant: "primary", size: "default", width: "full" },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    icon?: IconName;
    loading?: boolean;
    /** Required for variant="icon" (no visible label). */
    "aria-label"?: string;
    children?: ReactNode;
  };

export function Button({ variant, size, width, icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(buttonVariants({ variant, size, width }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}

/** Same look for links (navigation). */
export function ButtonLink({
  href,
  variant,
  size,
  width,
  icon,
  className,
  children,
}: VariantProps<typeof buttonVariants> & { href: string; icon?: IconName; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant, size, width }), className)}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </Link>
  );
}
