import { layoutTables } from "@/domain/seating/layout";
import type { HallConfig } from "@/domain/seating/types";
import { escapeHtml } from "./html";

/**
 * Ф8 (DESIGN 8.17 п. 6, mockup 07 `#table`, G18–G19): the guest's hall mini-map as an SVG string on the server.
 * ТӨР at the top, the couple's / honour table (`.yt`), a circle per table from `layoutTables` (same numbering and
 * columns as «Зал»), the guest's table filled with a pulsing ring, «Сіз осында» under it, КІРЕБЕРІС at the bottom.
 * No neighbours' names — only numbers of the own table. Budget: ≤ 4 KB for 60 tables.
 */
const W = 220;
const ROW = 42;
const TOP = 66;
const X4 = [35, 85, 135, 185];
const X2 = [70, 150];

export function miniMapSvg(
  hall: HallConfig,
  myTable: number,
  labels: { tor: string; entrance: string; youAreHere: string; a11y: string },
): string {
  const { tables, levels } = layoutTables(hall);
  const xs = hall.columns === 4 ? X4 : X2;
  // room under the last row for «Сіз осында» (+27) before КІРЕБЕРІС
  const h = TOP + (levels - 1) * ROW + 62;
  let circles = "";
  let me = "";
  for (const t of tables) {
    const x = xs[t.column]!;
    const y = TOP + t.level * ROW;
    if (t.no === myTable) {
      me =
        `<circle class="me-ring" cx="${x}" cy="${y}" r="13"/><circle class="me" cx="${x}" cy="${y}" r="13"/>` +
        `<text x="${x}" y="${y + 4}" class="mn">${t.no}</text>` +
        `<text x="${x}" y="${y + 27}" class="yh">${escapeHtml(labels.youAreHere)}</text>`;
    } else circles += `<circle class="t" cx="${x}" cy="${y}" r="11"/>`;
  }
  return (
    `<svg class="minimap" viewBox="0 0 ${W} ${h}" role="img" aria-label="${escapeHtml(labels.a11y)}">` +
    `<text x="110" y="12">${escapeHtml(labels.tor)}</text>` +
    `<rect class="yt" x="75" y="22" width="70" height="14" rx="7"/>` +
    circles +
    me +
    `<text x="110" y="${h - 5}">${escapeHtml(labels.entrance)}</text></svg>`
  );
}
