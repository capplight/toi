import type { Locale } from "@/i18n/config";
import { getPage, isPublished, type SitePage } from "../content/pages";
import { FAQ_URL, FOOTER, langTarget, MENU, MENU_TOI, type NavKey } from "../nav";
import type { Ctx } from "./ctx";
import { Ico, Orn } from "./icons";

/** Header, mobile menu, language switch, crumbs, footer (SITE_DESIGN §3). */

function navKeyOf(page?: SitePage): NavKey | undefined {
  if (!page) return undefined;
  const p = page.slug.join("/");
  if (/^(shaqyru|priglashenie)/.test(p)) return "invites";
  if (/^(tilekter|pozdravleniya)/.test(p)) return "tilek";
  if (/^(dastur|traditsii)/.test(p)) return "traditions";
  if (/^(otyrgyzu-jospary|rassadka-gostei)$/.test(p)) return "seating";
  if (/^(baga|tseny)$/.test(p)) return "prices";
  return undefined;
}

function LangSwitch({ ctx, full = false }: { ctx: Ctx; full?: boolean }) {
  const t = ctx.t;
  const item = (l: Locale) => {
    const label = full ? t(l === "kk" ? "common.lang.kkFull" : "common.lang.ruFull") : t(`common.lang.${l}`);
    if (l === ctx.locale)
      return (
        <span aria-current="true" lang={l}>
          {label}
        </span>
      );
    return (
      <a
        href={langTarget(ctx.page, l)}
        hrefLang={l}
        lang={l}
        data-lang={l}
        aria-label={full ? undefined : t(l === "kk" ? "common.lang.kkFull" : "common.lang.ruFull")}
      >
        {label}
      </a>
    );
  };
  return (
    <nav className="lang" aria-label={t("common.lang.label")}>
      {item("kk")}
      {item("ru")}
    </nav>
  );
}

export function Header({ ctx }: { ctx: Ctx }) {
  const t = ctx.t;
  const cur = navKeyOf(ctx.page);
  const menu = MENU[ctx.locale].filter((m) => m.soon || isPublished(m.href));
  const sub = MENU_TOI[ctx.locale].filter(isPublished);
  const faq = FAQ_URL[ctx.locale];
  const items = menu.map((m) => (
    <li key={m.key}>
      <a href={m.href} aria-current={m.key === cur ? "page" : undefined}>
        <b>{t(`site.nav.${m.key}.label`)}</b>
        {m.soon ? (
          <small>
            <span className="soon-badge">{t("site.soon")}</span>
          </small>
        ) : (
          <small>{t(`site.nav.${m.key as Exclude<NavKey, "prices">}.desc`)}</small>
        )}
        <Ico name="right" />
      </a>
    </li>
  ));
  return (
    <header className="site-header">
      <div className="wrap">
        <a className="brand" href={`/${ctx.locale}`} aria-label={t("site.brandHome", { brand: ctx.brand })}>
          <Orn name="shanyraq" />
          <span className="brand-name">{ctx.brand}</span>
        </a>
        <nav className="nav" aria-label={t("site.menu")}>
          {menu.map((m) => (
            <a key={m.key} href={m.href} aria-current={m.key === cur ? "page" : undefined}>
              {t(`site.nav.${m.key}.label`)}
            </a>
          ))}
        </nav>
        <LangSwitch ctx={ctx} />
        <a className="btn primary header-cta" href={ctx.ctaHref}>
          {t("site.cta")}
        </a>
        <details className="menu" data-menu>
          <summary aria-label={t("site.menu")}>
            <Ico name="menu" cls="ico i-open" />
            <Ico name="x" cls="ico i-close" />
            <span>{t("site.menu")}</span>
          </summary>
          <div className="menu-panel">
            <ul className="menu-list">{items.slice(0, 1)}</ul>
            {sub.length && menu[0]?.key === "invites" ? (
              <div className="menu-sub">
                {sub.map((u) => (
                  <a key={u} className="chip" href={u}>
                    {chipLabel(u, ctx)}
                  </a>
                ))}
              </div>
            ) : null}
            <ul className="menu-list">
              {items.slice(1)}
              {isPublished(faq) ? (
                <li>
                  <a href={faq}>
                    <b>{t("site.nav.faq.label")}</b>
                    <small>{t("site.nav.faq.desc")}</small>
                    <Ico name="right" />
                  </a>
                </li>
              ) : null}
            </ul>
            <div className="menu-foot">
              <div className="menu-lang">
                <span>{t("common.lang.label")}</span>
                <LangSwitch ctx={ctx} />
              </div>
              <a className="btn primary block" href={ctx.ctaHref}>
                {t("site.cta")}
              </a>
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

/** Toi chip labels = the toi words of the invite pages' H1 (kk: «Қыз ұзату», ru: «Қыз ұзату», «Юбилей»). */
function chipLabel(url: string, ctx: Ctx): string {
  void ctx;
  const p = getPage(url)!;
  const h = p.h1
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/^Приглашение на\s+/i, "")
    .replace(/\s*(тойына|тойға|ға|ге)?\s*шақыру$/i, "")
    .trim();
  return h.charAt(0).toUpperCase() + h.slice(1);
}

export type Crumb = { label: string; href?: string };

export function Crumbs({ items, self, ctx }: { items: Crumb[]; self: string; ctx: Ctx }) {
  return (
    <nav className="crumbs wrap" aria-label={ctx.t("site.crumbs")}>
      <ol>
        {items.map((c, i) => (
          <li key={i}>{c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}</li>
        ))}
        <li>
          <span aria-current="page">{self}</span>
        </li>
      </ol>
    </nav>
  );
}

export function Footer({ ctx, sticky }: { ctx: Ctx; sticky: boolean }) {
  const t = ctx.t;
  const cols = FOOTER[ctx.locale];
  const col = (title: string, links: { key: string; href: string }[]) => {
    const shown = links.filter((l) => isPublished(l.href));
    if (!shown.length) return null;
    return (
      <div className="foot-col">
        <h2>{title}</h2>
        <ul>
          {shown.map((l) => (
            <li key={l.href}>
              <a href={l.href}>{t(`site.nav.${l.key as "faq"}.label`)}</a>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <>
      <footer className="site-footer">
        <div className="wrap">
          <div className="foot-grid">
            <div>
              <a className="foot-brand" href={`/${ctx.locale}`}>
                <Orn name="shanyraq" />
                {ctx.brand}
              </a>
              <p className="foot-about">{t("site.footer.about", { brand: ctx.brand })}</p>
            </div>
            {col(t("site.footer.sections"), cols.sections)}
            {col(t("site.footer.useful"), cols.useful)}
            <div className="foot-col">
              <h2>{t("site.footer.docs")}</h2>
              <ul>
                <li>
                  <a href="/privacy">{t("site.footer.privacy")}</a>
                </li>
                <li>
                  <a href="/terms">{t("site.footer.terms")}</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="foot-bottom">
            <span>{t("site.footer.copyright", { year: "2026", brand: ctx.brand })}</span>
            <LangSwitch ctx={ctx} full />
          </div>
        </div>
      </footer>
      {sticky ? (
        <div className="sticky-cta is-hidden" data-sticky>
          <a className="btn primary" href={ctx.ctaHref} tabIndex={-1}>
            {t("site.cta")}
          </a>
        </div>
      ) : null}
      <div className="toast" id="toast" role="status" aria-live="polite" hidden>
        <Ico name="check" />
        <span className="msg" />
      </div>
    </>
  );
}
