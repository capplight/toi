"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, type RefObject, useEffect, useRef, useState, useTransition } from "react";
import { normalizePhone } from "@/domain/guests/phone";
import { guestStatus } from "@/domain/guests/status";
import { MAX_FAMILY_SEATS } from "@/domain/seating/family";
import { addFamilyAction, updateFamilyAction } from "@/server/actions/guests";
import type { GuestsData } from "@/server/guests/queries";
import type { DuplicateCandidate, FieldError } from "@/server/guests/service";
import { Button, ButtonLink } from "@/ui/components/Button";
import { CategoryTiles, Field, PhoneInput, Stepper } from "@/ui/components/Controls";
import { StatusBadge } from "@/ui/components/Display";
import { Icon } from "@/ui/components/Icon";
import { AlertDialog, Dialog } from "@/ui/components/Sheet";
import { showToast } from "@/ui/components/Toast";
import { KoshkarMuiz, Mark } from "@/ui/ornaments/generated";
import { afterSheetClosed, SendAsk, startSend, useWaLinks } from "../send-flow";
import { CategorySheet } from "./CategorySheet";

type Initial = { id: string; version: number; name: string; phone: string; categoryId: string; seats: number } | null;
type Success = { familyId: string; token: string; name: string; phone: string | null; seats: number; category: string };

const NAME_MAX = 80;
/** `leaveTo` value for the system «Back» (vs. an in-app link path). */
const BACK = "\u0000back";

