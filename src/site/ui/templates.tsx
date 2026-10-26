/* eslint-disable @next/next/no-img-element -- static SVG from /public with width/height and loading="lazy" (SITE_DESIGN §6.2). */
import type { ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { type Inline, plain } from "../content/inline";
import { getPage, isPublished, type SitePage, type Template } from "../content/pages";
import type { Cta, Node } from "../content/parse";
import { jsonLd, type Crumb } from "../seo";
import { FAQ_URL, MENU, shortTitle } from "../nav";
import { CtaRow, Faq, Nodes, Tiles } from "./blocks";
import { Crumbs, Footer, Header } from "./chrome";
import { type Ctx, fillBrand, makeCtx } from "./ctx";
import { Ico, Orn, Sprite } from "./icons";
import { Inl } from "./Inline";
import { SiteIsland } from "./SiteIsland";

/* ------------------------------------------------------------------ frame */

function Frame({ ctx, sticky, children, ld }: { ctx: Ctx; sticky: boolean; children: ReactNode; ld?: object[] }) {
  const t = ctx.t;
  return (
    <>
      <Sprite />
      <a className="skip" href="#main">
        {t("site.skip")}
      </a>
      <Header ctx={ctx} />
      {children}
      <Footer ctx={ctx} sticky={sticky} />
      {ld?.length ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld.length === 1 ? ld[0] : ld).replace(/</g, "\\u003c") }}
        />
      ) : null}
      <SiteIsland
        texts={{
          copied: t("site.tilek.copied"),
          toastCopied: t("site.toast.copied"),
          toastFail: t("site.toast.fail"),
          shown: t.raw("site.filter.shown") as string,
        }}
      />
    </>
  );
}

const STICKY: Template[] = ["landing", "inviteHub", "invite", "feature"];
const TOC: Template[] = ["invite", "dastur", "feature"];

/* ------------------------------------------------------------------ crumbs */

const SECTION_KEY: Record<string, "invites" | "tilek" | "traditions"> = {
  shaqyru: "invites",
  priglashenie: "invites",
  tilekter: "tilek",
  dastur: "traditions",
  traditsii: "traditions",
};

function crumbsOf(page: SitePage, ctx: Ctx): Crumb[] | null {
  const depth = page.slug.length;
  if (depth === 0 || page.template === "soon") return null;
  if (depth === 1 && !["feature", "faq", "service"].includes(page.template)) return null;
  const items: Crumb[] = [{ label: ctx.t("site.home"), href: `/${page.locale}` }];
  if (depth >= 2) {
    const hub = `/${page.locale}/${page.slug[0]}`;
    const key = SECTION_KEY[page.slug[0]!];
    const label = key ? ctx.t(`site.nav.${key}.label`) : shortTitle(getPage(hub) ?? page);
    items.push({ label, href: isPublished(hub) ? hub : undefined });
  }
  return items;
}

function selfLabel(page: SitePage, ctx: Ctx): string {
  return fillBrand(shortTitle(page)) || ctx.t("site.home");
}

/* ------------------------------------------------------------------ public entry */

export function SitePageView({ page }: { page: SitePage }) {
  const ctx = makeCtx(page.locale, page);
  if (page.template === "soon") return <SoonPage ctx={ctx} />;
  const crumbs = crumbsOf(page, ctx);
  const self = selfLabel(page, ctx);
  const ld = jsonLd(page, crumbs, self);
  const sticky = STICKY.includes(page.template);
  return (
    <Frame ctx={ctx} sticky={sticky} ld={ld}>
      {page.template === "landing" ? (
        <Landing page={page} ctx={ctx} />
      ) : (
        <Article page={page} ctx={ctx} crumbs={crumbs} self={self} />
      )}
    </Frame>
  );
}

/* ------------------------------------------------------------------ banner */

