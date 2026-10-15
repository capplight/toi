import type { PrintPlan } from "@/domain/print";
import { chairs, geometry } from "./geometry";

/**
 * Printed hall map (Ф10 brief §2.2, after the founder's sample): the same cells as `HallMap` (2 / 4 columns, the
 * couple's table at the ТӨР), chairs filled with the category tint of the family sitting there, free chairs as
 * dashed rings, a dashed outer ring for a mixed table («Аралас үстел» in the legend), «taken / capacity» under each
 * table. Server component (no hooks): labels come as props.
 */
export function PrintHallMap({
  plan,
  codes,
  labels,
}: {
  plan: PrintPlan;
  /** categoryId → token code (`kuda`, `oz`, …). */
  codes: Record<string, string>;
  labels: {
    tor: string;
    entrance: string;
    couple: string;
    total: (taken: number, capacity: number) => string;
    a11y: string;
  };
}) {
  const g = geometry(plan.columns);
  const W = 328;
  const top = 24 + 64 + 16;
  const H = top + plan.levels * g.ch + 40;
  const by = top + plan.levels * g.ch + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="print-map" role="img" aria-label={labels.a11y}>
      <text x="164" y="13" className="pm-tor">
        {labels.tor}
      </text>
      <rect x="98" y="47" width="132" height="34" rx="17" className="pm-couple" />
      <text x="164" y="64.5" className="pm-couple-t">
        {labels.couple}
      </text>
      {plan.tables.map((t) => {
        const ox = t.column * g.cw;
        const oy = top + t.level * g.ch;
        const cx = ox + g.cx;
        const cy = oy + g.cy;
        const R = g.ring(t.capacity);
        const c = g.chair(t.capacity);
        const over = t.missing > 0;
        // chair i belongs to the family that fills it, in list order (as the sample)
        const seatCats: string[] = [];
        for (const f of t.families) for (let k = 0; k < f.seats; k++) seatCats.push(codes[f.categoryId] ?? "baska");
        const main = t.mainCategoryId ? (codes[t.mainCategoryId] ?? "baska") : null;
        const second = t.mixed
          ? (codes[t.families.find((f) => f.categoryId !== t.mainCategoryId)?.categoryId ?? ""] ?? "baska")
          : null;
        return (
          <g key={t.no}>
            {t.mixed && <circle cx={cx} cy={cy} r={R + c + 3.5} className="pm-mixed" />}
            {over && <circle cx={cx} cy={cy} r={R + c + 3.5} className="pm-over" />}
            {chairs(cx, cy, R, t.capacity).map((p, j) => {
              const code = seatCats[j];
              return (
                <circle
                  key={j}
                  cx={p.x}
                  cy={p.y}
                  r={c}
                  className={code ? "pm-seat" : "pm-seat free"}
                  style={code ? { fill: `var(--cat-${code})` } : undefined}
                />
              );
            })}
            {second ? (
              <>
                <path
                  d={`M ${cx - g.disc} ${cy} A ${g.disc} ${g.disc} 0 0 1 ${cx + g.disc} ${cy} Z`}
                  style={{ fill: `var(--cat-${main})` }}
                />
                <path
                  d={`M ${cx - g.disc} ${cy} A ${g.disc} ${g.disc} 0 0 0 ${cx + g.disc} ${cy} Z`}
                  style={{ fill: `var(--cat-${second})` }}
                />
                <circle cx={cx} cy={cy} r={g.disc} className="pm-disc-line" />
              </>
            ) : (
              <circle
                cx={cx}
                cy={cy}
                r={g.disc}
                className={main ? "pm-disc" : "pm-disc empty"}
                style={main ? { fill: `var(--cat-${main})` } : undefined}
              />
            )}
            <text x={cx} y={cy + 0.5} className="pm-no" style={{ fontSize: g.noSize }}>
              {t.no}
            </text>
            <text x={cx} y={oy + g.labelY} className={over ? "pm-occ over" : "pm-occ"}>
              {labels.total(t.used, t.capacity)}
            </text>
          </g>
        );
      })}
      <text x="164" y={by + 22} className="pm-ent">
        {labels.entrance}
      </text>
    </svg>
  );
}
