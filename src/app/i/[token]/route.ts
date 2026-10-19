import { randomBytes } from "node:crypto";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { translator } from "@/i18n/messages";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { answerAsGuest, type GuestPage, loadGuestPage, notFoundAllowed } from "@/server/invite/guest";
import { renderInvite, renderNotFound } from "@/server/invite/render";

/**
 * `/i/{token}` — the guest page (Ф5, plan 1.3 and 10): a route handler returning ready HTML (no React runtime on the
 * client; templates are tagged strings with escaping — spike result in the handover). GET shows the envelope /
 * invitation / answer states; POST is the answer (form → 303, `Accept: application/json` → JSON).
 */
export const dynamic = "force-dynamic";

const CONSENT = process.env.FEATURE_GUEST_CONSENT === "1";

function ipOf(req: Request): string | null {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "").trim();
  return /^[0-9a-fA-F:.]{2,45}$/.test(ip) ? ip : null;
}

function cookie(req: Request, name: string): string | undefined {
  const m = (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m?.[1];
}

function localeOf(req: Request, page: GuestPage | null): { locale: Locale; set: boolean } {
  const q = new URL(req.url).searchParams.get("lang");
  if (isLocale(q)) return { locale: q, set: true };
  const c = cookie(req, LOCALE_COOKIE);
  if (isLocale(c)) return { locale: c, set: false };
  return { locale: page?.event.defaultLocale ?? "kk", set: false };
}

function headers(nonce: string, extra: Record<string, string> = {}): Headers {
  const h = new Headers({
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex, nofollow",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "content-security-policy": [
      "default-src 'self'",
      `script-src 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self'",
      "media-src 'self' blob: https:",
      "connect-src 'self'",
      "form-action 'self'",
      "base-uri 'none'",
      "object-src 'none'",
      "frame-ancestors 'self'",
    ].join("; "),
    ...extra,
  });
  return h;
}

async function notFound(req: Request, locale: Locale): Promise<Response> {
  const ok = await notFoundAllowed(db(), ipOf(req), new Date());
  return new Response(renderNotFound(locale), {
    status: ok ? 404 : 429,
    headers: headers("none", { "cache-control": "no-store" }),
  });
}

function page(
  req: Request,
  p: GuestPage,
  locale: Locale,
  opts: { status?: number; formError?: string | null; forceForm?: boolean; setLocale?: boolean } = {},
): Response {
  const url = new URL(req.url);
  const now = new Date();
  const closed = now >= p.event.closesAt;
  const answered = p.family.rsvp !== "pending";
  const view = closed
    ? "closed"
    : opts.forceForm || url.searchParams.has("change")
      ? "form"
      : answered
        ? "answered"
        : "form";
  const open = answered || url.searchParams.has("answered") || cookie(req, `inv_open_${p.token.slice(0, 8)}`) === "1";
  const nonce = randomBytes(16).toString("base64");
  const body = renderInvite(p, {
    locale,
    nonce,
    now,
    open,
    view,
    appUrl: env().APP_URL,
    formError: opts.formError ?? null,
    consentRequired: CONSENT,
  });
  const h = headers(nonce);
  if (opts.setLocale) h.append("set-cookie", `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return new Response(body, { status: opts.status ?? 200, headers: h });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const p = await loadGuestPage(db(), token);
  const { locale, set } = localeOf(req, p);
  if (!p) return notFound(req, locale);
  return page(req, p, locale, { setLocale: set });
}

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const json = (req.headers.get("accept") ?? "").includes("application/json");
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await req.text());
  } catch {
    form = new URLSearchParams();
  }
  const p = await loadGuestPage(db(), token);
  const { locale } = localeOf(req, p);
  if (!p) return json ? Response.json({ ok: false }, { status: 404 }) : notFound(req, locale);
  const t = translator(locale);
  const attending = form.get("attending");
  if (attending !== "yes" && attending !== "no") {
    const message = t("invite.rsvp.chooseAnswer");
    return json
      ? Response.json({ ok: false, message }, { status: 400 })
      : page(req, p, locale, { status: 400, formError: message, forceForm: true });
  }
  const r = await answerAsGuest(
    db(),
    token,
    {
      attending: attending === "yes",
      seats: form.get("seats") ? Number(form.get("seats")) : null,
      consent: form.get("consent") === "1",
    },
    { requireConsent: CONSENT },
  );
  if (r.ok) {
    const redirect = `/i/${token}?answered=1#rsvp`;
    return json
      ? Response.json({ ok: true, redirect }, { headers: { "cache-control": "no-store" } })
      : new Response(null, { status: 303, headers: { location: redirect, "cache-control": "no-store" } });
  }
  const status = r.error === "closed" ? 409 : r.error === "rateLimited" ? 429 : r.error === "notFound" ? 404 : 400;
  const message =
    r.error === "closed"
      ? t("invite.closed")
      : r.error === "rateLimited"
        ? t("invite.rsvp.rateLimited")
        : r.error === "seats"
          ? t("invite.rsvp.seatsInvalid", { min: 1, max: 20 })
          : t("invite.rsvp.chooseAnswer");
  if (json) return Response.json({ ok: false, error: r.error, message }, { status });
  return page(req, p, locale, {
    status,
    formError: r.error === "closed" ? null : message,
    forceForm: r.error !== "closed",
  });
}
