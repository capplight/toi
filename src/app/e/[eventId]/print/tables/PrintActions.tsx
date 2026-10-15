"use client";

import { Button } from "@/ui/components/Button";
import { Icon } from "@/ui/components/Icon";

/** «Басып шығару / PDF сақтау» → `window.print()`; «Excel-ге жүктеу» — a plain download link. Hidden in print. */
export function PrintActions({
  printLabel,
  exportLabel,
  exportHref,
}: {
  printLabel: string;
  exportLabel: string;
  exportHref: string;
}) {
  return (
    <div className="pr-actions">
      <Button variant="primary" width="auto" icon="printer" onClick={() => window.print()}>
        {printLabel}
      </Button>
      <a className="btn secondary auto" href={exportHref} download>
        <Icon name="list" />
        {exportLabel}
      </a>
    </div>
  );
}
