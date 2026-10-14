"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { normalizePhone } from "@/domain/guests/phone";
import {
  addMemberAction,
  newMemberLinkAction,
  removeMemberAction,
  rotateDoorTokenAction,
  signOutMemberAction,
} from "@/server/actions/events";
import type { MemberView } from "@/server/events/service";
import { Button } from "@/ui/components/Button";
import { CategoryTiles, Field, PhoneInput, type CategoryOption } from "@/ui/components/Controls";
import { Icon } from "@/ui/components/Icon";
import { AlertDialog, Sheet } from "@/ui/components/Sheet";
import { showToast } from "@/ui/components/Toast";

type Who = "father" | "mother" | "couple" | "other";
const WHO: Who[] = ["father", "mother", "couple", "other"];
const DEFAULT_CAT: Record<Who, string> = { father: "oz", mother: "nagashy", couple: "dos", other: "baska" };
const PARENT = (w: Who) => w === "father" || w === "mother";

/** «12.11, 14:05» in Almaty time (mockup 11). */
function stamp(iso: string): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const v = (k: string) => p.find((x) => x.type === k)?.value ?? "";
  return `${v("day")}.${v("month")}, ${v("hour")}:${v("minute")}`;
}

/** «Тізімді кім толтырады» (Ф3, mockup 11, DESIGN_v2 8.16). */
export function MembersScreen({
  eventId,
  members,
  categories,
  door,
}: {
  eventId: string;
  members: MemberView[];
  categories: CategoryOption[];
  /** Ф8: the helper's link (shown to the owner) and the ready wa.me link with `wa.doorLink`. */
  door: { waHref: string; url: string };
}) {
  const t = useTranslations("members");
  const tr = useTranslations("roles");
  const ta = useTranslations("common.actions");
  const te = useTranslations("errors");
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "signOut" | "remove"; m: MemberView } | null>(null);
  const [freshLinks, setFreshLinks] = useState<Record<string, string>>({});
  const [busy, start] = useTransition();

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      try {
        await fn();
      } catch {
        showToast({ message: te("network") });
      }
    });
  const fail = (r: { error?: string }) =>
    showToast({
      message:
        r.error === "linkLimit" ? t("add.errors.linkLimit") : te(r.error === "forbidden" ? "forbidden" : "unknown"),
    });

  /** New link (the old unused one closes). `send` → straight to WhatsApp (location.assign: iOS allows it). */
  const newLink = (m: MemberView, send: boolean) =>
    run(async () => {
      const r = await newMemberLinkAction({ memberId: m.id });
      if (!r.ok) return fail(r);
      if (send) return window.location.assign(r.waUrl);
      setFreshLinks((x) => ({ ...x, [m.id]: r.waUrl }));
      showToast({ message: t("card.newLinkToast") });
    });

  const statusLine = (m: MemberView) => {
    const s = m.status;
    if (s.kind === "joined")
      return (
        <div className="mstat ok">
          <Icon name="yes" />
          {t("card.joined", {
            device: s.device ?? "—",
            datetime: s.at ? stamp(s.at) : "",
          })}
        </div>
      );
    if (s.kind === "notJoined")
      return (
        <div className="mstat wait">
          <Icon name="clock" />
          {t("card.notJoined", { hours: s.hoursLeft })}
        </div>
      );
    return (
      <div className="mstat exp">
        <Icon name="alert" />
        {t("card.linkExpired")}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="col-main">
        <div className="page-head desk-only">
          <div className="ttl">
            <h1 className="t-h1">{t("title")}</h1>
          </div>
          <Button icon="user-plus" width="auto" onClick={() => setAdding(true)}>
            {t("add.button")}
          </Button>
        </div>
        <p className="mem-intro">{t("intro")}</p>
        <Button icon="user-plus" className="mob-only mb-4" onClick={() => setAdding(true)}>
          {t("add.button")}
        </Button>
        <div className="mem-grid">
          {members.map((m) => {
            const owner = m.role === "owner";
            const label = owner ? tr("owner") : m.label;
            const fresh = freshLinks[m.id];
            return (
              <article key={m.id} className={owner ? "mem owner" : "mem"} data-testid="member-card">
                <div className="top">
                  <span className="avatar" aria-hidden="true">
                    {(m.name ?? label).charAt(0).toUpperCase()}
                  </span>
                  <b>{m.name ? t("card.title", { label, name: m.name }) : label}</b>
                  <span className="ph">{m.phoneMasked}</span>
                </div>
                <div className="chips2">
                  {m.canEditSeating ? (
                    <span className="pchip">
                      <Icon name="grid" />
                      {tr("permission.listAndSeating")}
                    </span>
                  ) : (
                    <span className="pchip plain">
                      <Icon name="eye" />
                      {tr("permission.listOnly")}
                    </span>
                  )}
                  {m.canManageBudget && (
                    <span className="pchip">
                      <Icon name="wallet" />
                      {tr("permission.budget")}
                    </span>
                  )}
                </div>
                {statusLine(m)}
                {!owner && (
                  <div className="acts">
                    {fresh ? (
                      <a className="btn wa" href={fresh}>
                        <Icon name="wa" />
                        {t("card.sendLink")}
                      </a>
                    ) : (
                      m.status.kind === "notJoined" && (
                        <Button variant="wa" icon="wa" loading={busy} onClick={() => newLink(m, true)}>
                          {t("card.sendLink")}
                        </Button>
                      )
                    )}
                    <Button
                      variant={m.status.kind === "linkExpired" && !fresh ? "primary" : "secondary"}
                      className={m.status.kind === "linkExpired" && !fresh ? "wide" : undefined}
                      onClick={() => newLink(m, false)}
                    >
                      {t("card.newLink")}
                    </Button>
                    {m.status.kind === "joined" && (
                      <Button variant="danger" onClick={() => setConfirm({ kind: "signOut", m })}>
                        {t("card.signOut")}
                      </Button>
                    )}
                    <Button variant="text" onClick={() => setConfirm({ kind: "remove", m })}>
                      {t("card.remove")}
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {door && (
        <div className="col-aside">
          <section className="door-card" aria-labelledby="door-t">
            <h3 id="door-t">
              <Icon name="door" />
              {t("door.title")}
            </h3>
            <p>{t("door.hint")}</p>
            <div className="inline-actions">
              <a
                className="btn wa row"
                href={door.waHref}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="door-send"
              >
                <Icon name="wa" />
                {t("door.send")}
              </a>
              <Button
                variant="secondary"
                size="row"
                onClick={() => run(async () => void (await rotateDoorTokenAction({ eventId })))}
              >
                {t("door.rotate")}
              </Button>
            </div>
          </section>
        </div>
      )}

      <AddMemberSheet open={adding} onOpenChange={setAdding} eventId={eventId} categories={categories} />

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === "signOut" ? t("card.signOut") : t("card.remove")}
        description={
          confirm
            ? confirm.kind === "signOut"
              ? t("card.signOutConfirm", { label: confirm.m.label })
              : t("card.removeConfirm", { label: confirm.m.label })
            : ""
        }
        confirmLabel={confirm?.kind === "signOut" ? t("card.signOut") : t("card.remove")}
        cancelLabel={ta("cancel")}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          run(async () => {
            const r =
              c.kind === "signOut"
                ? await signOutMemberAction({ memberId: c.m.id })
                : await removeMemberAction({ memberId: c.m.id });
            if (!r.ok) fail("error" in r ? r : {});
          });
        }}
      />
    </div>
  );
}

function AddMemberSheet({
  open,
  onOpenChange,
  eventId,
  categories,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  categories: CategoryOption[];
}) {
  const t = useTranslations("members.add");
  const tr = useTranslations("roles");
  const tg = useTranslations("guestForm.phone");
  const te = useTranslations("errors");
  const [phone, setPhone] = useState("");
  const [who, setWho] = useState<Who>("father");
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [seating, setSeating] = useState<boolean | null>(null);
  const [budget, setBudget] = useState<boolean | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [err, setErr] = useState<{ phone?: string; label?: string }>({});
  const [busy, start] = useTransition();

  const canSeat = seating ?? PARENT(who);
  const canBudget = budget ?? PARENT(who);
  const defaultCat = categories.find((c) => c.code === DEFAULT_CAT[who])?.id;
  const catId = category ?? defaultCat;

  const submit = () => {
    const e: typeof err = {};
    if (!normalizePhone(phone)) e.phone = tg("incomplete");
    if (who === "other" && !custom.trim()) e.label = te("field.required");
    setErr(e);
    if (Object.keys(e).length) return;
    start(async () => {
      try {
        const r = await addMemberAction({
          eventId,
          phone,
          who,
          customLabel: who === "other" ? custom : null,
          name: name || null,
          canEditSeating: canSeat,
          canManageBudget: canBudget,
          defaultCategoryId: catId ?? null,
        });
        if (r.ok) {
          // Server-made link → WhatsApp. location.assign, not window.open: iOS blocks pop-ups after an await.
          window.location.assign(r.waUrl);
          return;
        }
        if ("field" in r)
          return setErr(r.field === "phone" ? { phone: tg("incomplete") } : { label: te("field.required") });
        if (r.error === "alreadyMember") return setErr({ phone: t("errors.alreadyMember") });
        showToast({
          message:
            r.error === "linkLimit" ? t("errors.linkLimit") : te(r.error === "forbidden" ? "forbidden" : "unknown"),
        });
      } catch {
        showToast({ message: te("network") });
      }
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("title")}
      footer={
        <Button variant="wa" icon="wa" loading={busy} onClick={submit} data-testid="add-member-submit">
          {t("submit")}
        </Button>
      }
    >
      <div className="form-sec">
        <PhoneInput
          label={t("phoneLabel")}
          value={phone}
          error={err.phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="form-sec">
        <span className="field-label" id="who-l">
          {t("whoLabel")}
        </span>
        <div className="tiles" role="radiogroup" aria-labelledby="who-l">
          {WHO.map((w) => (
            <button
              key={w}
              type="button"
              className="tile"
              role="radio"
              aria-checked={who === w}
              onClick={() => {
                setWho(w);
                setSeating(null);
                setBudget(null);
                setCategory(null);
              }}
            >
              {who === w && <Icon name="check" size="sm" />}
              {tr(w === "other" ? "other" : w)}
            </button>
          ))}
        </div>
        {who === "other" && (
          <Field
            className="mt-3"
            label={t("customLabel")}
            value={custom}
            maxLength={30}
            error={err.label}
            onChange={(e) => setCustom(e.target.value)}
          />
        )}
      </div>
      <div className="form-sec">
        <Field
          label={t("nameLabel")}
          value={name}
          maxLength={40}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="form-sec">
        <span className="field-label" id="perm-l">
          {t("permissionLabel")}
        </span>
        <div className="perm" role="radiogroup" aria-labelledby="perm-l">
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              className="opt"
              role="radio"
              aria-checked={canSeat === v}
              onClick={() => setSeating(v)}
            >
              <span className="rd" aria-hidden="true" />
              <b>{tr(v ? "permission.listAndSeating" : "permission.listOnly")}</b>
              <span className="ds">{t(v ? "listAndSeatingHint" : "listOnlyHint")}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="form-sec">
        <button
          type="button"
          className="sw-row"
          role="switch"
          aria-checked={canBudget}
          onClick={() => setBudget(!canBudget)}
        >
          <span className="tx">
            <b>{t("budgetLabel")}</b>
            <span>{t("budgetHint")}</span>
          </span>
          <span className="switch" aria-hidden="true" />
        </button>
      </div>
      <div className="form-sec">
        <span className="field-label">{t("defaultCategoryLabel")}</span>
        <CategoryTiles label={t("defaultCategoryLabel")} value={catId} onChange={setCategory} options={categories} />
      </div>
    </Sheet>
  );
}
