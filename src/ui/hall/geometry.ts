/**
 * Cell geometry of the hall (design_spec 3.12–3.13): shared by the interactive `HallMap` (client) and the printed map
 * (server, Ф10). No React, no hooks.
 */
export type Geometry = {
  cw: number;
  ch: number;
  cx: number;
  cy: number;
  disc: number;
  ring: (n: number) => number;
  chair: (n: number) => number;
  freeStroke: number;
  labelY: number;
  catY?: number;
  badge: number;
  badgeOffset: number;
  noSize: number;
};

/** Cell geometry: 4 columns (82×86) or 2 columns (164×140, ×1.7, two label lines). */
export function geometry(columns: 2 | 4): Geometry {
  return columns === 4
    ? {
        cw: 82,
        ch: 86,
        cx: 41,
        cy: 32,
        disc: 18,
        ring: (n) => (n >= 15 ? 27 : 26),
        chair: (n) => (n >= 15 ? 4 : 4.5),
        freeStroke: 1.5,
        labelY: 76,
        badge: 9,
        badgeOffset: 24,
        noSize: 14,
      }
    : {
        cw: 164,
        ch: 140,
        cx: 82,
        cy: 52,
        disc: 30,
        ring: (n) => (n >= 15 ? 46 : 44),
        chair: (n) => (n >= 15 ? 7 : 7.5),
        freeStroke: 2,
        labelY: 112,
        catY: 130,
        badge: 12,
        badgeOffset: 40,
        noSize: 20,
      };
}

export function chairs(cx: number, cy: number, R: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return { x: +(cx + R * Math.cos(a)).toFixed(2), y: +(cy + R * Math.sin(a)).toFixed(2) };
  });
}

export const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
