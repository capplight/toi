"use client";

import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import type { HallStats, TableStat } from "@/domain/seating";
import { cn } from "../lib/cn";
import { KoshkarMuiz } from "../ornaments/generated";

/**
 * Table graphics and the hall map — design_spec 3.12–3.13, DESIGN_v2 3.3 and 9.
 * Data comes only from `@/domain/seating` (`tableStats`, contract Ф7a): this file draws, it does not seat.
 */

export type TableMark = {
  /** Tables marked as a possible duplicate: marker 1/2 + dup ring; `seats` = chairs of that family. */
  dup?: { marker: number; seats: number };
  /** «Ауыстыру»: candidate (dashed success ring, «N бос»), current (lapis ring, «қазір»), unfit (45 %). */
  move?: "candidate" | "current" | "unfit";
};

type Geometry = {
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

function chairs(cx: number, cy: number, R: number, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = ((-90 + (i * 360) / n) * Math.PI) / 180;
    return { x: +(cx + R * Math.cos(a)).toFixed(2), y: +(cy + R * Math.sin(a)).toFixed(2) };
  });
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** One table inside a cell (shared by HallMap and the standalone TableGraphic). */
function TableCell({
  t,
  g,
  ox,
  oy,
  catCode,
  catLabel,
  mark,
  label,
}: {
  t: Pick<TableStat, "no" | "used" | "capacity" | "missing">;
  g: Geometry;
  ox: number;
  oy: number;
  catCode: string | null;
  catLabel?: string;
  mark?: TableMark;
  label: string;
}) {
  const cx = ox + g.cx;
  const cy = oy + g.cy;
  const n = t.capacity;
  const R = g.ring(n);
  const c = g.chair(n);
  const over = t.missing > 0;
  const empty = t.used === 0;
  const dupSeats = mark?.dup?.seats ?? 0;
  return (
    <>
      <rect x={ox + 1} y={oy + 1} width={g.cw - 2} height={g.ch - 2} rx={10} className="hit" />
      {over && <circle cx={cx} cy={cy} r={R + c + 4.5} className="ring-over2" />}
      {mark?.dup && <circle cx={cx} cy={cy} r={R + c + 3} className="ring-dup" />}
      {mark?.move === "candidate" && <circle cx={cx} cy={cy} r={R + c + 3} className="ring-cand" />}
      {mark?.move === "current" && <circle cx={cx} cy={cy} r={R + c + 3} className="ring-cur" />}
      {chairs(cx, cy, R, n).map((p, j) => {
        let st = j < t.used ? "taken" : "free";
        if (over) st = "over";
        if (mark?.dup && j < dupSeats) st = "dupseat";
        return (
          <circle
            key={j}
            cx={p.x}
            cy={p.y}
            r={c}
            className={cn("seat", st)}
            strokeWidth={st === "free" ? g.freeStroke : undefined}
          />
        );
      })}
      <circle
        cx={cx}
        cy={cy}
        r={g.disc}
        className={cn("disc", empty && "empty")}
        style={{ fill: empty || !catCode ? "var(--paper)" : `var(--cat-${catCode})` }}
      />
      {over && <circle cx={cx} cy={cy} r={g.disc} className="disc-over" />}
      <text x={cx} y={cy + 0.5} className="lbl-no" style={{ fontSize: g.noSize }}>
        {t.no}
      </text>
      <text
        x={cx}
        y={oy + g.labelY}
        className={cn("lbl-occ", over && "over", mark?.move === "candidate" && "cand")}
        style={g.catY ? { fontSize: 16 } : undefined}
      >
        {label}
      </text>
      {g.catY && catLabel && (
        <text x={cx} y={oy + g.catY} className="lbl-cat">
          {truncate(catLabel, 16)}
        </text>
      )}
      {over && (
        <g className="badge-over">
          <circle cx={cx + g.badgeOffset} cy={cy - g.badgeOffset} r={g.badge} />
          <text x={cx + g.badgeOffset} y={cy - g.badgeOffset + 0.5} style={g.catY ? { fontSize: 16 } : undefined}>
            !
          </text>
        </g>
      )}
      {mark?.dup && (
        <g className="badge-dup">
          <circle cx={cx - g.badgeOffset - 1} cy={cy - g.badgeOffset - 1} r={g.badge + 1} />
          <text x={cx - g.badgeOffset - 1} y={cy - g.badgeOffset - 0.5}>
            {mark.dup.marker}
          </text>
        </g>
      )}
    </>
  );
}