type BannerKey = "default" | "sundet" | "kyzUzatu" | "uilenuToi" | "merey" | "besik" | "seating" | "tilek";
const TOI_BANNER: Record<string, BannerKey> = {
  sundet: "sundet",
  kyz_uzatu: "kyzUzatu",
  uilenu_toi: "uilenuToi",
  merey: "merey",
  besik: "besik",
  seating: "seating",
};

function Banner({ ctx, title, text, cta }: { ctx: Ctx; title: ReactNode; text: ReactNode; cta?: Cta }) {
  const href =
    cta?.href && (cta.href.startsWith("/e") || cta.href.startsWith("/login") || isPublished(cta.href))
      ? cta.href
      : ctx.ctaHref;
  return (
    <div className="wrap section">
      <section className="cta-banner" aria-labelledby="cta-h">
        <Orn name="shanyraq" cls="orn" />
        <h2 id="cta-h">{title}</h2>
        <p>{text}</p>
        <div className="btn-row">
          <a className="btn gold" href={href}>
            {cta?.text ?? ctx.t("site.cta")}
          </a>
        </div>
      </section>
    </div>
  );
}

function bannerKey(page: SitePage): BannerKey {
  if (page.toi && TOI_BANNER[page.toi]) return TOI_BANNER[page.toi]!;
  if (page.template === "tilek" || page.template === "tilekHub") return "tilek";
  return "default";
}

/* ------------------------------------------------------------------ article (T2–T10) */

function splitBody(page: SitePage) {
  let body = [...page.doc.body];
  let hero: Cta[] | undefined;
  let final: Cta | undefined;
  let bannerOwn: { title: Inline[]; text: Inline[] } | undefined;
  if (body[0]?.t === "ctas") {
    hero = body[0].items;
    body = body.slice(1);
  }
  // final CTA → banner (it may be followed by «related» and a trailing link line)
  for (let k = body.length - 1; k >= Math.max(0, body.length - 3); k--) {
    const n = body[k]!;
    if (n.t === "ctas") {
      final = n.items.find((c) => c.variant !== "secondary" && c.href) ?? n.items[0];
      body.splice(k, 1);
      break;
    }
  }
  // a closing question heading right before the final CTA becomes the banner (tilek hub «Өз тойыңызға…?»)
  const lastH = body.map((n) => n.t).lastIndexOf("h");
  const h = body[lastH];
  if (h?.t === "h" && h.level === 2 && /\?$/.test(h.text) && body.slice(lastH + 1).every((n) => n.t === "p")) {
    const ps = body.slice(lastH + 1) as Extract<Node, { t: "p" }>[];
    if (ps.length >= 1 && ps.length <= 2) {
      bannerOwn = { title: h.c, text: ps.flatMap((p, i) => (i ? [{ t: "text" as const, v: " " }, ...p.c] : p.c)) };
      body = body.slice(0, lastH);
    }
  }
  return { body, hero, final, bannerOwn };
}

function tocOf(body: Node[]): { id: string; text: string }[] {
  return body.flatMap((n) =>
    n.t === "h" && n.level === 2 ? [{ id: n.id, text: n.text }] : n.t === "sources" ? [] : [],
  );
}

