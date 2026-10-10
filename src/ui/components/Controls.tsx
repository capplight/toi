"use client";

import * as RadioGroup from "@radix-ui/react-radio-group";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useTranslations } from "next-intl";
import { type InputHTMLAttributes, type ReactNode, useId, useState } from "react";
import { cn } from "../lib/cn";
import { MAX_FAMILY_SEATS } from "@/domain/seating/family";
import { Icon, type IconName } from "./Icon";

/* ---------------- LanguageSwitch (only /join, /login, guest page — Д3) ---------------- */

export function LanguageSwitch({
  value,
  onChange,
  onDark = false,
}: {
  value: "kk" | "ru";
  onChange: (v: "kk" | "ru") => void;
  onDark?: boolean;
}) {
  const t = useTranslations("common.lang");
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as "kk" | "ru")}
      className={cn("lang", onDark && "on-dark")}
      aria-label={t("label")}
    >
      <ToggleGroup.Item value="kk" lang="kk" aria-label={t("kkFull")}>
        {t("kk")}
      </ToggleGroup.Item>
      <ToggleGroup.Item value="ru" lang="ru" aria-label={t("ruFull")}>
        {t("ru")}
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}

/* ---------------- Segment «Схема | Тізім» ---------------- */

export function Segment<T extends string>({
  value,
  onChange,
  options,
  label,
  compact = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: IconName }[];
  label: string;
  compact?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("segment", compact && "compact")}
      aria-label={label}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o.value} value={o.value}>
          {o.icon && <Icon name={o.icon} />}
          <span className="seg-label">{o.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

/* ---------------- CategoryTiles (Radix RadioGroup) ---------------- */

export type CategoryOption = { id: string; label: string; code?: string };

export function CategoryTiles({
  value,
  onChange,
  options,
  label,
  addLabel,
  onAdd,
}: {
  value: string | undefined;
  onChange: (id: string) => void;
  options: CategoryOption[];
  label: string;
  addLabel?: string;
  onAdd?: () => void;
}) {
  return (
    <div>
      <RadioGroup.Root value={value} onValueChange={onChange} className="cats" aria-label={label}>
        {options.map((o) => (
          <RadioGroup.Item key={o.id} value={o.id} className="cat">
            <span className="sw" style={{ background: `var(--cat-${o.code ?? "baska"})` }} aria-hidden="true" />
            <RadioGroup.Indicator>
              <Icon name="check" size="sm" />
            </RadioGroup.Indicator>
            {o.label}
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      {addLabel && onAdd && (
        <div className="cats cats-add">
          <button type="button" className="cat add" onClick={onAdd}>
            <Icon name="plus" size="sm" />
            {addLabel}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Stepper 1…20 (64×64) ---------------- */

export function Stepper({
  value,
  onChange,
  min = 1,
  max = MAX_FAMILY_SEATS,
  label,
  unit,
  limitHint,
  decreaseLabel,
  increaseLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  /** Accessible name of the number field. */
  label: string;
  /** Text under the number, e.g. «орын». */
  unit: string;
  /** Shown when − / + is pressed at a limit (the buttons stay visible). */
  limitHint?: string;
  /** «Орынды азайту» / «Орынды көбейту» (guestForm.seats.*). */
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const [hint, setHint] = useState(false);
  const id = useId();
  const step = (d: number) => {
    const next = value + d;
    if (next < min || next > max) {
      setHint(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(30);
      return;
    }
    setHint(false);
    onChange(next);
  };
  return (
    <div>
      <div className="stepper">
        <button type="button" aria-label={decreaseLabel} aria-disabled={value <= min} onClick={() => step(-1)}>
          <Icon name="minus" />
        </button>
        <div className="val">
          <input
            id={id}
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label={label}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ""));
              if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
            }}
          />
          <span>{unit}</span>
        </div>
        <button type="button" aria-label={increaseLabel} aria-disabled={value >= max} onClick={() => step(1)}>
          <Icon name="plus" />
        </button>
      </div>
      {hint && limitHint && (
        <p className="field-hint center" role="status">
          {limitHint}
        </p>
      )}
    </div>
  );
}

/* ---------------- Field / Input / PhoneInput / Search ---------------- */

export function Field({
  label,
  hint,
  error,
  prefix,
  icon,
  className,
  variant,
  ...input
}: {
  label: string;
  hint?: string;
  error?: string;
  prefix?: string;
  icon?: IconName;
  variant?: "search" | "door";
  /** Hide the visible label (search). The accessible name stays. */
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(" ") || undefined;
  const search = variant === "search" || variant === "door";
  return (
    <div className={className}>
      <label htmlFor={id} className={search ? "sr-only" : "field-label"}>
        {label}
      </label>
      <div className={cn("input", error && "error", search && "search", variant === "door" && "door")}>
        {icon && <Icon name={icon} />}
        {prefix && <span className="prefix">{prefix}</span>}
        <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      </div>
      {hint && !error && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="field-error" role="alert">
          <Icon name="alert" size="sm" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

/** Kazakhstan phone with a fixed «+7» prefix; the value is the national part as typed. */
export function PhoneInput(props: Omit<Parameters<typeof Field>[0], "prefix" | "type" | "inputMode">) {
  return <Field {...props} prefix="+7" type="tel" inputMode="tel" autoComplete="tel-national" />;
}

export function Search({
  label,
  placeholder,
  value,
  onChange,
  door = false,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  door?: boolean;
}) {
  return (
    <Field
      label={label}
      placeholder={placeholder}
      icon="search"
      variant={door ? "door" : "search"}
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="field-group">{children}</div>;
}
