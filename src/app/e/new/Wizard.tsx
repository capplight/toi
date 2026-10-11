"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { hasPlaceholder, type PresetKind, presets } from "@/domain/invitations/presets";
import { createEventAction, createMusicUploadAction, previewInviteAction } from "@/server/actions/events";
import { MusicUpload, type MusicValue } from "@/ui/components/MusicUpload";
import { InvitePreview } from "./InvitePreview";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Controls";
import { Icon } from "@/ui/components/Icon";
import { PilotBanner } from "@/ui/components/PilotBanner";
import { AlertDialog } from "@/ui/components/Sheet";
import { showToast, Toaster } from "@/ui/components/Toast";
import { HallPreview, HallSetupForm, type HallValue } from "@/ui/hall/HallSetupForm";
import { afterSheetClosed } from "@/ui/lib/history";
import { KoshkarMuiz } from "@/ui/ornaments/generated";

const KINDS = ["uilenu_toi", "kyz_uzatu", "sundet", "besik", "merey", "other"] as const;
const KIND_KEY = {
  uilenu_toi: "uilenuToi",
  kyz_uzatu: "kyzUzatu",
  sundet: "sundet",
  besik: "besik",
  merey: "merey",
  other: "other",
} as const;
const TEMPLATES = [
  { id: "ak-shanyrak", key: "akShanyrak" },
  { id: "kok-tun", key: "kokTun" },
  { id: "kyzgaldak", key: "kyzgaldak" },
] as const;
const STEPS = ["kind", "who", "venue", "text", "template", "music", "hall", "review"] as const;
type Step = (typeof STEPS)[number];
const TEXT_MAX = 600;

type Kind = (typeof KINDS)[number];
type TemplateId = (typeof TEMPLATES)[number]["id"];
type State = {
  kind: Kind;
  title: string;
  hostsLine: string;
  startsOn: string;
  startsAt: string;
  venueName: string;
  venueAddress: string;
  mapUrl: string;
  textKk: string;
  textRu: string;
  presetKk: string | null;
  presetRu: string | null;
  templateId: TemplateId;
  hall: HallValue | null;
};

const initial: State = {
  kind: "uilenu_toi",
  title: "",
  hostsLine: "",
  startsOn: "",
  startsAt: "",
  venueName: "",
  venueAddress: "",
  mapUrl: "",
  textKk: "",
  textRu: "",
  presetKk: null,
  presetRu: null,
  templateId: "ak-shanyrak",
  hall: null,
};

/**
 * «Жаңа той» (Ф3, mockup 10, DESIGN_v2 8.15 / 17.2). Nothing is saved until «Той ашу»: the steps live on the client,
 * the end is one `createEventAction` (+ the hall, if set). «←» on the first step / leaving asks
 * `wizard.leave.*`. Music upload is Ф5 (hidden behind `MUSIC_UPLOAD`), the live preview is simplified.
 */
