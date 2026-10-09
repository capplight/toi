"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { otpStatusAction, requestOtpAction, verifyOtpAction } from "@/server/actions/auth";

const input = "block w-full min-h-12 rounded border border-neutral-500 px-3 text-lg";
const btn = "block w-full min-h-12 rounded border border-neutral-900 px-4 py-3 text-center text-lg disabled:opacity-50";

type Step = { kind: "phone" } | { kind: "code"; challengeId: string; devCode?: string };

export function LoginForm({ consoleMode }: { consoleMode: boolean }) {
  const t = useTranslations("auth");
  const te = useTranslations("errors");
  const tw = useTranslations("wa");
  // The owner's number is not known on /login: wa.me without a number lets the person pick the owner.
  const askOwnerUrl = `https://wa.me/?text=${encodeURIComponent(tw("requestLink", { label: "" }).trim())}`;
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notDelivered, setNotDelivered] = useState(false);
  const [pending, start] = useTransition();

  // Plan 6.1 flow 2: ask the provider about delivery ~20 s after sending.
  useEffect(() => {
    if (step.kind !== "code") return;
    const timer = setTimeout(async () => {
      const s = await otpStatusAction(step.challengeId);
      if (s.status === "failed") setNotDelivered(true);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [step]);

  const send = (fallback = false) =>
    start(async () => {
      setError(null);
      try {
        const r = await requestOtpAction({ phone, fallback });
        if (r.ok) {
          setStep({ kind: "code", challengeId: r.challengeId, devCode: r.devCode });
          setNotDelivered(false);
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
        const r = await verifyOtpAction({ phone, code });
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
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <h1 className="text-2xl font-semibold">{t("login.title")}</h1>
        <p>{t("login.subtitle")}</p>
        <label className="block space-y-1">
          <span>{t("login.phoneLabel")}</span>
          <input
            className={input}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            name="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <span className="block text-sm text-neutral-600">{t("login.phoneHint")}</span>
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className={btn} disabled={pending}>
          {t("login.submit")}
        </button>
        <a className={btn} href={askOwnerUrl}>
          {t("login.askOwner")}
        </a>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        verify();
      }}
    >
      <h1 className="text-2xl font-semibold">{t("code.title")}</h1>
      <p>{t("login.sentNote")}</p>
      {consoleMode && step.devCode && (
        // SMS_PROVIDER=console only (local/preview): the code is shown on screen (plan 3.6). Technical, not UI copy.
        <p data-testid="dev-code" className="rounded bg-neutral-100 p-2 font-mono">
          console: {step.devCode}
        </p>
      )}
      <label className="block space-y-1">
        <span>{t("code.inputLabel")}</span>
        <input
          className={input}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" className={btn} disabled={pending}>
        {t("join.submit")}
      </button>
      {notDelivered && (
        <div className="space-y-2" role="status">
          <p className="font-semibold">{t("code.notArrivedTitle")}</p>
          <p>{t("code.notArrivedBody")}</p>
          <a className={btn} href={askOwnerUrl}>
            {t("code.askOwner")}
          </a>
        </div>
      )}
      <button type="button" className={btn} disabled={pending} onClick={() => send(true)}>
        {t("code.resend")}
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => {
          setStep({ kind: "phone" });
          setCode("");
          setError(null);
        }}
      >
        {t("code.changePhone")}
      </button>
    </form>
  );
}
