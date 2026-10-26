"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import type { RequestOtpResult, VerifyOtpResult } from "@/server/auth/otp";
import { Button } from "@/ui/components/Button";
import { PhoneInput } from "@/ui/components/Controls";
import { Icon } from "@/ui/components/Icon";
import { cn } from "@/ui/lib/cn";

type Actions = {
  requestOtp: (input: { phone: string; fallback?: boolean }) => Promise<RequestOtpResult>;
  verifyOtp: (input: {
    phone: string;
    code: string;
  }) => Promise<Exclude<VerifyOtpResult, { ok: true }> | { ok: true; redirectTo: string }>;
  otpStatus: (challengeId: string) => Promise<{ status: "sent" | "delivered" | "failed" }>;
};

type Step = { kind: "phone" } | { kind: "code"; challengeId: string; devCode?: string; sentAt: number };

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const maskPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `+7 ${d.slice(0, 3)} ${d.slice(3, 6)} •• ${d.slice(8)}` : raw;
};

/** /login (mockup 09 `#sms`, `#code`): Ф2 logic, Ф1 look. */
export function LoginForm({ consoleMode, actions }: { consoleMode: boolean; actions: Actions }) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const tw = useTranslations("wa");
  const askOwnerUrl = `https://wa.me/?text=${encodeURIComponent(tw("requestLink", { label: "" }).trim())}`;
  const codeId = useId();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notArrived, setNotArrived] = useState(false);
  const [left, setLeft] = useState(0);
  const [pending, start] = useTransition();

  // Countdown to «Жаңа код сұрау»; the «Код келмеді ме?» block after 60 s or when the provider reports a failure (20 s).
  useEffect(() => {
    if (step.kind !== "code") return;
    const tick = () => {
      const passed = Math.floor((Date.now() - step.sentAt) / 1000);
      setLeft(Math.max(0, 60 - passed));
      if (passed >= 60) setNotArrived(true);
    };
    tick();
    const timer = setInterval(tick, 1000);
    const status = setTimeout(async () => {
      const s = await actions.otpStatus(step.challengeId);
      if (s.status === "failed") setNotArrived(true);
    }, 20_000);
    return () => {
      clearInterval(timer);
      clearTimeout(status);
    };
  }, [step, actions]);

  const send = (fallback = false) =>
    start(async () => {
      setError(null);
      try {
        const r = await actions.requestOtp({ phone, fallback });
        if (r.ok) {
          setStep({ kind: "code", challengeId: r.challengeId, devCode: r.devCode, sentAt: Date.now() });
          setNotArrived(false);
          setCode("");
        } else if (r.error === "phoneIncomplete") setError(t("login.errors.phoneIncomplete"));
        else if (r.error === "phoneNotMobile") setError(t("login.errors.phoneNotMobile"));
        else if (r.error === "tooSoon") setError(t("login.errors.tooSoon", { seconds: r.retryAfterSec }));
        else if (r.error === "locked") setError(t("code.errors.locked", { minutes: Math.ceil(r.retryAfterSec / 60) }));
        else if (r.error === "tooMany") setError(t("login.errors.tooMany"));
        else setError(t("login.errors.sendFailed"));
      } catch {
        setError(te("server"));
      }
    });

  const verify = () =>
    start(async () => {
      setError(null);
      try {
        const r = await actions.verifyOtp({ phone, code });
        if (r.ok) {
          window.location.assign(r.redirectTo);
          return;
        }
        if (r.error === "wrong") setError(t("code.errors.wrong", { left: r.left }));
        else if (r.error === "locked") setError(t("code.errors.locked", { minutes: r.minutes }));
        else setError(t(r.error === "incomplete" ? "code.errors.incomplete" : "code.errors.expired"));
      } catch {
        setError(te("server"));
      }
    });

  if (step.kind === "phone") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <h1>{t("login.title")}</h1>
        <p>{t("login.subtitle")}</p>
        <div style={{ marginTop: 22 }}>
          <PhoneInput
            label={t("login.phoneLabel")}
            hint={t("login.phoneHint")}
            error={error ?? undefined}
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="btns">
          <Button type="submit" loading={pending}>
            {t("login.submit")}
          </Button>
          <a className="btn text" style={{ width: "100%" }} href={askOwnerUrl}>
            <Icon name="wa" style={{ color: "var(--success)" }} />
            {t("login.askOwner")}
          </a>
        </div>
      </form>
    );
  }

  const cells = Array.from({ length: 6 }, (_, i) => code[i] ?? "");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
    >
      <h1>{t("code.title")}</h1>
      <p>{t("code.sentTo", { phone: maskPhone(phone) })}</p>
      {consoleMode && step.devCode && (
        // SMS_PROVIDER=console only (local/preview, forbidden in production): the code on screen (plan 3.6).
        <p data-testid="dev-code" className="dev-code">
          console: {step.devCode}
        </p>
      )}
      <label htmlFor={codeId} className="sr-only">
        {t("code.inputLabel")}
      </label>
      <div className={cn("code-cells", error && "error")}>
        {cells.map((c, i) => (
          <span key={i} className={cn(i === Math.min(code.length, 5) && "cur")} aria-hidden="true">
            {c}
          </span>
        ))}
        <input
          id={codeId}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${codeId}-err` : undefined}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </div>
      {error && (
        <p id={`${codeId}-err`} className="field-error" role="alert">
          <Icon name="alert" size="sm" />
          <span>{error}</span>
        </p>
      )}
      <div
        className="muted-row t-body t-muted"
        style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}
      >
        <Icon name="clock" size="sm" />
        {left > 0 ? t("code.resendIn", { time: fmtTime(left) }) : null}
      </div>
      {notArrived && (
        <div className="warn" role="status">
          <Icon name="alert" />
          <div>
            <b>{t("code.notArrivedTitle")}</b>
            <div>{t("code.notArrivedBody")}</div>
          </div>
        </div>
      )}
      <div className="btns">
        <Button type="submit" loading={pending}>
          {t("join.submit")}
        </Button>
        {notArrived && (
          <a className="btn wa" href={askOwnerUrl}>
            <Icon name="wa" />
            {t("code.askOwner")}
          </a>
        )}
        <Button variant="secondary" disabled={pending || left > 0} onClick={() => send(true)}>
          {t("code.resend")}
        </Button>
        <Button
          variant="text"
          width="full"
          onClick={() => {
            setStep({ kind: "phone" });
            setCode("");
            setError(null);
          }}
        >
          {t("code.changePhone")}
        </Button>
      </div>
    </form>
  );
}
