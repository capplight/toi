import { daysUntil, eventDateParts, monogram, splitTitle } from "@/domain/invitations/dates";
import type { Locale } from "@/i18n/config";
import { translator } from "@/i18n/messages";
import { MAX_FAMILY_SEATS } from "@/domain/seating/family";
import { INVITE_CSS, TEMPLATE_ASSETS } from "./assets.generated";
import type { GuestPage } from "./guest";
import { escapeHtml, html, raw, type SafeHtml } from "./html";
import { ISLAND_JS } from "./island";

/**
 * Guest page `/i/{token}` (Ф5, DESIGN 8.17, mockups 05–07): one HTML string — envelope scene, invitation, answer
 * form and its states. No React runtime; the island script is inlined with a CSP nonce.
 */
export type InviteView = "form" | "answered" | "closed";
export type RenderOptions = {
  locale: Locale;
  nonce: string;
  now: Date;
  /** Skip the envelope scene (repeat visit, answered, or `?answered=1`). */
  open: boolean;
  view: InviteView;
  appUrl: string;
  /** Error under the form (no-JS POST that failed). */
  formError?: string | null;
  /** Wizard/settings preview: no form actions, no pings, no music. */
  preview?: boolean;
  consentRequired?: boolean;
};

type TemplateKey = keyof typeof TEMPLATE_ASSETS;

export function templateKey(id: string): TemplateKey {
  return (id in TEMPLATE_ASSETS ? id : "ak-shanyrak") as TemplateKey;
}

const ICON = {
  pin: '<svg class="ico-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
  map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.1 6 9.9 4 3 6.6v13.4l6.9-2.6 4.2 2 6.9-2.6V3.4Z"/><path d="M9.9 4v13.4"/><path d="M14.1 6v13.4"/></svg>',
  yes: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  no: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
  send: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>',
  check:
    '<svg class="check-draw" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M20 6 9 17l-5-5"/></svg>',
  note: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
};

/** Extra rules the mockups did not need (error line, closed card, lang links as buttons, no-music). */
const EXTRA_CSS = `.rsvp .err{margin:.75rem 0 0;color:#B42318;font-weight:600}.inv .lang-pill a{display:inline-grid;place-items:center;min-width:3rem;height:3rem;padding:0 .5rem;border-radius:62.4375rem;text-decoration:none;font:400 1rem/1 var(--font-ui);letter-spacing:.04em;color:var(--ink-2)}.inv .lang-pill a[aria-current="true"]{background:var(--accent);color:var(--on-accent)}.rsvp .closed{margin:0}.preview .inv-bar,.preview .scene{display:none}.preview .invite{opacity:1}.noru{font-size:1rem;color:var(--ink-2)}.is-opening .side-decor{--b:1800ms}.is-opening .side-decor .draw path{animation:draw 1600ms var(--ease-draw) calc(var(--b,0ms) + var(--dd,0ms)) forwards}.is-opening .side-decor .draw .ray{animation-duration:700ms}@media (prefers-reduced-motion: reduce){.opened .reveal{animation:none!important;opacity:1!important}}`;

function corners(c: string, ks: string[]): SafeHtml {
  return raw(ks.map((k) => c.replace("{{k}}", k)).join(""));
}

