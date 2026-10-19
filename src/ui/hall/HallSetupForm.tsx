"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { tableStats } from "@/domain/seating";
import { Stepper } from "../components/Controls";
import { Icon } from "../components/Icon";
import { HallMap } from "./HallMap";

export type HallValue = { columns: 2 | 4; tables: number; seatsPerTable: number };
export const HALL_LIMITS = { tables: { min: 1, max: 60 }, seats: { min: 6, max: 16 } } as const;

/**
 * «Залды баптау» form (mockup 10 `#hall`, `hall.setup.*`): rows 2 | 4 with mini schemes, «Үстел саны» 1–60,
 * «Бір үстелде неше орын?» 6–16, the total card and an empty-hall preview. Shared by the wizard (Ф3) and H1 (Ф7b).
 * `preview: false` — the caller shows the preview elsewhere (desktop right column).
 */
export function HallSetupForm({
  value,
  onChange,
  eventKind,
  eventTitle,
  preview = true,
}: {
  value: HallValue;
  onChange: (v: HallValue) => void;
  eventKind: string;
  eventTitle: string;
  preview?: boolean;
}) {
  const t = useTranslations("hall.setup");
  return (
    <>
      <div className="sec">
        <span className="field-label" id="hall-cols">
          {t("columns.title")}
        </span>
        <div className="cols-tiles" role="radiogroup" aria-labelledby="hall-cols">
          {([2, 4] as const).map((c) => (
            <button
              key={c}
              type="button"
              className="tile"
              role="radio"
              aria-checked={value.columns === c}
              onClick={() => onChange({ ...value, columns: c })}
            >
              <span className="mini-cols" style={{ gridTemplateColumns: `repeat(${c}, 0.625rem)` }} aria-hidden="true">
                {Array.from({ length: c * 2 }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
              {value.columns === c && <Icon name="check" size="sm" />}
              {t("columns.option", { count: c })}
            </button>
          ))}
        </div>
        <p className="field-hint">{t("columns.hint")}</p>
      </div>
      <div className="sec">
        <span className="field-label">{t("tables.title")}</span>
        <Stepper
          value={value.tables}
          onChange={(tables) => onChange({ ...value, tables })}
          min={HALL_LIMITS.tables.min}
          max={HALL_LIMITS.tables.max}
          label={t("tables.title")}
          unit=""
          limitHint={
            value.tables <= HALL_LIMITS.tables.min
              ? t("tables.min", { min: HALL_LIMITS.tables.min })
              : t("tables.max", { max: HALL_LIMITS.tables.max })
          }
          decreaseLabel={t("tables.decrease")}
          increaseLabel={t("tables.increase")}
        />
      </div>
      <div className="sec">
        <span className="field-label">{t("seats.title")}</span>
        <Stepper
          value={value.seatsPerTable}
          onChange={(seatsPerTable) => onChange({ ...value, seatsPerTable })}
          min={HALL_LIMITS.seats.min}
          max={HALL_LIMITS.seats.max}
          label={t("seats.title")}
          unit=""
          limitHint={
            value.seatsPerTable <= HALL_LIMITS.seats.min
              ? t("seats.min", { min: HALL_LIMITS.seats.min })
              : t("seats.max", { max: HALL_LIMITS.seats.max })
          }
          decreaseLabel={t("seats.decrease")}
          increaseLabel={t("seats.increase")}
        />
      </div>
      <div className="total-card" role="status">
        <div className="lbl">{t("summary.total")}</div>
        <div className="f">
          {t("summary.formula", {
            tables: value.tables,
            seats: value.seatsPerTable,
            total: value.tables * value.seatsPerTable,
          })}
        </div>
      </div>
      {preview && (
        <div className="mob-only">
          <HallPreview value={value} eventKind={eventKind} eventTitle={eventTitle} />
        </div>
      )}
    </>
  );
}

/** «Зал осылай болады»: the empty hall drawn by the same `HallMap` as «Зал». */
export function HallPreview({
  value,
  eventKind,
  eventTitle,
}: {
  value: HallValue;
  eventKind: string;
  eventTitle: string;
}) {
  const t = useTranslations("hall.setup");
  const stats = useMemo(
    () =>
      tableStats({
        hall: { columns: value.columns, tables: value.tables, seatsPerTable: value.seatsPerTable },
        categories: [],
        families: [],
      }),
    [value.columns, value.tables, value.seatsPerTable],
  );
  return (
    <div className="hall-mini" aria-hidden="true" inert>
      <p className="cap">{t("previewTitle")}</p>
      <HallMap stats={stats} columns={value.columns} categoryCodes={{}} eventKind={eventKind} eventTitle={eventTitle} />
    </div>
  );
}