function Article({ page, ctx, crumbs, self }: { page: SitePage; ctx: Ctx; crumbs: Crumb[] | null; self: string }) {
  const t = ctx.t;
  const { body, hero, final, bannerOwn } = splitBody(page);
  const isTilek = page.template === "tilek" || (page.template === "tilekHub" && page.locale === "kk");
  const hub = ["tilekHub", "dasturHub", "inviteHub"].includes(page.template);
  const withToc = TOC.includes(page.template);
  const toc = withToc ? tocOf(body) : [];
  const bk = bannerKey(page);

  // related cards: where the content asks for them, otherwise before the sources (T3, T4, T6, T8, T9)
  let nodes = body;
  if (
    !nodes.some((n) => n.t === "related") &&
    ["tilek", "dastur", "invite", "demo", "feature"].includes(page.template)
  ) {
    const si = nodes.findIndex((n) => n.t === "sources");
    const rel: Node = { t: "related" };
    nodes = si >= 0 ? [...nodes.slice(0, si), rel, ...nodes.slice(si)] : [...nodes, rel];
  }

  const tileks = nodes.find((n) => n.t === "tileks") as Extract<Node, { t: "tileks" }> | undefined;
  const faqPage = page.template === "faq";
  const fm = page.doc.fm;
  const showMeta = page.template === "dastur" && fm.updated && fm.reviewedBy && !/\{/.test(fm.reviewedBy);

  return (
    <main id="main">
      {crumbs ? <Crumbs items={crumbs} self={self} ctx={ctx} /> : null}
      <div className="wrap">
        <header className="page-head">
          <h1 className={hub ? "t-hero" : "t-h1"}>{fillBrand(page.doc.h1 || page.h1)}</h1>
          {page.doc.intro.map((c, i) => (
            <p key={i} className={i === 0 ? "lead" : undefined}>
              <Inl c={c} ctx={ctx} />
            </p>
          ))}
          {showMeta ? (
            <div className="page-meta">
              <span>
                <Ico name="clock" />
                {t("site.meta.updated")}: {fm.updated}
              </span>
              <span>
                <Ico name="shield" />
                {t("site.meta.reviewed")}: {fm.reviewedBy}
              </span>
            </div>
          ) : null}
          {hero ? (
            <div style={{ marginTop: "1.25rem" }}>
              <CtaRow items={hero} ctx={ctx} hero />
            </div>
          ) : null}
        </header>
        <div className={`article-layout${isTilek ? " is-tilek" : ""}`}>
          {isTilek && tileks ? (
            <aside className="article-aside tilek-aside" aria-label={t("site.filter.sections")}>
              <div className="sticky">
                <TilekFilter node={tileks} ctx={ctx} />
              </div>
            </aside>
          ) : withToc && toc.length ? (
            <aside className="article-aside" aria-label={t("site.toc")}>
              <div className="sticky">
                <nav className="toc" aria-label={t("site.toc")}>
                  <p className="toc-title">{t("site.toc")}</p>
                  <ol>
                    {toc.map((x) => (
                      <li key={x.id}>
                        <a href={`#${x.id}`}>{fillBrand(x.text)}</a>
                      </li>
                    ))}
                  </ol>
                </nav>
                <div className="voice practice" style={{ background: "var(--paper)", borderColor: "var(--line)" }}>
                  <p className="voice-label" style={{ color: "var(--ink)" }}>
                    <Ico name="send" />
                    {t(`site.banner.${bk}.title`)}
                  </p>
                  <p className="small">{t(`site.banner.${bk}.text`)}</p>
                  <p style={{ marginTop: ".75rem" }}>
                    <a className="btn primary block" href={ctx.ctaHref}>
                      {t("site.cta")}
                    </a>
                  </p>
                </div>
              </div>
            </aside>
          ) : null}
          <div className="article-main">
            {withToc && toc.length ? (
              <details className="toc" data-m>
                <summary>
                  {t("site.toc")}
                  <Ico name="down" />
                </summary>
                <ol>
                  {toc.map((x) => (
                    <li key={x.id}>
                      <a href={`#${x.id}`}>{fillBrand(x.text)}</a>
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
            <div className="prose">
              {faqPage ? (
                nodes.map((n, i) =>
                  n.t === "faq" ? (
                    <Faq key={i} groups={n.groups} ctx={ctx} nav />
                  ) : (
                    <Nodes key={i} nodes={[n]} ctx={ctx} />
                  ),
                )
              ) : (
                <Nodes nodes={nodes} ctx={ctx} />
              )}
            </div>
          </div>
        </div>
      </div>
      {bannerOwn ? (
        <Banner
          ctx={ctx}
          title={<Inl c={bannerOwn.title} ctx={ctx} />}
          text={<Inl c={bannerOwn.text} ctx={ctx} />}
          cta={final}
        />
      ) : (
        <Banner ctx={ctx} title={t(`site.banner.${bk}.title`)} text={t(`site.banner.${bk}.text`)} cta={final} />
      )}
    </main>
  );
}

function TilekFilter({ node, ctx }: { node: Extract<Node, { t: "tileks" }>; ctx: Ctx }) {
  const t = ctx.t;
  const groups = node.groups.filter((g) => g.id);
  const total = node.groups.reduce((a, g) => a + g.items.filter((x) => x.t === "tilek").length, 0);
  const whoGroups = groups.filter((g) => !g.format);
  const chips: { k: string; label: string }[] = node.hub
    ? [
        { k: "poem", label: t("site.filter.poem") },
        { k: "bata", label: t("site.filter.bata") },
      ]
    : whoGroups.map((g) => ({ k: g.id, label: g.label }));
  const lens = [
    { k: "qysqa", label: t("site.filter.lenQysqa") },
    { k: "ortasha", label: t("site.filter.lenOrtasha") },
    { k: "uzaq", label: t("site.filter.lenUzaq") },
  ];
  return (
    <details className="filter" data-filter-wrap>
      <summary>
        <Ico name="filter" cls="ico sm" />
        {t("site.filter.title")}
        <span className="count" data-filter-sum>
          {t("site.filter.total", { count: total })}
        </span>
        <Ico name="down" cls="ico chev" />
      </summary>
      <div className="filter-body" data-filter>
        {chips.length > 1 ? (
          <fieldset className="filter-group">
            <legend>{node.hub ? t("site.filter.type") : t("site.filter.who")}</legend>
            <div className="chips">
              <button className="chip" type="button" data-f="who:all" aria-pressed="true">
                {t("site.filter.all")}
              </button>
              {chips.map((c) => (
                <button key={c.k} className="chip" type="button" data-f={`who:${c.k}`} aria-pressed="false">
                  {c.label}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}
        <fieldset className="filter-group">
          <legend>{t("site.tilek.lengthLabel")}</legend>
          <div className="chips">
            <button className="chip" type="button" data-f="len:all" aria-pressed="true">
              {t("site.filter.all")}
            </button>
            {lens.map((c) => (
              <button key={c.k} className="chip" type="button" data-f={`len:${c.k}`} aria-pressed="false">
                {c.label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="filter-status">
          <span data-filter-count role="status" aria-live="polite" />
          <button type="button" data-reset>
            {t("site.filter.reset")}
          </button>
        </div>
        {groups.length ? (
          <div className="filter-group">
            <p>{t("site.filter.sections")}</p>
            <nav className="group-nav" aria-label={t("site.filter.sections")}>
              {groups.map((g) => (
                <a key={g.id} href={`#${g.id}`}>
                  {g.label}
                </a>
              ))}
            </nav>
          </div>
        ) : null}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ landing (T1) */

type SectionKind = {
  kind: "how" | "demo" | "feature" | "plain";
  paper?: boolean;
  rev?: boolean;
  art?: string;
  width?: string;
};

/** Section layout of the home pages by H2 prefix (= gen_site.py PAGES config). */
const LANDING: Record<Locale, [string, SectionKind][]> = {
  kk: [
    ["Тойға шақыру қалай", { kind: "how", paper: true }],
    ["Қонақ не көреді", { kind: "demo" }],
    ["Тізімді ата-анаңызбен", { kind: "feature", art: "lists", paper: true }],
    ["Кім келеді", { kind: "feature", art: "replies", rev: true }],
    ["Отырғызу", { kind: "feature", art: "hall", paper: true }],
    ["Той күні", { kind: "feature", art: "door", rev: true }],
    ["Шақыру үлгілері", { kind: "demo", paper: true }],
    ["Қай тойға", { kind: "demo" }],
    ["Сұрақтар", { kind: "plain", width: "48rem", paper: true }],
  ],
  ru: [
    ["Как это работает", { kind: "how", paper: true }],
    ["Онлайн-приглашение", { kind: "demo" }],
    ["Список гостей", { kind: "feature", art: "lists", paper: true }],
    ["Кто придёт", { kind: "feature", art: "replies", rev: true }],
    ["Рассадка", { kind: "feature", art: "hall", paper: true }],
    ["Помощник", { kind: "feature", art: "door", rev: true }],
    ["Шаблоны", { kind: "demo", paper: true }],
    ["Для какого", { kind: "demo" }],
    ["Вопросы", { kind: "plain", width: "48rem", paper: true }],
  ],
};

function Art({ name, ctx }: { name?: string; ctx: Ctx }) {
  const t = ctx.t;
  if (name === "lists")
    return (
      <>
        {(
          [
            ["listFather", "family1", 4],
            ["listMother", "family2", 3],
            ["listYoung", "listClassmates", 6],
          ] as const
        ).map(([a, b, n]) => (
          <div className="ui-row" key={a}>
            <span>
              <span className="ui-pill who">{t(`site.art.${a}`)}</span> <b>{t(`site.art.${b}`)}</b>
            </span>
            <span className="muted">{t("site.art.people", { count: n })}</span>
          </div>
        ))}
        <div className="ui-total">{t("site.art.listTotal")}</div>
      </>
    );
  if (name === "replies")
    return (
      <>
        <div className="ui-row">
          <b>{t("site.art.family1")}</b>
          <span className="ui-pill yes">{t("site.art.yes", { count: 4 })}</span>
        </div>
        <div className="ui-row">
          <b>{t("site.art.family2")}</b>
          <span className="ui-pill wait">{t("site.art.noAnswer")}</span>
        </div>
        <div className="ui-row">
          <b>{t("site.art.family3")}</b>
          <span className="ui-pill yes">{t("site.art.yes", { count: 2 })}</span>
        </div>
        <div className="ui-total">
          <span>{t("site.art.restaurant")}</span>
          <span>{t("site.art.restaurantTotal")}</span>
        </div>
      </>
    );
  if (name === "hall")
    return (
      <img
        src={ctx.locale === "kk" ? "/site/otyrgyzu-sxemasy.svg" : "/site/rassadka-gostei-shema.svg"}
        width={640}
        height={520}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  if (name === "door")
    return (
      <>
        <div
          className="ui-row"
          style={{ background: "var(--paper)", border: "1.5px solid var(--line-strong)", minHeight: "3.5rem" }}
        >
          <Ico name="offline" cls="ico sm" />
          <span style={{ flex: 1 }}>Ер|</span>
        </div>
        <div className="ui-row" style={{ marginTop: ".75rem" }}>
          <span>
            <b>{t("site.art.family1")}</b>
            <br />
            <span className="muted">{t("site.art.door")}</span>
          </span>
          <span className="ui-pill yes">
            <Ico name="check" cls="ico sm" /> {t("site.art.arrived")}
          </span>
        </div>
      </>
    );
  return null;
}

function HeroArt({ ctx }: { ctx: Ctx }) {
  const t = ctx.t;
  return (
    <div style={{ display: "grid", gap: ".875rem", maxWidth: "22rem", marginLeft: "auto" }}>
      <div
        className="f-art"
        style={{
          padding: "1rem",
          borderRadius: "1.25rem 1.25rem 1.25rem .25rem",
          background: "#E7F6EC",
          borderColor: "#CBE8D4",
        }}
      >
        <p
          style={{
            margin: 0,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: ".5rem",
            color: "var(--success-ink)",
          }}
        >
          <Ico name="wa" cls="ico sm fill" />
          WhatsApp
        </p>
        <p style={{ margin: ".375rem 0 0" }}>{t("site.art.invite")}</p>
        <p style={{ margin: ".25rem 0 0", color: "var(--lapis)", textDecoration: "underline" }}>https://…/i/••••</p>
      </div>
      <div
        className="f-art"
        style={{
          padding: "1rem",
          display: "flex",
          flexWrap: "wrap",
          gap: ".5rem",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <b>{t("site.art.family1")}</b>
        <span className="ui-pill yes">{t("site.art.answer")}</span>
      </div>
      <div
        className="f-art"
        style={{
          padding: "1.25rem",
          textAlign: "center",
          background: "var(--night)",
          color: "var(--on-night)",
          borderColor: "var(--night)",
        }}
      >
        <p style={{ margin: 0, color: "var(--on-night-2)" }}>{t("site.art.table")}</p>
        <p style={{ margin: ".25rem 0 0", font: "600 4rem/1 var(--font-display)", color: "var(--gold-bright)" }}>7</p>
      </div>
    </div>
  );
}

function HowList({ list, ctx }: { list: Extract<Node, { t: "ol" }>; ctx: Ctx }) {
  return (
    <ol className="how">
      {list.items.map((it, i) => {
        const anchor = it.find((n) => n.t === "anchor") as { id: string } | undefined;
        const si = it.findIndex((n) => n.t === "strong");
        const title = si >= 0 ? plain((it[si] as { c: Inline[] }).c).replace(/\.$/, "") : "";
        const rest = si >= 0 ? it.slice(si + 1) : it.filter((n) => n.t !== "anchor");
        return (
          <li key={i} id={anchor?.id}>
            <div className="h-top">
              <h3>{title}</h3>
            </div>
            <p>
              <Inl c={trimStart(rest)} ctx={ctx} />
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function trimStart(c: Inline[]): Inline[] {
  const [f, ...r] = c;
  return f?.t === "text" ? [{ t: "text", v: f.v.replace(/^\s+/, "") }, ...r] : c;
}

function Landing({ page, ctx }: { page: SitePage; ctx: Ctx }) {
  const t = ctx.t;
  const { body, hero, final } = splitBody(page);
  const secs: { h: Extract<Node, { t: "h" }>; body: Node[] }[] = [];
  for (const n of body) {
    if (n.t === "h" && n.level === 2) secs.push({ h: n, body: [] });
    else secs[secs.length - 1]?.body.push(n);
  }
  const conf = LANDING[page.locale];
  return (
    <main id="main">
      <section className="hero" aria-labelledby="h1">
        <Orn name="shanyraq" cls="orn-bg" />
        <div className="wrap hero-grid">
          <div>
            <h1 id="h1" className="t-hero">
              {fillBrand(page.doc.h1)}
            </h1>
            {page.doc.intro[0] ? (
              <p className="lead">
                <Inl c={page.doc.intro[0]} ctx={ctx} />
              </p>
            ) : null}
            {hero ? <CtaRow items={hero} ctx={ctx} hero /> : null}
            <ul className="trust">
              {(["whatsapp", "noInstall", "offline"] as const).map((k) => (
                <li key={k}>
                  <Ico name="check" />
                  {t(`site.trust.${k}`)}
                </li>
              ))}
            </ul>
          </div>
          <div className="hero-art" aria-hidden="true">
            <HeroArt ctx={ctx} />
          </div>
        </div>
      </section>
      {secs.map(({ h, body: sb }, i) => {
        const c = conf.find(([k]) => h.text.startsWith(k))?.[1] ?? { kind: "plain" as const };
        const bg = c.paper ? " bg-paper" : "";
        const title = (
          <h2 id={h.id}>
            <Inl c={h.c} ctx={ctx} />
          </h2>
        );
        if (c.kind === "how") {
          const oi = sb.findIndex((n) => n.t === "ol");
          const before = oi >= 0 ? sb.slice(0, oi) : sb;
          const after = oi >= 0 ? sb.slice(oi + 1) : [];
          return (
            <section key={i} className={`section${bg}`} aria-labelledby={h.id}>
              <div className="wrap">
                <div className="section-head">
                  {title}
                  <Nodes nodes={before} ctx={ctx} />
                </div>
                {oi >= 0 ? <HowList list={sb[oi] as Extract<Node, { t: "ol" }>} ctx={ctx} /> : null}
                {after.length ? (
                  <div className="prose" style={{ maxWidth: "var(--measure)", marginTop: "1.5rem" }}>
                    <Nodes nodes={after} ctx={ctx} />
                  </div>
                ) : null}
              </div>
            </section>
          );
        }
        if (c.kind === "feature")
          return (
            <section key={i} className={`section${bg}`} aria-labelledby={h.id}>
              <div className="wrap">
                <div className={`feature${c.rev ? " rev" : ""}`}>
                  <div className="f-text prose">
                    {title}
                    <Nodes nodes={sb} ctx={ctx} />
                  </div>
                  <div className="f-art" aria-hidden="true">
                    <Art name={c.art} ctx={ctx} />
                  </div>
                </div>
              </div>
            </section>
          );
        if (c.kind === "demo")
          return (
            <section key={i} className={`section${bg}`} aria-labelledby={h.id}>
              <div className="wrap">
                <div className="section-head prose">{title}</div>
                <div className="prose" style={{ maxWidth: "none" }}>
                  <Nodes nodes={sb} ctx={ctx} />
                </div>
              </div>
            </section>
          );
        return (
          <section key={i} className={`section${bg}`} aria-labelledby={h.id}>
            <div className="wrap">
              <div className="prose" style={{ maxWidth: c.width ?? "var(--measure)" }}>
                {title}
                <Nodes nodes={sb} ctx={ctx} />
              </div>
            </div>
          </section>
        );
      })}
      <Banner ctx={ctx} title={t("site.banner.default.title")} text={t("site.banner.default.text")} cta={final} />
    </main>
  );
}

/* ------------------------------------------------------------------ soon (T10 prices) and 404 */

function SoonPage({ ctx }: { ctx: Ctx }) {
  const t = ctx.t;
  const demo = ctx.locale === "kk" ? "/kk/shaqyru/ulgi/ak-shanyraq" : "/ru/priglashenie/shablon/ak-shanyrak";
  const faq = FAQ_URL[ctx.locale];
  return (
    <Frame ctx={ctx} sticky={false}>
      <main id="main" className="soon-page">
        <div className="wrap">
          <header className="page-head">
            <h1 className="t-h1">{t("site.soonPage.title")}</h1>
          </header>
          <div className="soon" style={{ maxWidth: "var(--measure)" }}>
            <Ico name="clock" />
            <p>{t("site.soonPage.text")}</p>
          </div>
          <div className="btn-row stack">
            {isPublished(demo) ? (
              <a className="btn primary" href={demo}>
                {t("site.demo.open")}
              </a>
            ) : null}
            {isPublished(faq) ? (
              <a className="btn secondary" href={faq}>
                {t("site.nav.faq.label")}
              </a>
            ) : null}
          </div>
        </div>
      </main>
    </Frame>
  );
}

/**
 * SEO-16 404: static (prerendered at build — no runtime content reads), Kazakh first with the Russian text below,
 * because one global page serves every unmatched URL.
 */
export function NotFoundView() {
  const ctx = makeCtx("kk");
  const block = (locale: Locale) => {
    const c = makeCtx(locale);
    const hubs = [
      { label: c.t("site.home"), href: `/${locale}` },
      ...MENU[locale]
        .filter((m) => !m.soon && isPublished(m.href))
        .map((m) => ({ label: c.t(`site.nav.${m.key}.label`), href: m.href })),
    ];
    const H = locale === "kk" ? "h1" : "h2";
    return (
      <section lang={locale} className="page-head" aria-labelledby={`nf-${locale}`}>
        <H id={`nf-${locale}`} className="t-h1">
          {c.t("site.notFound.title")}
        </H>
        <p className="lead">{c.t("site.notFound.text")}</p>
        <div style={{ maxWidth: "var(--measure)" }}>
          <Tiles items={hubs} five={false} ctx={c} />
        </div>
      </section>
    );
  };
  return (
    <Frame ctx={ctx} sticky={false}>
      <main id="main" className="notfound">
        <div className="wrap">
          {block("kk")}
          {block("ru")}
        </div>
      </main>
    </Frame>
  );
}