export function renderInvite(page: GuestPage, o: RenderOptions): string {
  const t = translator(o.locale);
  const a = TEMPLATE_ASSETS[templateKey(page.event.templateId)];
  const ev = page.event;
  const fam = page.family;
  const kindLabel = t("events.kind.select", { kind: ev.kind });
  const parts = eventDateParts(ev.startsOn, ev.startsAt, o.locale, ev.tz);
  const days = daysUntil(ev.startsOn, o.now, ev.tz);
  const split = splitTitle(ev.title);
  const [m1, m2] = monogram(ev.title);
  const text = o.locale === "ru" ? (ev.textRu ?? ev.textKk) : (ev.textKk ?? ev.textRu);
  const ruMissing = o.locale === "ru" && !ev.textRu && Boolean(ev.textKk);
  const seats = fam.rsvp === "yes" ? (fam.confirmed ?? fam.expected) : fam.expected;
  const base = `/i/${page.token}`;
  const countdown =
    days > 1
      ? raw(escapeHtml(t("invite.date.countdown", { days })).replace(String(days), `<b>${days}</b>`))
      : days === 1
        ? t("invite.date.tomorrow")
        : days === 0
          ? t("invite.date.today")
          : t("invite.date.past");
  const names = split ? html`${split.a}<span class="amp">${split.amp}</span>${split.b}` : html`${ev.title}`;
  const musicSrc = !o.preview && page.musicKey ? `/api/files/${page.musicKey}` : null;
  const htmlClass = [o.open ? "is-open" : "", o.preview ? "preview" : ""].filter(Boolean).join(" ");
  const state = o.view === "answered" ? "answered" : "";

  const langPill = (where: string) =>
    o.preview
      ? html``
      : html`<div class="lang-pill" role="group" aria-label="${t("common.lang.label")}">
          <a href="${base}?lang=kk${where}" lang="kk" aria-current="${o.locale === "kk" ? "true" : "false"}"
            >${t("common.lang.kk")}</a
          >
          <a href="${base}?lang=ru${where}" lang="ru" aria-current="${o.locale === "ru" ? "true" : "false"}"
            >${t("common.lang.ru")}</a
          >
        </div>`;

  const form = html`<form class="card rsvp st-form" method="post" action="${base}#rsvp" novalidate>
    <h2>${t("invite.rsvp.title")}</h2>
    <p class="sub">${t("invite.rsvp.hint")}</p>
    <fieldset class="choice" style="border:0;padding:0;margin:0">
      <legend class="sr-only">${t("invite.rsvp.legend")}</legend>
      <label
        ><input
          type="radio"
          name="attending"
          value="yes"
          ${fam.rsvp !== "no" ? raw("checked") : ""}
        />${raw(ICON.yes)}${t("invite.rsvp.yes")}</label
      >
      <label
        ><input
          type="radio"
          name="attending"
          value="no"
          ${fam.rsvp === "no" ? raw("checked") : ""}
        />${raw(ICON.no)}${t("invite.rsvp.no")}</label
      >
    </fieldset>
    <div class="seats">
      <label class="q" for="seats">${t("invite.rsvp.seatsLabel")}</label>
      <div class="stepper-i">
        <button type="button" data-step="-1" aria-label="${t("invite.rsvp.seatsDecrease")}">${raw(ICON.minus)}</button>
        <div class="v">
          <input
            id="seats"
            name="seats"
            type="number"
            inputmode="numeric"
            min="1"
            max="${MAX_FAMILY_SEATS}"
            value="${seats}"
          /><small>${t("invite.rsvp.seatsUnit", { count: seats })}</small>
        </div>
        <button type="button" data-step="1" aria-label="${t("invite.rsvp.seatsIncrease")}">${raw(ICON.plus)}</button>
      </div>
      <p class="hint">${t("invite.rsvp.seatsHint")}</p>
    </div>
    ${
      o.consentRequired
        ? html`<label class="consent"
            ><input type="checkbox" name="consent" value="1" required /> ${raw(
              t.markup("invite.rsvp.consent", {
                privacyLink: (chunks) => `<a href="/privacy">${escapeHtml(chunks)}</a>`,
              }),
            )}</label
          >`
        : ""
    }
    <button
      class="btn-i fill"
      type="submit"
      data-sending="${t("invite.rsvp.sending")}"
      ${o.preview ? raw("disabled") : ""}
    >
      ${raw(ICON.send)}${t("invite.rsvp.submit")}
    </button>
    <p class="err" role="alert" data-network="${t("invite.rsvp.networkError")}" ${o.formError ? "" : raw("hidden")}>
      ${o.formError ?? ""}
    </p>
    <p class="note">${t("invite.rsvp.changeNote")}</p>
  </form>`;

  const answered = html`<div class="card rsvp st-answered keep">
    ${raw(a.doneOrn)}
    <h2>${fam.rsvp === "no" ? t("invite.thanks.noTitle") : t("invite.thanks.yesTitle")}</h2>
    ${fam.rsvp === "yes" ? html`<div class="done-sum">${raw(ICON.check)}${t("invite.thanks.yesSummary", { seats: fam.confirmed ?? 0 })}</div>` : ""}
    ${
      o.view === "closed"
        ? html`<p class="note closed">${t("invite.closed")}</p>`
        : html`<p class="note">${t("invite.rsvp.changeNote")}</p>
            <a class="btn-i" href="${base}?change=1#rsvp" style="margin-top:16px"
              >${raw(ICON.edit)}${t("invite.thanks.change")}</a
            >`
    }
  </div>`;

  const closedOnly = html`<div class="card rsvp keep" style="display:block">
    <h2>${t("invite.rsvp.title")}</h2>
    <p class="note closed">${t("invite.closed")}</p>
  </div>`;

  const rsvpBlock =
    o.view === "form" ? form : o.view === "answered" ? answered : fam.rsvp === "pending" ? closedOnly : answered;

  const scene = html`<section class="scene" aria-label="${t("invite.envelope.a11y")}">
    <div class="scene-decor">${raw(a.sceneDecor)}</div>
    <div class="scene-inner">
      <p class="env-hello">${t("invite.envelope.headline")}</p>
      <p class="env-to">${fam.name}</p>
      <div class="env" aria-hidden="true">
        <div class="env-back">${raw(a.envBack)}</div>
        <div class="letter">
          <span class="l-kick">${kindLabel}</span><span class="l-names">${ev.title}</span>${raw(a.letterOrn)}
        </div>
        <div class="pocket"></div>
        <div class="flap"><i class="f"></i><i class="b"></i></div>
        <span class="seal-glow"></span>
        <span class="seal"><span class="mono">${m1}${m2 ? html`<i></i>${m2}` : ""}</span></span>
      </div>
      <button class="open-btn" id="open" type="button">${t("invite.envelope.open")}</button>
      ${musicSrc ? html`<p class="env-hint">${raw(ICON.note)}${t("invite.envelope.musicHint")}</p>` : ""}
      ${langPill("")}
    </div>
  </section>`;

  const bar = html`<div class="inv-bar">
    ${langPill("#rsvp")}
    ${
      musicSrc
        ? html`<button
            class="pill-btn"
            type="button"
            data-music
            data-on="${t("invite.header.musicOn")}"
            data-off="${t("invite.header.musicOff")}"
            aria-label="${t("invite.header.musicOn")}"
            aria-pressed="false"
          >
            <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>${t("invite.header.musicLabel")}
          </button>`
        : ""
    }
  </div>`;

  const body = html` ${o.open ? "" : scene}
    <div class="page-bg"></div>
    <div class="side-decor l" aria-hidden="true" data-ambient>${raw(a.sideDecor)}</div>
    <div class="side-decor r" aria-hidden="true" data-ambient>${raw(a.sideDecor)}</div>
    ${o.preview ? "" : bar}
    <main class="invite">
      <div class="inv-col paper">
        <header class="hero">
          <div class="kicker">${kindLabel}</div>
          <div class="arch-wrap"><div class="arch" data-ambient>${raw(a.archCover)}</div></div>
          <h1 class="names serif">${names}</h1>
          <div class="divider"><i class="ln"></i>${raw(a.dividerOrn)}<i class="ln"></i></div>
        </header>
        <section class="sec reveal">
          <p class="greet">${t("invite.greeting", { familyName: fam.name })}</p>
          ${text ? html`<p class="body-text">${text}</p>` : ""}
          ${ruMissing ? html`<p class="noru">${t("invite.noRuText")}</p>` : ""}
        </section>
        <section class="sec reveal" aria-label="${t("invite.date.a11y")}">
          <div class="datebox">
            <div class="side">${parts.weekday}</div>
            <div class="mid">
              <div class="day">${parts.day}</div>
              <div class="mon">${parts.month}</div>
            </div>
            <div class="side">${parts.time ?? ""}</div>
          </div>
          <div class="count">${countdown}</div>
        </section>
        ${
          ev.venueName || ev.venueAddress
            ? html`<section class="sec reveal">
                <div class="card venue">
                  ${corners(a.corner, ["k1", "k2"])}${raw(ICON.pin)}
                  ${ev.venueName ? html`<h3>${ev.venueName}</h3>` : ""}
                  ${ev.venueAddress ? html`<p>${ev.venueAddress}</p>` : ""}
                  ${ev.mapUrl ? html`<a class="btn-i" href="${ev.mapUrl}" target="_blank" rel="noopener noreferrer" style="margin-top:20px">${raw(ICON.map)}${t("invite.venue.map")}</a>` : ""}
                </div>
              </section>`
            : ""
        }
        ${
          ev.hostsLine
            ? html`<section class="sec reveal hosts">
                <div class="lbl">${t("invite.hosts.label")}</div>
                <div class="nm">${ev.hostsLine}</div>
              </section>`
            : ""
        }
        <section class="sec reveal" id="rsvp">${rsvpBlock}</section>
        <footer class="foot">
          <div class="wm">${raw(a.wordmark)}</div>
          <div style="margin-top:6px">${t("invite.footer.madeWith")}</div>
        </footer>
      </div>
    </main>
    ${musicSrc ? html`<audio data-src="${musicSrc}" preload="none" loop></audio>` : ""}
    <noscript
      ><style>
        .scene {
          display: none;
        }
        .invite {
          opacity: 1;
        }
      </style></noscript
    >`;

  const title = t("og.invite.title", { familyName: fam.name });
  const desc = t("og.invite.description", { eventTitle: ev.title, date: `${parts.day} ${parts.month}` });
  const fontPreload = html`<link
    rel="preload"
    href="/fonts/cormorant-garamond-600-kk.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />`;
  const doc = html`<!doctype html>
    <html lang="${o.locale}" class="${htmlClass}" data-state="${state}" data-token="${page.token}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="${a.themeColor}" />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
        <title>${title}</title>
        ${
          o.preview
            ? ""
            : html`<meta property="og:title" content="${title}" />
                <meta property="og:description" content="${desc}" />
                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="${t("og.siteName")}" />
                <meta property="og:image" content="${o.appUrl.replace(/\/$/, "")}${base}/opengraph-image" />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                <meta property="og:image:alt" content="${t("og.invite.imageAlt", { eventTitle: ev.title })}" />
                <meta name="twitter:card" content="summary_large_image" />`
        }
        ${fontPreload}
        <style>
          ${raw(INVITE_CSS)}${raw(EXTRA_CSS)}
        </style>
      </head>
      <body class="inv ${a.bodyClass}">
        ${body}
        ${
          o.preview
            ? ""
            : html`<script nonce="${o.nonce}">
                ${raw(ISLAND_JS)};
              </script>`
        }
      </body>
    </html>`;
  return doc.toString();
}

/** 404 page (unknown token): no details (brief §2). */
export function renderNotFound(locale: Locale): string {
  const t = translator(locale);
  return html`<!doctype html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${t("invite.notFound.title")}</title>
        <style>
          body {
            font:
              400 1.125rem/1.6 system-ui,
              sans-serif;
            margin: 0;
            padding: 3rem 1.25rem;
            background: #f4ecdd;
            color: #2b2116;
            text-align: center;
          }
          h1 {
            font-size: 1.5rem;
          }
        </style>
      </head>
      <body>
        <h1>${t("invite.notFound.title")}</h1>
        <p>${t("invite.notFound.body")}</p>
      </body>
    </html>`.toString();
}