export type HallMapProps = {
  stats: HallStats;
  columns: 2 | 4;
  /** categoryId → design code (`kuda`, `oz`, …) for the disc tint; custom categories → `baska`. */
  categoryCodes: Record<string, string>;
  /** categoryId → label (2-column mode shows the main category under the table). */
  categoryLabels?: Record<string, string>;
  eventKind: string;
  eventTitle: string;
  selected?: number | null;
  marks?: Record<number, TableMark>;
  /** Dim every table that is not marked (duplicates view, 30 %). */
  dimUnmarked?: boolean;
  onSelectTable?: (no: number) => void;
  onSelectCouple?: () => void;
};

/** The hall: one SVG (viewBox, width 100 %), ТӨР, the couple's table, tables, КІРЕБЕРІС. No zoom, no gestures. */
export function HallMap({
  stats,
  columns,
  categoryCodes,
  categoryLabels,
  eventKind,
  eventTitle,
  selected,
  marks = {},
  dimUnmarked = false,
  onSelectTable,
  onSelectCouple,
}: HallMapProps) {
  const t = useTranslations("hall.map");
  const tm = useTranslations("hall.move");
  const g = geometry(columns);
  const W = 328;
  const top = 24 + 64 + 16;
  const H = top + stats.levels * g.ch + 40;
  const colX = (column: number) => (columns === 4 ? column * g.cw : column * g.cw);
  const key = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
  const by = top + stats.levels * g.ch + 8;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="hall" role="group" aria-label={t("a11y")}>
      <g aria-hidden="true">
        <line x1="92" y1="13" x2="136" y2="13" className="gl" />
        <line x1="192" y1="13" x2="236" y2="13" className="gl" />
        <text x="164" y="13" className="lbl-tor">
          {t("tor")}
        </text>
      </g>
      <g
        className="couple"
        role="button"
        tabIndex={0}
        aria-label={t("coupleTableA11y", { kind: eventKind, eventTitle })}
        onClick={onSelectCouple}
        onKeyDown={onSelectCouple ? key(onSelectCouple) : undefined}
      >
        {/* Target ≥ 48 px even when the map is scaled to 288 px on 320 screens (56 × 0.88 ≈ 49). */}
        <rect x="76" y="34" width="176" height="56" fill="transparent" />
        <g transform="translate(148 26) scale(.27)" style={{ color: "var(--gold)" }}>
          <KoshkarMuiz width={120} height={64} x={0} y={0} strokeWidth={4.5} />
        </g>
        <rect x="98" y="47" width="132" height="34" rx="17" className="ctable" />
        <circle cx="86" cy="64" r="6" className="cseat" />
        <circle cx="242" cy="64" r="6" className="cseat" />
        <text x="164" y="64.5" className="lbl-couple" aria-hidden="true">
          {t("coupleTable", { kind: eventKind })}
        </text>
      </g>
      {stats.tables.map((tb) => {
        const ox = colX(tb.column);
        const oy = top + tb.level * g.ch;
        const mark = marks[tb.no];
        const label =
          mark?.move === "current"
            ? tm("mapCurrent")
            : mark?.move
              ? tm("mapFree", { free: Math.max(tb.free, 0) })
              : t("tableLabel", { taken: tb.used, capacity: tb.capacity });
        const aria = t("tableA11y", {
          number: tb.no,
          people: tb.used,
          capacity: tb.capacity,
          missing: tb.missing,
        });
        const dim = (dimUnmarked && !mark) || mark?.move === "unfit";
        return (
          <g
            key={tb.no}
            className={cn("tbl", selected === tb.no && "sel", dim && (mark?.move === "unfit" ? "unfit" : "dim"))}
            role="button"
            tabIndex={0}
            aria-label={aria}
            aria-pressed={selected === tb.no || undefined}
            data-table={tb.no}
            onClick={onSelectTable ? () => onSelectTable(tb.no) : undefined}
            onKeyDown={onSelectTable ? key(() => onSelectTable(tb.no)) : undefined}
          >
            <g aria-hidden="true">
              <TableCell
                t={tb}
                g={g}
                ox={ox}
                oy={oy}
                catCode={tb.mainCategoryId ? (categoryCodes[tb.mainCategoryId] ?? "baska") : null}
                catLabel={tb.mainCategoryId ? categoryLabels?.[tb.mainCategoryId] : undefined}
                mark={mark}
                label={label}
              />
            </g>
          </g>
        );
      })}
      <g aria-hidden="true">
        <path d={`M134 ${by + 4} h60`} className="door" />
        <text x="164" y={by + 22} className="lbl-ent">
          {t("entrance")}
        </text>
      </g>
    </svg>
  );
}