export function GuestForm({
  data,
  initial,
  prefillName,
  backHref,
}: {
  data: GuestsData;
  initial: Initial;
  prefillName: string;
  backHref: string;
}) {
  const t = useTranslations("guestForm");
  const tc = useTranslations("guests.card");
  const te = useTranslations("errors");
  const ta = useTranslations("common.actions");
  const tl = useTranslations("common.list");
  const tsend = useTranslations("send");
  const router = useRouter();
  const link = useWaLinks(data.wa, data.appUrl);
  const defaultCategory =
    data.me.defaultCategoryId && data.categories.some((c) => c.id === data.me.defaultCategoryId)
      ? data.me.defaultCategoryId
      : (data.categories[0]?.id ?? "");

  const [name, setName] = useState(initial?.name ?? prefillName);
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? defaultCategory);
  const [seats, setSeats] = useState(initial?.seats ?? 2);
  const [nameError, setNameError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneConflict, setPhoneConflict] = useState<DuplicateCandidate | null>(null);
  const [dup, setDup] = useState<{ candidates: DuplicateCandidate[]; more: number } | null>(null);
  const [success, setSuccess] = useState<Success | null>(null);
  const [catSheet, setCatSheet] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const leaving = useRef(false);
  /** The confirm itself (opened by «Back») closes with a history step of its own — not a second «Back». */
  const closingConfirm = useRef(false);
  const [busy, start] = useTransition();
  const nameRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  const dirty =
    !success &&
    (initial
      ? name !== initial.name || phone !== initial.phone || categoryId !== initial.categoryId || seats !== initial.seats
      : name.trim() !== prefillName.trim() || phone.trim() !== "");

  // «Қонақ сақталмайды. Шығасыз ба?» — any in-app link while the form has unsaved input, and the system «Back»
  // (Android gesture, Ф4 review П3): like the Ф1 sheets, a dirty form holds its own history entry; when «Back»
  // pops it, the confirm opens; «Жоқ» puts the entry back, «Иә» goes back for real.
  useEffect(() => {
    if (!dirty) return;
    if (!window.history.state?.toiForm)
      window.history.pushState({ ...(window.history.state ?? {}), toiForm: true }, "");
    const onPop = () => {
      if (leaving.current || closingConfirm.current) return;
      // A sheet closing by «Back» returns to the form entry (still toiForm) — not a leave.
      if (window.history.state?.toiForm) return;
      setLeaveTo(BACK);
    };
    window.addEventListener("popstate", onPop);
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(a.pathname + a.search);
    };
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("popstate", onPop);
    };
  }, [dirty]);

  /** Navigate away: first drop the form's own history entry (if any), so «Back» later does not land on it. */
  const leaveForm = (go: () => void) =>
    afterSheetClosed(() => {
      if (!window.history.state?.toiForm) return go();
      leaving.current = true;
      const once = () => {
        window.removeEventListener("popstate", once);
        go();
      };
      window.addEventListener("popstate", once);
      window.history.back();
    });

  const categoryLabel = (id: string) => data.categories.find((c) => c.id === id)?.label ?? "";
  const member = (id: string) => data.members.find((m) => m.id === id);
  const fieldText = (f: FieldError) =>
    f === "nameRequired"
      ? t("name.required")
      : f === "nameTooLong"
        ? t("name.tooLong", { max: NAME_MAX })
        : f === "phoneIncomplete"
          ? t("phone.incomplete")
          : f === "seatsRange"
            ? t("seats.max", { max: MAX_FAMILY_SEATS })
            : te("unknown");

  const focusError = (ref: RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ block: "center" });
    ref.current?.querySelector("input")?.focus();
  };

  const submit = (confirmNotDuplicateOf?: string[]) => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("name.required"));
      return focusError(nameRef);
    }
    if (trimmed.length > NAME_MAX) {
      setNameError(t("name.tooLong", { max: NAME_MAX }));
      return focusError(nameRef);
    }
    if (phone.trim() && !normalizePhone(phone)) {
      setPhoneError(t("phone.incomplete"));
      return focusError(phoneRef);
    }
    if (phoneConflict) return focusError(phoneRef); // stays until the number is changed (design_spec 4.4)
    start(async () => {
      try {
        const payload = { name: trimmed, phone: phone.trim() || null, categoryId, seats };
        const r = initial
          ? await updateFamilyAction({ ...payload, familyId: initial.id, version: initial.version })
          : await addFamilyAction({ ...payload, eventId: data.event.id, confirmNotDuplicateOf });
        if (r.ok) {
          setDup(null);
          if (initial) {
            showToast({ message: t("savedToast", { name: trimmed }) });
            leaveForm(() => router.push(backHref));
          } else {
            const added = r as unknown as { familyId: string; token: string };
            setSuccess({
              familyId: added.familyId,
              token: added.token,
              name: trimmed,
              phone: normalizePhone(phone),
              seats,
              category: categoryLabel(categoryId),
            });
          }
          return;
        }
        if ("error" in r) return void showToast({ message: te(r.error === "forbidden" ? "forbidden" : "unknown") });
        if ("field" in r) {
          const text = fieldText(r.field);
          if (r.field.startsWith("name")) {
            setNameError(text);
            focusError(nameRef);
          } else if (r.field === "phoneIncomplete") {
            setPhoneError(text);
            focusError(phoneRef);
          } else showToast({ message: text });
          return;
        }
        if (r.conflict === "phone") {
          setDup(null);
          setPhoneConflict(r.existing);
          return focusError(phoneRef);
        }
        if (r.conflict === "similar") return void setDup({ candidates: r.candidates, more: r.more });
        if (r.conflict === "version") {
          showToast({ message: te("conflict") });
          router.refresh();
        }
      } catch {
        showToast({ message: t("errors.save") });
      }
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const reset = () => {
    setName("");
    setPhone("");
    setCategoryId(defaultCategory);
    setSeats(2);
    setSuccess(null);
    setNameError(null);
    setPhoneError(null);
    setPhoneConflict(null);
    requestAnimationFrame(() => nameRef.current?.querySelector("input")?.focus());
  };

  const toList = (familyId?: string) => {
    const sep = backHref.includes("?") ? "&" : "?";
    setSuccess(null);
    leaveForm(() => router.push(familyId ? `${backHref}${sep}new=${familyId}` : backHref));
  };

  const conflictMember = phoneConflict ? member(phoneConflict.memberId) : undefined;
  const submitLabel = initial ? t("saveEdit") : t("submit");

  return (
    <div className="page form-page">
      <div className="col-main">
        <form className="form-card" onSubmit={onSubmit} noValidate id="guest-form">
          <div className="form-sec" ref={nameRef}>
            <Field
              label={t("name.label")}
              placeholder={t("name.placeholder")}
              hint={t("name.hint")}
              error={nameError ?? undefined}
              value={name}
              autoFocus={!initial}
              autoCapitalize="words"
              autoComplete="off"
              enterKeyHint="next"
              maxLength={NAME_MAX + 20}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
              }}
            />
          </div>

          <div className="form-sec" ref={phoneRef}>
            <PhoneInput
              label={t("phone.label")}
              hint={phoneConflict ? undefined : t("phone.hint")}
              error={
                phoneConflict
                  ? t("phone.duplicate", { inList: conflictMember?.inListName ?? "" })
                  : (phoneError ?? undefined)
              }
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneError(null);
                setPhoneConflict(null);
              }}
            />
            {phoneConflict && (
              <>
                <div className="found" data-testid="phone-conflict">
                  <b>{phoneConflict.name}</b>{" "}
                  <span className="t-muted">· {categoryLabel(phoneConflict.categoryId)}</span>
                  <div className="row">
                    <CandidateBadge c={phoneConflict} />
                    {phoneConflict.tableNo && <b>{tc("table", { number: phoneConflict.tableNo })}</b>}
                  </div>
                </div>
                <p className="field-hint">{t("phone.duplicateHint")}</p>
              </>
            )}
          </div>

          <div className="form-sec">
            <span className="field-label" id="cat-label">
              {t("category.label")}
            </span>
            <CategoryTiles
              label={t("category.label")}
              value={categoryId}
              onChange={setCategoryId}
              options={data.categories.map((c) => ({ id: c.id, label: c.label, code: c.code ?? undefined }))}
              addLabel={t("category.addCustom")}
              onAdd={() => setCatSheet(true)}
            />
          </div>

          <div className="form-sec">
            <span className="field-label">{t("seats.label")}</span>
            <Stepper
              value={seats}
              onChange={setSeats}
              label={t("seats.label")}
              unit={t("seats.unit", { count: seats })}
              limitHint={seats <= 1 ? t("seats.min", { min: 1 }) : t("seats.max", { max: MAX_FAMILY_SEATS })}
              decreaseLabel={t("seats.decrease")}
              increaseLabel={t("seats.increase")}
            />
            <p className="field-hint center">{t("seats.hint")}</p>
          </div>

          <div className="form-actions">
            <Button type="submit" loading={busy}>
              {submitLabel}
            </Button>
            <ButtonLink href={backHref} variant="text">
              {ta("cancel")}
            </ButtonLink>
          </div>
        </form>
      </div>

      <div className="col-aside desk-only">
        <div className="tip">
          <h3>{t("aside.howTitle")}</h3>
          <p>{t("aside.howBody")}</p>
          {/* Ф5 (Ф4 review, deviation 4): the envelope the guest receives, with the name as typed */}
          <div className="mini-env" aria-hidden="true">
            <span className="seal">
              <Mark />
            </span>
            <span className="to">{name.trim() || t("name.placeholder").replace(/^[^:]*:s*/, "")}</span>
          </div>
        </div>
        <div className="tip">
          <h3>{t("aside.categoryTitle")}</h3>
          <p>{t("aside.categoryBody")}</p>
        </div>
      </div>

      <div className="sticky-cta">
        <Button type="submit" form="guest-form" loading={busy}>
          {submitLabel}
        </Button>
      </div>

      {/* S2-Dup «Бұл сол адам ба?» */}
      <Dialog
        open={dup !== null}
        onOpenChange={(o) => !o && setDup(null)}
        title={t("dup.title")}
        footer={
          <div className="sheet-actions">
            <Button
              onClick={() => {
                showToast({ message: t("dup.notAddedToast", { name: name.trim() }) });
                setDup(null);
                leaveForm(() => router.push(backHref));
              }}
            >
              {t("dup.same")}
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => submit(dup?.candidates.map((c) => c.id))}>
              {t("dup.different")}
            </Button>
          </div>
        }
      >
        {dup && (
          <>
            <p className="mt-0 mb-2">{t("dup.youTyped", { name: name.trim() })}</p>
            <p className="t-body t-muted m-0">{t("dup.similar", { count: dup.candidates.length })}</p>
            {dup.candidates.map((c) => (
              <div className="dupcard" key={c.id}>
                <div className="h">
                  <Icon name="users" />
                  {c.name}
                </div>
                <p>
                  {t("dup.candidateMeta", {
                    list: member(c.memberId)?.listName ?? "",
                    category: categoryLabel(c.categoryId),
                  })}
                </p>
                <div className="row">
                  <CandidateBadge c={c} />
                  <span>{c.tableNo ? t("dup.seatedAt", { number: c.tableNo }) : t("dup.notSeated")}</span>
                </div>
              </div>
            ))}
            {dup.more > 0 && <p className="t-body t-muted mt-0">{tl("andMore", { count: dup.more })}</p>}
            <p className="t-body t-muted m-0">{t("dup.hint")}</p>
          </>
        )}
      </Dialog>

      {/* S2-OK «Қосылды!» */}
      <Dialog
        open={success !== null}
        onOpenChange={(o) => !o && success && toList(success.familyId)}
        title={<span className="sr-only">{t("success.title")}</span>}
        footer={
          success && (
            <div className="sheet-actions">
              <a
                className="btn wa"
                href={link("invite", { name: success.name, token: success.token, phone: success.phone })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  startSend(success.familyId, success.name, "invite");
                  toList(success.familyId);
                }}
              >
                <Icon name="wa" />
                {t("success.send")}
              </a>
              {!success.phone && <p className="field-hint center m-0">{tsend("noPhoneHint")}</p>}
              <Button variant="secondary" onClick={reset}>
                {t("success.addAnother")}
              </Button>
              <Button variant="text" onClick={() => toList(success.familyId)}>
                {t("success.backToList")}
              </Button>
            </div>
          )
        }
      >
        {success && (
          <div data-testid="add-success">
            <KoshkarMuiz className="success-orn draw" />
            <p className="success-ttl" aria-hidden="true">
              {t("success.title")}
            </p>
            <p className="success-sub">
              {t("success.summary", { name: success.name, category: success.category, seats: success.seats })}
            </p>
            <p className="t-body t-muted center mt-3.5 mb-0">{t("success.next")}</p>
          </div>
        )}
      </Dialog>

      <CategorySheet
        open={catSheet}
        onOpenChange={setCatSheet}
        eventId={data.event.id}
        categories={data.categories}
        onCreated={(id) => {
          setCategoryId(id);
          router.refresh();
        }}
      />

      <AlertDialog
        open={leaveTo !== null}
        onOpenChange={(o) => {
          if (o) return;
          const was = leaveTo;
          setLeaveTo(null);
          // «Жоқ, жалғастыру» after «Back»: put the form's history entry back.
          if (was === BACK && !leaving.current) {
            closingConfirm.current = true;
            afterSheetClosed(() => {
              closingConfirm.current = false;
              window.history.pushState({ ...(window.history.state ?? {}), toiForm: true }, "");
            });
          }
        }}
        title={t("leave.title")}
        description=""
        confirmLabel={t("leave.yes")}
        cancelLabel={t("leave.no")}
        onConfirm={() => {
          const to = leaveTo;
          leaving.current = true;
          setLeaveTo(null);
          setName(initial?.name ?? prefillName);
          setPhone(initial?.phone ?? "");
          if (to === BACK) afterSheetClosed(() => window.history.back());
          else if (to) leaveForm(() => router.push(to));
        }}
      />
      <SendAsk />
    </div>
  );
}

function CandidateBadge({ c }: { c: DuplicateCandidate }) {
  const status = guestStatus({ rsvp: c.rsvp, sentAt: c.sentAt ? new Date(c.sentAt) : null });
  return <StatusBadge status={status} seats={status === "yes" ? c.seats : undefined} />;
}
