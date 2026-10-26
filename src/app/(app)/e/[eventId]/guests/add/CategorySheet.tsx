"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { createCategoryAction } from "@/server/actions/guests";
import type { CategoryView } from "@/server/guests/queries";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Controls";
import { Sheet } from "@/ui/components/Sheet";
import { showToast } from "@/ui/components/Toast";

const CODES = ["kuda", "oz", "nagashy", "dos", "ariptes", "korshi", "synyp", "baska"] as const;
const MAX = 40;

/** S3 «Жаңа санат» (design_spec 4.6): name, optional Russian name (Д4/11), place in the seating order. */
export function CategorySheet({
  open,
  onOpenChange,
  eventId,
  categories,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  categories: CategoryView[];
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("category");
  const te = useTranslations("errors");
  const ta = useTranslations("common.actions");
  const ordered = [...categories].sort((a, b) => a.rank - b.rank);
  // Default: before «Басқа» (after the second-to-last), or at the end.
  const last = ordered[ordered.length - 1];
  const fallback = last?.code === "baska" ? (ordered[ordered.length - 2]?.id ?? null) : (last?.id ?? null);
  const [label, setLabel] = useState("");
  const [labelRu, setLabelRu] = useState("");
  const [after, setAfter] = useState<string | null>(fallback);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const afterText = (c: CategoryView) =>
    c.code && (CODES as readonly string[]).includes(c.code)
      ? t(`after.${c.code as (typeof CODES)[number]}`)
      : t("after.custom", { category: c.label });

  const save = () => {
    const name = label.trim();
    if (!name) return setError(t("new.required"));
    if (name.length > MAX) return setError(t("new.tooLong", { max: MAX }));
    start(async () => {
      try {
        const r = await createCategoryAction({
          eventId,
          labelKk: name,
          labelRu: labelRu.trim() || null,
          afterCategoryId: after,
        });
        if (r.ok) {
          showToast({ message: t("new.addedToast", { category: name }) });
          setLabel("");
          setLabelRu("");
          onOpenChange(false);
          onCreated(r.categoryId);
          return;
        }
        if ("field" in r) {
          setError(
            r.field === "exists"
              ? t("new.exists")
              : r.field === "tooLong"
                ? t("new.tooLong", { max: MAX })
                : t("new.required"),
          );
          return;
        }
        showToast({ message: te("unknown") });
      } catch {
        showToast({ message: te("network") });
      }
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("new.title")}
      footer={
        <Button loading={busy} onClick={save}>
          {ta("save")}
        </Button>
      }
    >
      <Field
        label={t("new.nameLabel")}
        placeholder={t("new.namePlaceholder")}
        value={label}
        error={error ?? undefined}
        onChange={(e) => {
          setLabel(e.target.value);
          setError(null);
        }}
      />
      <Field
        className="mt-5"
        label={t("new.ruNameLabel")}
        value={labelRu}
        lang="ru"
        onChange={(e) => setLabelRu(e.target.value)}
      />
      <fieldset className="radio-rows mt-5">
        <legend className="field-label">{t("new.positionLabel")}</legend>
        {ordered.map((c) => (
          <label key={c.id}>
            <input type="radio" name="after" checked={after === c.id} onChange={() => setAfter(c.id)} />
            {afterText(c)}
          </label>
        ))}
        <label>
          <input type="radio" name="after" checked={after === null} onChange={() => setAfter(null)} />
          {t("after.last")}
        </label>
      </fieldset>
      <p className="field-hint">{t("new.hint")}</p>
    </Sheet>
  );
}