/** A single table in a cell (82×86 or 164×140) — for showcases and lists. */
export function TableGraphic({
  size,
  no,
  used,
  capacity,
  catCode,
  catLabel,
  mark,
}: {
  size: "cell" | "cell2";
  no: number;
  used: number;
  capacity: number;
  catCode: string | null;
  catLabel?: string;
  mark?: TableMark;
}) {
  const t = useTranslations("hall.map");
  const tm = useTranslations("hall.move");
  const g = geometry(size === "cell" ? 4 : 2);
  const missing = Math.max(0, used - capacity);
  return (
    <svg
      viewBox={`0 0 ${g.cw} ${g.ch}`}
      width={g.cw}
      height={g.ch}
      className="hall"
      role="img"
      aria-label={t("tableA11y", { number: no, people: used, capacity, missing })}
    >
      <g className="tbl" aria-hidden="true">
        <TableCell
          t={{ no, used, capacity, missing }}
          g={g}
          ox={0}
          oy={0}
          catCode={catCode}
          catLabel={catLabel}
          mark={mark}
          label={
            mark?.move === "current"
              ? tm("mapCurrent")
              : mark?.move
                ? tm("mapFree", { free: Math.max(capacity - used, 0) })
                : t("tableLabel", { taken: used, capacity })
          }
        />
      </g>
    </svg>
  );
}

/**
 * Large table graphic in the table sheet (200×200): chairs in blocks per family, the family's number on its
 * first chair (the same number is shown next to the family row).
 */
export function TableGraphicLarge({
  no,
  capacity,
  familySeats,
  catCode,
  label,
}: {
  no: number;
  capacity: number;
  /** Seats of each family in list order. */
  familySeats: number[];
  catCode: string | null;
  /** «үстел» / «стол» (content/messages). */
  label: string;
}) {
  const t = useTranslations("hall.map");
  const used = familySeats.reduce((a, b) => a + b, 0);
  const over = used > capacity;
  const R = 70;
  const c = capacity >= 15 ? 10 : 11;
  const seats: { fi: number; first: boolean }[] = [];
  familySeats.forEach((n, fi) => {
    for (let q = 0; q < n; q++) seats.push({ fi, first: q === 0 });
  });
  return (
    <svg
      viewBox="0 0 200 200"
      className="big-table"
      role="img"
      aria-label={t("tableA11y", { number: no, people: used, capacity, missing: Math.max(0, used - capacity) })}
    >
      {over && <circle cx={100} cy={100} r={R + c + 7} className="ring-over2" />}
      {chairs(100, 100, R, capacity).map((p, j) => {
        const s = seats[j];
        return (
          <g key={j}>
            <circle cx={p.x} cy={p.y} r={c} className={cn("seat", over ? "over" : s ? "taken" : "free")} />
            {s?.first && (
              <text x={p.x} y={p.y + 0.5} className="lbl-fam">
                {s.fi + 1}
              </text>
            )}
          </g>
        );
      })}
      <circle
        cx={100}
        cy={100}
        r={46}
        className={cn("disc", used === 0 && "empty")}
        style={{ fill: used === 0 || !catCode ? "var(--paper)" : `var(--cat-${catCode})` }}
      />
      {over && <circle cx={100} cy={100} r={46} className="disc-over" />}
      <text x={100} y={94} className="lbl-big">
        {no}
      </text>
      <text x={100} y={121} className="lbl-big-sub">
        {label}
      </text>
      {over && (
        <g className="badge-over">
          <circle cx={160} cy={40} r={14} />
          <text x={160} y={41} style={{ fontSize: 18 }}>
            !
          </text>
        </g>
      )}
    </svg>
  );
}

/** Legend: taken / free / overflow (DESIGN_v2 3.3). */
export function HallLegend() {
  const t = useTranslations("hall.map.legend");
  return (
    <div className="legend" role="list" aria-label={t("label")}>
      <span role="listitem">
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" className="seat taken" />
        </svg>
        {t("taken")}
      </span>
      <span role="listitem">
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5" className="seat free" />
        </svg>
        {t("free")}
      </span>
      <span role="listitem">
        <svg viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="5.5" className="seat over" />
        </svg>
        {t("overflow")}
      </span>
    </div>
  );
}
