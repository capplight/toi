"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Drawer } from "vaul";
import { cn } from "../lib/cn";
import { DESKTOP, useBackToClose, useMediaQuery } from "../lib/hooks";
import { Button } from "./Button";

type BaseProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** Visually hidden description for screen readers (Radix requirement). */
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

/**
 * Sheet (DESIGN_v2 4, 7): Vaul from the bottom on phones (≤ 90 % height), on ≥ 1024 a right panel 480 px
 * with scrim (`direction="right"`). Focus trap from Vaul/Radix; the system «Back» closes it.
 */
export function Sheet({ open, onOpenChange, title, description, children, footer }: BaseProps) {
  const desktop = useMediaQuery(DESKTOP);
  const t = useTranslations("common.actions");
  useBackToClose(open, () => onOpenChange(false));
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} direction={desktop ? "right" : "bottom"}>
      <Drawer.Portal>
        <Drawer.Overlay className="scrim" />
        <Drawer.Content className={cn("sheet", desktop && "right")} aria-describedby={undefined}>
          {!desktop && <div className="handle" aria-hidden="true" />}
          <div className="sheet-head">
            <Drawer.Title className="t-h2">{title}</Drawer.Title>
            <Drawer.Close asChild>
              <Button variant="icon" icon="x" aria-label={t("close")} />
            </Drawer.Close>
          </div>
          {description && <Drawer.Description className="sr-only">{description}</Drawer.Description>}
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/**
 * Dialog for short confirmations and success (DESIGN_v2 4): centred 500 px on ≥ 1024, a bottom sheet on phones.
 */
export function Dialog({ open, onOpenChange, title, description, children, footer }: BaseProps) {
  const desktop = useMediaQuery(DESKTOP);
  const t = useTranslations("common.actions");
  useBackToClose(open && desktop, () => onOpenChange(false));
  if (!desktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange} title={title} description={description} footer={footer}>
        {children}
      </Sheet>
    );
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="scrim" />
        <DialogPrimitive.Content className="dialog" aria-describedby={description ? undefined : undefined}>
          <div className="sheet-head">
            <DialogPrimitive.Title className="t-h2">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="icon" icon="x" aria-label={t("close")} />
            </DialogPrimitive.Close>
          </div>
          {description && <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>}
          <div className="sheet-body">{children}</div>
          {footer && <div className="sheet-foot">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Destructive confirmation (Radix AlertDialog, «Өшіру»): centred on every width — the action needs an explicit
 * choice; focus starts on «Бас тарту».
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  /** Defaults to «Бас тарту» (common.actions.cancel). */
  cancelLabel?: string;
  onConfirm: () => void;
}) {
  const t = useTranslations("common.actions");
  useBackToClose(open, () => onOpenChange(false));
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="scrim" />
        <AlertDialogPrimitive.Content className="dialog">
          <div className="sheet-head">
            <AlertDialogPrimitive.Title className="t-h2">{title}</AlertDialogPrimitive.Title>
          </div>
          <div className="sheet-body">
            <AlertDialogPrimitive.Description className="t-body" style={{ whiteSpace: "pre-line" }}>
              {description}
            </AlertDialogPrimitive.Description>
          </div>
          <div className="sheet-foot">
            <AlertDialogPrimitive.Action asChild>
              <Button variant="danger-fill" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialogPrimitive.Action>
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="secondary">{cancelLabel ?? t("cancel")}</Button>
            </AlertDialogPrimitive.Cancel>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