export function Wizard({ musicUpload = true }: { musicUpload?: boolean }) {
  const t = useTranslations("wizard");
  const tk = useTranslations("events.kind");
  const th = useTranslations("hall.setup");
  const tl = useTranslations("legal");
  const ta = useTranslations("common.actions");
  const te = useTranslations("errors");
  const tm = useTranslations("meta.pages");
  const router = useRouter();
  const [s, setS] = useState<State>(initial);
  const [step, setStep] = useState<Step>("kind");
  const [done, setDone] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<"title" | "date" | "mapUrl" | "textKk" | "textRu", string>>>({});
  const [editing, setEditing] = useState<{ kk: boolean; ru: boolean }>({ kk: false, ru: false });
  const [leave, setLeave] = useState(false);
  const [hallDraft, setHallDraft] = useState<HallValue>({ columns: 4, tables: 16, seatsPerTable: 12 });
  const [busy, start] = useTransition();
  const [music, setMusic] = useState<MusicValue>(null);
  const [musicBusy, setMusicBusy] = useState(false);
  const locale = useLocale();
  const [fullPreview, setFullPreview] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const idx = STEPS.indexOf(step);
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((x) => ({ ...x, [k]: v }));
  const dirty = !done && JSON.stringify(s) !== JSON.stringify(initial);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // System «Back» (Android gesture, as Ф4 review П3): the wizard holds its own history entry. «Back» goes to the
  // previous step; on the first step with input it asks `wizard.leave.*`; a sheet closing by «Back» is ignored.
  const stepRef = useRef(0);
  const dirtyRef = useRef(false);
  const closingConfirm = useRef(false);
  const leaving = useRef(false);
  useEffect(() => {
    stepRef.current = idx;
    dirtyRef.current = dirty;
  }, [idx, dirty]);
  useEffect(() => {
    if (done) return;
    const push = () => window.history.pushState({ ...(window.history.state ?? {}), toiWizard: true }, "");
    if (!window.history.state?.toiWizard) push();
    const onPop = () => {
      if (leaving.current || closingConfirm.current || window.history.state?.toiWizard) return;
      if (stepRef.current > 0) {
        push();
        setStep(STEPS[stepRef.current - 1]!);
        window.scrollTo({ top: 0 });
      } else if (dirtyRef.current) setLeave(true);
      else {
        leaving.current = true;
        window.history.back();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [done]);

  const go = (to: Step) => {
    setStep(to);
    window.scrollTo({ top: 0 });
    requestAnimationFrame(() => top.current?.querySelector<HTMLElement>("h2")?.focus());
  };

  const check = (st: Step): boolean => {
    const e: typeof errors = {};
    if (st === "who") {
      if (!s.title.trim()) e.title = t("who.namesPlaceholder");
      if (!s.startsOn) e.date = te("field.required");
    }
    if (st === "venue" && s.mapUrl.trim() && !/^https:\/\/\S+$/.test(s.mapUrl.trim())) e.mapUrl = t("venue.mapError");
    if (st === "text") {
      if (s.textKk.length > TEXT_MAX) e.textKk = t("text.tooLong", { max: TEXT_MAX });
      if (s.textRu.length > TEXT_MAX) e.textRu = t("text.tooLong", { max: TEXT_MAX });
      // А6: a sample in [ ] cannot go to the guests — the text opens for editing with the error next to it.
      if (hasPlaceholder(s.textKk)) e.textKk = t("text.placeholderLeft");
      if (hasPlaceholder(s.textRu)) e.textRu = t("text.placeholderLeft");
      if (e.textKk || e.textRu) setEditing((x) => ({ kk: x.kk || Boolean(e.textKk), ru: x.ru || Boolean(e.textRu) }));
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => {
    if (step === "music" && musicBusy) return; // the file is still uploading / processing
    // «Той ашу» re-checks the text (А6): back to the text step if a [ ] sample is left.
    if (step === "review" && !check("text")) return go("text");
    if (!check(step)) return;
    if (step === "hall") set("hall", hallDraft);
    if (step === "review") return submit();
    go(STEPS[idx + 1]!);
  };

  const back = () => (idx === 0 ? (dirty ? setLeave(true) : window.history.back()) : go(STEPS[idx - 1]!));

  const submit = () =>
    start(async () => {
      try {
        const r = await createEventAction({
          event: {
            kind: s.kind,
            title: s.title,
            hostsLine: s.hostsLine || null,
            startsOn: s.startsOn,
            startsAt: s.startsAt || null,
            venueName: s.venueName || null,
            venueAddress: s.venueAddress || null,
            mapUrl: s.mapUrl || null,
            invitationTextKk: s.textKk || null,
            invitationTextRu: s.textRu || null,
            templateId: s.templateId,
          },
          hall: s.hall,
          musicAssetId: music?.assetId ?? null,
        });
        if (r.ok) {
          setDone(r.eventId);
          window.scrollTo({ top: 0 });
          return;
        }
        if ("field" in r) {
          const to: Step =
            r.field === "title" || r.field === "date" || r.field === "time" || r.field === "hostsLine"
              ? "who"
              : r.field === "hall"
                ? "hall"
                : r.field === "textKk" || r.field === "textRu"
                  ? "text"
                  : "venue";
          go(to);
          check(to);
          return;
        }
        showToast({ message: te(r.error === "forbidden" ? "forbidden" : "unknown") });
      } catch {
        showToast({ message: te("network") });
      }
    });

  const kindLabel = tk(KIND_KEY[s.kind]);
  const draft = {
    kind: s.kind,
    title: s.title,
    hostsLine: s.hostsLine || null,
    startsOn: s.startsOn,
    startsAt: s.startsAt || null,
    venueName: s.venueName || null,
    venueAddress: s.venueAddress || null,
    textKk: s.textKk || null,
    textRu: s.textRu || null,
    templateId: s.templateId,
    locale: (locale === "ru" ? "ru" : "kk") as "kk" | "ru",
  };
  const stepTitle: Record<Step, string> = {
    kind: t("kind.title"),
    who: t("who.title"),
    venue: t("venue.title"),
    text: t("text.title"),
    template: t("template.title"),
    music: t("music.title"),
    hall: th("title"),
    review: t("review.title"),
  };
  const dateLine = [s.startsOn ? s.startsOn.split("-").reverse().join(".") : "", s.startsAt]
    .filter(Boolean)
    .join(" · ");

  if (done) {
    return (
      <div className="wz">
        <main className="wz-body">
          <section className="wz-step done-step" aria-labelledby="wz-done" data-testid="wizard-done">
            <div className="done-wrap">
              <KoshkarMuiz className="success-orn draw" />
              <h1 id="wz-done" className="success-ttl">
                {t("done.title")}
              </h1>
              <p className="success-sub">{t("done.body")}</p>
              <div className="actions">
                <Link className="btn primary" href={`/e/${done}/settings/members`}>
                  <Icon name="user-plus" />
                  {t("done.inviteFamily")}
                </Link>
                <Link className="btn secondary" href={`/e/${done}/guests`}>
                  {t("done.toList")}
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const presetCards = (lang: "kk" | "ru") => {
    const list = presets(s.kind as PresetKind, lang);
    const chosen = lang === "kk" ? s.presetKk : s.presetRu;
    if (!list.length) return null;
    return (
      <div role="radiogroup" aria-label={lang === "kk" ? t("text.kkLabel") : t("text.ruLabel")}>
        {list.map((p) => (
          <div
            key={p.id}
            className="preset"
            role="radio"
            tabIndex={0}
            aria-checked={chosen === p.id}
            lang={lang}
            onClick={() => choose(lang, p.id, p.text)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(lang, p.id, p.text);
              }
            }}
          >
            <div className="ptxt">{p.text}</div>
            <div className="pfoot">
              <span className="chk">
                <Icon name="check" size="sm" />
              </span>
              <Button
                variant="text"
                width="auto"
                onClick={(e) => {
                  e.stopPropagation();
                  choose(lang, p.id, p.text);
                  setEditing((x) => ({ ...x, [lang]: true }));
                }}
              >
                {t("text.edit")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    );
  };
  function choose(lang: "kk" | "ru", id: string, text: string) {
    if (lang === "kk") setS((x) => ({ ...x, presetKk: id, textKk: text }));
    else setS((x) => ({ ...x, presetRu: id, textRu: text }));
  }

  const textArea = (lang: "kk" | "ru") => {
    const value = lang === "kk" ? s.textKk : s.textRu;
    const err = lang === "kk" ? errors.textKk : errors.textRu;
    return (
      <div className="sec">
        <label className="field-label" htmlFor={`wz-text-${lang}`}>
          {lang === "kk" ? t("text.kkLabel") : t("text.ruLabel")}
        </label>
        <textarea
          id={`wz-text-${lang}`}
          className="textarea"
          rows={6}
          lang={lang}
          value={value}
          aria-invalid={err ? true : undefined}
          onChange={(e) => (lang === "kk" ? set("textKk", e.target.value) : set("textRu", e.target.value))}
        />
        <div className="counter-ch">
          {value.length} / {TEXT_MAX}
        </div>
        {err && (
          <p className="field-error" role="alert">
            <Icon name="alert" size="sm" />
            <span>{err}</span>
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="wz" ref={top}>
      <div className="wz-top">
        <PilotBanner isOwner />
        <header className="wz-head">
          <Button variant="icon" icon="back" aria-label={ta("back")} onClick={back} />
          <h1 className="t-h1">{tm("newEvent")}</h1>
          <span className="prog" aria-live="polite">
            {t("progress", { step: idx + 1, total: STEPS.length })}
          </span>
        </header>
        <div className="wz-bar" aria-hidden="true">
          <i style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="wz-main">
        <nav className="wz-rail" aria-label={t("progress", { step: idx + 1, total: STEPS.length })}>
          <ol>
            {STEPS.map((st, i) => (
              <li key={st} className={i < idx ? "done" : undefined} aria-current={i === idx ? "step" : undefined}>
                <span className="n">{i < idx ? <Icon name="check" size="sm" /> : i + 1}</span>
                {stepTitle[st]}
              </li>
            ))}
          </ol>
        </nav>

        <main className="wz-body">
          <section className="wz-step" aria-labelledby="wz-step-title" data-testid={`wizard-step-${step}`}>
            <h2 id="wz-step-title" tabIndex={-1}>
              {stepTitle[step]}
            </h2>

            {step === "kind" && (
              <div className="tiles sec" role="radiogroup" aria-labelledby="wz-step-title">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="tile big"
                    role="radio"
                    aria-checked={s.kind === k}
                    onClick={() => setS((x) => ({ ...x, kind: k, presetKk: null, presetRu: null }))}
                  >
                    {s.kind === k && <Icon name="check" size="sm" />}
                    {tk(KIND_KEY[k])}
                  </button>
                ))}
              </div>
            )}

            {step === "who" && (
              <>
                <div className="sec">
                  <Field
                    label={t("who.namesLabel", { kind: s.kind })}
                    placeholder={t("who.namesPlaceholder")}
                    hint={t("who.namesHint")}
                    error={errors.title}
                    value={s.title}
                    maxLength={120}
                    autoComplete="off"
                    onChange={(e) => set("title", e.target.value)}
                  />
                </div>
                <div className="sec">
                  <Field
                    label={t("who.hostsLabel")}
                    placeholder={t("who.hostsPlaceholder")}
                    value={s.hostsLine}
                    maxLength={120}
                    autoComplete="off"
                    onChange={(e) => set("hostsLine", e.target.value)}
                  />
                </div>
                <div className="sec field-row2">
                  <Field
                    label={t("who.dateLabel")}
                    type="date"
                    icon="cal"
                    error={errors.date}
                    value={s.startsOn}
                    onChange={(e) => set("startsOn", e.target.value)}
                  />
                  <Field
                    label={t("who.timeLabel")}
                    type="time"
                    icon="clock"
                    value={s.startsAt}
                    onChange={(e) => set("startsAt", e.target.value)}
                  />
                </div>
              </>
            )}

            {step === "venue" && (
              <>
                <div className="sec">
                  <Field
                    label={t("venue.nameLabel")}
                    value={s.venueName}
                    maxLength={120}
                    onChange={(e) => set("venueName", e.target.value)}
                  />
                </div>
                <div className="sec">
                  <Field
                    label={t("venue.addressLabel")}
                    icon="pin"
                    value={s.venueAddress}
                    maxLength={200}
                    onChange={(e) => set("venueAddress", e.target.value)}
                  />
                </div>
                <div className="sec">
                  <Field
                    label={t("venue.mapLabel")}
                    hint={t("venue.mapHint")}
                    error={errors.mapUrl}
                    inputMode="url"
                    value={s.mapUrl}
                    maxLength={500}
                    onChange={(e) => set("mapUrl", e.target.value)}
                  />
                </div>
              </>
            )}

            {step === "text" && (
              <>
                <p className="intro">{t("text.intro")}</p>
                <span className="lang-tag">{t("text.kkLabel")}</span>
                {!editing.kk && presetCards("kk")}
                {(editing.kk || !presets(s.kind as PresetKind, "kk").length) && textArea("kk")}
                <div className="sec">
                  <span className="lang-tag">{t("text.ruLabel")}</span>
                  {!editing.ru && presetCards("ru")}
                  {(editing.ru || !presets(s.kind as PresetKind, "ru").length) && textArea("ru")}
                  <p className="note">{t("text.ruMissing")}</p>
                </div>
              </>
            )}

            {step === "template" && (
              <div className="tpl-cards sec" role="radiogroup" aria-labelledby="wz-step-title">
                {TEMPLATES.map((tp) => (
                  <div
                    key={tp.id}
                    className={`tpl-card tpl-${tp.id}`}
                    role="radio"
                    tabIndex={0}
                    aria-checked={s.templateId === tp.id}
                    onClick={() => set("templateId", tp.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        set("templateId", tp.id);
                      }
                    }}
                  >
                    <span className="env" aria-hidden="true" />
                    <div>
                      <b>{t(`template.${tp.key}`)}</b>
                      <span className="h">{t(`template.${tp.key}Hint`)}</span>
                      <span className="chk">{s.templateId === tp.id && <Icon name="check" size="sm" />}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step === "template" && (
              <Button variant="secondary" icon="eye" width="auto" className="mt-4" onClick={() => setFullPreview(true)}>
                {t("template.preview")}
              </Button>
            )}

            {step === "music" && (
              <>
                {musicUpload ? (
                  <div className="sec">
                    <MusicUpload
                      value={music}
                      onChange={setMusic}
                      onBusyChange={setMusicBusy}
                      actions={{
                        createUpload: async (x) => {
                          const r = await createMusicUploadAction({ eventId: null, ...x });
                          return r.ok ? r : { ok: false, error: "error" in r ? r.error : "failed" };
                        },
                        finalize: async (assetId) => {
                          const res = await fetch("/api/media/finalize", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ assetId }),
                          });
                          return (await res.json()) as { ok: true; url: string } | { ok: false; error: string };
                        },
                      }}
                    />
                  </div>
                ) : (
                  <p className="note">{t("music.hint", { maxMb: 20 })}</p>
                )}
                <p className="note">{t("music.rights")}</p>
                <Button variant="text" width="auto" className="mt-2" onClick={() => go("hall")}>
                  {t("music.later")}
                </Button>
              </>
            )}

            {step === "hall" && (
              <>
                <HallSetupForm value={hallDraft} onChange={setHallDraft} eventKind={kindLabel} eventTitle={s.title} />
                <Button
                  variant="text"
                  width="auto"
                  className="mt-3"
                  onClick={() => {
                    set("hall", null);
                    go("review");
                  }}
                >
                  {t("hall.skip")}
                </Button>
              </>
            )}

            {step === "review" && (
              <>
                <p className="intro">{t("review.intro")}</p>
                <div className="review" data-testid="wizard-review">
                  <Row k={t("kind.title")} v={kindLabel} onEdit={() => go("kind")} label={t("text.edit")} />
                  <Row
                    k={t("who.namesLabel", { kind: s.kind })}
                    v={s.title}
                    onEdit={() => go("who")}
                    label={t("text.edit")}
                  />
                  {s.hostsLine && (
                    <Row k={t("who.hostsLabel")} v={s.hostsLine} onEdit={() => go("who")} label={t("text.edit")} />
                  )}
                  <Row
                    k={`${t("who.dateLabel")} · ${t("who.timeLabel")}`}
                    v={dateLine}
                    onEdit={() => go("who")}
                    label={t("text.edit")}
                  />
                  {(s.venueName || s.venueAddress) && (
                    <Row
                      k={t("venue.title")}
                      v={[s.venueName, s.venueAddress].filter(Boolean).join(" · ")}
                      onEdit={() => go("venue")}
                      label={t("text.edit")}
                    />
                  )}
                  <Row
                    k={t("text.title")}
                    v={
                      [s.textKk && t("text.kkLabel"), s.textRu && t("text.ruLabel")].filter(Boolean).join(" · ") || "—"
                    }
                    onEdit={() => go("text")}
                    label={t("text.edit")}
                  />
                  <Row
                    k={t("template.title")}
                    v={t(`template.${TEMPLATES.find((x) => x.id === s.templateId)!.key}`)}
                    onEdit={() => go("template")}
                    label={t("text.edit")}
                  />
                  <Row
                    k={th("title")}
                    v={
                      s.hall
                        ? `${th("columns.option", { count: s.hall.columns })} · ${th("summary.formula", {
                            tables: s.hall.tables,
                            seats: s.hall.seatsPerTable,
                            total: s.hall.tables * s.hall.seatsPerTable,
                          })}`
                        : t("hall.skip")
                    }
                    onEdit={() => go("hall")}
                    label={t("text.edit")}
                  />
                </div>
              </>
            )}

            <div className="wz-foot">
              <div className="in">
                {idx > 0 && (
                  <Button variant="text" className="desk-only" onClick={back}>
                    {ta("back")}
                  </Button>
                )}
                <Button onClick={next} loading={busy || (step === "music" && musicBusy)} data-testid="wizard-next">
                  {step === "review" ? t("review.submit") : ta("continue")}
                </Button>
                {step === "kind" && (
                  <p className="legal">
                    {tl.rich("ownerTerms", {
                      termsLink: (chunks) => <b>{chunks}</b>,
                      privacyLink: (chunks) => <b>{chunks}</b>,
                    })}
                  </p>
                )}
              </div>
            </div>
          </section>
        </main>

        <aside className="wz-preview" aria-hidden="true">
          {step === "hall" ? (
            <HallPreview value={hallDraft} eventKind={kindLabel} eventTitle={s.title} />
          ) : (
            <div className="phone-frame">
              <InvitePreview draft={draft} load={previewInviteAction} title={t("template.preview")} />
            </div>
          )}
        </aside>
      </div>

      {fullPreview && (
        <div className="preview-full" role="dialog" aria-modal="true" aria-label={t("template.preview")}>
          <div className="bar">
            <Button variant="secondary" icon="x" width="auto" onClick={() => setFullPreview(false)}>
              {ta("close")}
            </Button>
          </div>
          <InvitePreview draft={draft} load={previewInviteAction} title={t("template.preview")} />
        </div>
      )}
      <AlertDialog
        open={leave}
        onOpenChange={(o) => {
          setLeave(o);
          // «Жоқ, жалғастыру» after the system «Back»: the wizard entry goes back (the dialog closes with its own step).
          if (!o && !leaving.current && !window.history.state?.toiWizard) {
            closingConfirm.current = true;
            afterSheetClosed(() => {
              closingConfirm.current = false;
              if (!window.history.state?.toiWizard)
                window.history.pushState({ ...(window.history.state ?? {}), toiWizard: true }, "");
            });
          }
        }}
        title={t("leave.title")}
        description=""
        confirmLabel={t("leave.yes")}
        cancelLabel={t("leave.no")}
        onConfirm={() => {
          leaving.current = true;
          setS(initial);
          afterSheetClosed(() => router.push("/e"));
        }}
      />
      <Toaster />
    </div>
  );
}

function Row({ k, v, onEdit, label }: { k: string; v: string; onEdit: () => void; label: string }) {
  return (
    <div className="r">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
      <Button variant="text" width="auto" onClick={onEdit} aria-label={`${label}: ${k}`}>
        {label}
      </Button>
    </div>
  );
}
