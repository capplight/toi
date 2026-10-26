/* eslint-disable @next/next/no-img-element -- static SVG/PNG from /public with width/height and loading="lazy"; next/image would not optimise SVG (SITE_DESIGN §6.2). */
import { Fragment, type ReactNode } from "react";
import type { Inline } from "../content/inline";
import { plain } from "../content/inline";
import { absolute, getPage, isPublished, linkTarget } from "../content/pages";
import type { Cta, InviteCard, Node, TilekCard, TilekGroup } from "../content/parse";
import { kindOf, related, shortTitle } from "../nav";
import type { Ctx } from "./ctx";
import { phText } from "./ctx";
import { Ico, Orn, type IconName } from "./icons";
import { Inl } from "./Inline";

/** Node tree → React (SITE_DESIGN §4). */
export function Nodes({ nodes, ctx }: { nodes: Node[]; ctx: Ctx }) {
  return nodes.map((n, i) => <Fragment key={i}>{block(n, ctx)}</Fragment>);
}

function block(n: Node, ctx: Ctx): ReactNode {
  switch (n.t) {
    case "h": {
      const H = `h${n.level}` as "h2" | "h3" | "h4";
      return (
        <H id={n.id}>
          <Inl c={n.c} ctx={ctx} />
        </H>
      );
    }
    case "p":
      return <Para n={n} ctx={ctx} />;
    case "ul":
      return (
        <ul>
          {n.items.map((it, i) => (
            <li key={i}>
              <Inl c={it} ctx={ctx} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="steps" start={n.start === 1 ? undefined : n.start}>
          {n.items.map((it, i) => (
            <li key={i}>
              <Inl c={it} ctx={ctx} />
            </li>
          ))}
        </ol>
      );
    case "table":
      return <Table head={n.head} rows={n.rows} ctx={ctx} />;
    case "quote":
      return (
        <blockquote>
          <Nodes nodes={n.c} ctx={ctx} />
        </blockquote>
      );
    case "tip":
      return <Tip nodes={n.c} ctx={ctx} />;
    case "faq":
      return <Faq groups={n.groups} ctx={ctx} nav={false} />;
    case "tileks":
      return <TilekGroups groups={n.groups} hub={n.hub} ctx={ctx} />;
    case "cards":
      return (
        <div className="cards">
          {n.cards.map((c) =>
            c.t === "tilek" ? (
              <TilekCardView key={c.no} c={c} ctx={ctx} />
            ) : (
              <InviteCardView key={c.no} c={c} ctx={ctx} />
            ),
          )}
        </div>
      );
    case "invites":
      return <Invites items={n.items} ctx={ctx} />;
    case "demo":
      return ctx.page?.template === "demo" ? <DemoLive tpl={n.tpl} ctx={ctx} /> : <Demo tpl={n.tpl} ctx={ctx} />;
    case "templates":
      return <TemplateCards ctx={ctx} />;
    case "tiles":
    case "links":
      return <Tiles items={n.items} five={n.t === "tiles" && n.five} ctx={ctx} />;
    case "ctas":
      return <CtaRow items={n.items} ctx={ctx} />;
    case "caption":
      return <p className="caption">{n.text}</p>;
    case "related":
      return <Related ctx={ctx} toi={n.toi} />;
    case "print":
      return (
        <p>
          <button className="btn secondary" type="button" data-print>
            <Ico name="printer" />
            {n.text ?? ctx.t("site.print")}
          </button>
        </p>
      );
    case "hall":
      return (
        <figure className="figure">
          <img
            src={ctx.locale === "kk" ? "/site/otyrgyzu-sxemasy.svg" : "/site/rassadka-gostei-shema.svg"}
            width={640}
            height={520}
            alt={n.alt}
            loading="lazy"
            decoding="async"
          />
          <figcaption>{ctx.t("site.hall.caption")}</figcaption>
        </figure>
      );
    case "calc":
      return <Calc ctx={ctx} />;
    case "screenshot":
      return (
        <figure className="figure" style={{ maxWidth: "22rem" }}>
          <img
            src="/site/zal-ekrany.png"
            width={360}
            height={740}
            alt={ctx.t("site.screenshot.alt", { brand: ctx.brand })}
            loading="lazy"
            decoding="async"
          />
          <figcaption>{ctx.t("site.screenshot.caption")}</figcaption>
        </figure>
      );
    case "sources":
      return <Sources title={n.title} items={n.items} ctx={ctx} />;
  }
}

function Para({ n, ctx }: { n: Extract<Node, { t: "p" }>; ctx: Ctx }) {
  if (n.kind === "reviewed")
    return (
      <p className="reviewed">
        <Ico name="shield" />
        <span>
          <Inl c={n.c} ctx={ctx} />
        </span>
      </p>
    );
  if (n.kind === "caption")
    return (
      <p className="caption">
        <Inl c={n.c} ctx={ctx} />
      </p>
    );
  if (n.folk)
    return (
      <aside className="voice folk" aria-label={ctx.t("site.folk.label")}>
        <Orn name="koshkar" cls="orn" />
        <p className="voice-label">{ctx.t("site.folk.label")}</p>
        <p className="q">
          <Inl c={n.c} ctx={ctx} />
        </p>
      </aside>
    );
  return (
    <p>
      <Inl c={n.c} ctx={ctx} />
    </p>
  );
}

function Table({ head, rows, ctx }: { head: Inline[][]; rows: Inline[][][]; ctx: Ctx }) {
  const isNum = (c: Inline[]) => /^[\d ]+$/.test(plain(c));
  const label = plain(head.find((h) => plain(h).trim()) ?? [], phText) || ctx.t("site.toc");
  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={label}>
      <table>
        <thead>
          <tr>
            {head.map((c, i) => (
              <th key={i} scope="col" className={rows[0]?.[i] && isNum(rows[0][i]!) ? "num" : undefined}>
                <Inl c={c} ctx={ctx} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={isNum(c) ? "num" : undefined}>
                  <Inl c={c} ctx={ctx} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Tip({ nodes, ctx }: { nodes: Node[]; ctx: Ctx }) {
  const label = ctx.t("site.tip.label");
  // lists inside a tip are plain lists, not step lists
  const inner = nodes.map((n) => (n.t === "ol" ? { ...n, plainList: true } : n));
  return (
    <aside className="voice tip" aria-label={label}>
      <p className="voice-label">
        <Ico name="bulb" />
        {label}
        <span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
          · {ctx.t("site.tip.sub")}
        </span>
      </p>
      {inner.map((n, i) =>
        n.t === "ol" ? (
          <ol key={i}>
            {n.items.map((it, k) => (
              <li key={k}>
                <Inl c={it} ctx={ctx} />
              </li>
            ))}
          </ol>
        ) : (
          <Fragment key={i}>{block(n, ctx)}</Fragment>
        ),
      )}
    </aside>
  );
}

/* ------------------------------------------------------------------ FAQ */

export function Faq({ groups, ctx, nav }: { groups: Extract<Node, { t: "faq" }>["groups"]; ctx: Ctx; nav: boolean }) {
  const titled = groups.filter((g) => g.title && g.id);
  return (
    <>
      {nav && titled.length > 1 ? (
        <nav className="group-nav" aria-label={ctx.t("site.filter.sections")} style={{ marginBottom: "1rem" }}>
          {titled.map((g) => (
            <a key={g.id} href={`#${g.id}`}>
              <Inl c={g.title!} ctx={ctx} />
            </a>
          ))}
        </nav>
      ) : null}
      {groups.map((g, gi) => (
        <Fragment key={gi}>
          {g.title ? (
            <h2 id={g.id}>
              <Inl c={g.title} ctx={ctx} />
            </h2>
          ) : null}
          <div className="faq">
            {g.items.map((it, i) => (
              <details key={i}>
                <summary>
                  <h3>
                    <Inl c={it.q} ctx={ctx} />
                  </h3>
                  <span className="tg">
                    <Ico name="down" cls="ico sm" />
                  </span>
                </summary>
                <div className="ans">
                  <Nodes nodes={it.a} ctx={ctx} />
                </div>
              </details>
            ))}
          </div>
        </Fragment>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ тілек */

function waHref(ctx: Ctx, anchor: string): string {
  const url = absolute(`${ctx.page?.url ?? `/${ctx.locale}`}?utm_source=tilek_share#${anchor}`);
  return `https://wa.me/?text=${encodeURIComponent(url)}`;
}

export function TilekCardView({ c, ctx, hub = false }: { c: TilekCard; ctx: Ctx; hub?: boolean }) {
  const t = ctx.t;
  const types = [c.poem ? "poem" : "", c.bata || c.folk ? "bata" : ""].filter(Boolean).join(" ");
  const who = hub ? types || "prose" : c.who;
  const id = `t${c.no}`;
  return (
    <article
      className="tcard"
      id={id}
      data-who={who}
      data-len={c.len}
      aria-label={t("site.tilek.number", { no: c.no })}
    >
      <div className="tcard-top">
        <span className="tcard-no">{t("site.tilek.number", { no: c.no })}</span>
        {c.len !== "folk" ? (
          <span className="tag len" data-len={c.len}>
            <span className="sr-only">{t("site.tilek.lengthLabel")}: </span>
            {t(`site.tilek.len.${c.len}`)}
          </span>
        ) : null}
        {c.folk ? (
          <span className="tag folk">
            <Ico name="quote" />
            {c.folkBata ? t("site.folk.bata") : t("site.folk.tag")}
          </span>
        ) : null}
        {c.poem ? <span className="tag poem">{t("site.tilek.poem")}</span> : null}
        {c.bata && !c.folk ? <span className="tag bata">{t("site.tilek.bata")}</span> : null}
        {c.from ? <span className="tag from">{c.from}</span> : null}
      </div>
      <p className={`tcard-text${c.poem ? " poem" : ""}`} lang={ctx.locale === "ru" ? "kk" : undefined}>
        {c.poem
          ? c.lines.map((l, i) => (
              <Fragment key={i}>
                {i ? "\n" : null}
                <Inl c={l} ctx={ctx} />
              </Fragment>
            ))
          : c.lines.map((l, i) => <Inl key={i} c={l} ctx={ctx} />)}
      </p>
      {c.translit ? (
        <p className="tr-ru">
          <b>{t("site.tilek.translit")}:</b> <Inl c={c.translit} ctx={ctx} />
        </p>
      ) : null}
      {c.translation ? (
        <p className="tr-ru">
          <b>{t("site.tilek.translation")}:</b> <Inl c={c.translation} ctx={ctx} />
        </p>
      ) : null}
      <div className="tcard-actions">
        <button className="btn row copy" type="button" data-copy>
          <Ico name="copy" cls="ico sm" />
          <span className="lbl">{t("site.tilek.copy")}</span>
        </button>
        <a
          className="btn row wa"
          href={waHref(ctx, id)}
          data-wa
          target="_blank"
          rel="noopener"
          aria-label={t("site.tilek.waFull")}
        >
          <Ico name="wa" cls="ico sm fill" />
          <span>{t("site.tilek.wa")}</span>
        </a>
      </div>
    </article>
  );
}

function TilekGroups({ groups, hub, ctx }: { groups: TilekGroup[]; hub: boolean; ctx: Ctx }) {
  return (
    <>
      <div className="empty" data-empty hidden>
        <p style={{ margin: "0 0 .5rem" }}>{ctx.t("site.filter.empty")}</p>
        <button className="btn secondary" type="button" data-reset>
          {ctx.t("site.filter.reset")}
        </button>
      </div>
      {groups.map((g, gi) => {
        const parts = chunk(g.items, (it) => it.t === "tilek").map((ch, k) => {
          if (ch.run) {
            return (
              <div className="cards" key={k}>
                {ch.items.map((c) => (
                  <TilekCardView key={(c as TilekCard).no} c={c as TilekCard} ctx={ctx} hub={hub} />
                ))}
              </div>
            );
          }
          const it = ch.items[0]!;
          if (it.t === "sub")
            return (
              <h3 key={k} style={{ marginTop: "1.5rem" }}>
                {it.text}
              </h3>
            );
          if (it.t === "intro")
            return (
              <p className="g-intro" key={k}>
                <Inl c={it.c} ctx={ctx} />
              </p>
            );
          return it.t === "node" ? <Fragment key={k}>{block(it.node, ctx)}</Fragment> : null;
        });
        if (!g.id)
          return (
            <div key={gi} className="tilek-group">
              {parts}
            </div>
          );
        return (
          <section key={gi} className="tilek-group" aria-labelledby={g.id}>
            <h2 id={g.id}>
              <Inl c={g.title} ctx={ctx} />
            </h2>
            {parts}
          </section>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ приглашения */

function InviteCardView({ c, ctx }: { c: InviteCard; ctx: Ctx }) {
  const [first, ...rest] = c.lines;
  return (
    <article className="tcard" id={`m${c.no}`} aria-label={ctx.t("site.tilek.number", { no: c.no })}>
      <div className="tcard-top">
        <span className="tcard-no">{ctx.t("site.tilek.number", { no: c.no })}</span>
        {c.app ? <span className="tag from">{ctx.t("site.invite.appTag", { brand: ctx.brand })}</span> : null}
      </div>
      <p className="tcard-text">
        {first ? <Inl c={first} ctx={ctx} /> : null}
        {rest.map((l, i) => (
          <span key={i} className="tr-ru" lang={ctx.locale === "kk" ? "ru" : "kk"}>
            <Inl c={l} ctx={ctx} />
          </span>
        ))}
      </p>
      <div className="tcard-actions">
        <button className="btn row copy" type="button" data-copy>
          <Ico name="copy" cls="ico sm" />
          <span className="lbl">{ctx.t("site.tilek.copy")}</span>
        </button>
        <a className="btn row secondary" href={ctx.ctaHref}>
          {ctx.t("site.invite.useText")}
        </a>
      </div>
    </article>
  );
}

function Invites({ items, ctx }: { items: Extract<Node, { t: "invites" }>["items"]; ctx: Ctx }) {
  return chunk(items, (it) => it.t === "invite").map((ch, k) =>
    ch.run ? (
      <div className="cards" key={k}>
        {ch.items.map((c) => (
          <InviteCardView key={(c as InviteCard).no} c={c as InviteCard} ctx={ctx} />
        ))}
      </div>
    ) : (
      <h3 key={k} style={{ marginTop: "1.5rem" }}>
        {(ch.items[0] as { text: string }).text}
      </h3>
    ),
  );
}

/** Splits a list into runs of matching items (cards) and single other items. */
function chunk<T>(items: T[], isRun: (x: T) => boolean): { run: boolean; items: T[] }[] {
  const out: { run: boolean; items: T[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (isRun(it) && last?.run) last.items.push(it);
    else out.push({ run: isRun(it), items: [it] });
  }
  return out;
}

/* ------------------------------------------------------------------ демо и шаблоны */

export const TEMPLATES = [
  {
    id: "ak-shanyrak",
    key: "ak",
    cls: "tpl-ak",
    kk: "/kk/shaqyru/ulgi/ak-shanyraq",
    ru: "/ru/priglashenie/shablon/ak-shanyrak",
  },
  { id: "kok-tun", key: "kok", cls: "tpl-kok", kk: "/kk/shaqyru/ulgi/kok-tun", ru: "/ru/priglashenie/shablon/kok-tun" },
  {
    id: "kyzgaldak",
    key: "kyz",
    cls: "tpl-kyz",
    kk: "/kk/shaqyru/ulgi/qyzgaldaq",
    ru: "/ru/priglashenie/shablon/kyzgaldak",
  },
] as const;

export function tplOf(id: string) {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];
}

export function coverSrc(id: string): string {
  return `/site/toiga-shaqyru-${tplOf(id).id}.svg`;
}

function Demo({ tpl, ctx }: { tpl: string; ctx: Ctx }) {
  const t = ctx.t;
  const d = tplOf(tpl);
  const name = t(`site.templates.${d.key}.name`);
  const demoUrl = d[ctx.locale];
  return (
    <div className="demo">
      <figure className="demo-figure">
        <div className="phone">
          <div className={`phone-screen ${d.cls}`}>
            <div className="arch">
              <img
                src={coverSrc(d.id)}
                width={300}
                height={370}
                alt={t("site.demo.alt", { name })}
                loading="lazy"
                decoding="async"
              />
            </div>
            <p className="kind">{t("site.demo.kind")}</p>
            <p className="names">{t("site.demo.names")}</p>
            <p className="date">{t("site.demo.date")}</p>
            <span className="open" aria-hidden="true">
              {t("site.demo.openWord")}
            </span>
          </div>
        </div>
        <figcaption className="caption" style={{ textAlign: "center", marginTop: ".75rem" }}>
          {t("site.demo.caption", { name })}
        </figcaption>
      </figure>
      <div className="demo-text">
        <span className="demo-badge">
          <Ico name="music" cls="ico sm" />
          {t("site.demo.badge")}
        </span>
        <h3>«{name}»</h3>
        <p>{t(`site.templates.${d.key}.mood`)}.</p>
        <div className="btn-row stack">
          {isPublished(demoUrl) ? (
            <a className="btn primary" href={demoUrl}>
              {t("site.demo.open")}
              <Ico name="arrow" cls="ico sm" />
            </a>
          ) : null}
          <a className="btn secondary" href={`/e/new?template=${d.id}`}>
            {t("site.demo.use")}
          </a>
        </div>
        <p className="caption">{t("site.demo.music")}</p>
      </div>
    </div>
  );
}

/** T4: the real guest-page renderer (preview mode, fictional data) in a phone frame, loaded lazily. */
function DemoLive({ tpl, ctx }: { tpl: string; ctx: Ctx }) {
  const t = ctx.t;
  const d = tplOf(tpl);
  const name = t(`site.templates.${d.key}.name`);
  return (
    <figure className="demo-figure demo-live" id="demo">
      <div className="phone">
        <iframe
          className="phone-frame"
          src={`${ctx.page!.url}/demo`}
          title={t("site.demo.frameTitle", { name })}
          loading="lazy"
        />
      </div>
      <figcaption className="caption" style={{ textAlign: "center", marginTop: ".75rem" }}>
        {t("site.demo.caption", { name })}
      </figcaption>
    </figure>
  );
}

function TemplateCards({ ctx }: { ctx: Ctx }) {
  const t = ctx.t;
  return (
    <ul className="tpl-cards" role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {TEMPLATES.map((d) => {
        const name = t(`site.templates.${d.key}.name`);
        const url = d[ctx.locale];
        return (
          <li key={d.id}>
            <figure className="tpl-card" style={{ margin: 0 }}>
              <div className="mini">
                <img
                  src={coverSrc(d.id)}
                  width={300}
                  height={370}
                  alt={t("site.demo.alt", { name })}
                  loading="lazy"
                  decoding="async"
                />
              </div>
              <figcaption>
                <h3>«{name}»</h3>
                <p>{t(`site.templates.${d.key}.mood`)}</p>
                {isPublished(url) ? (
                  <a className="link-more" href={url}>
                    {t("site.demo.open")}
                    <Ico name="arrow" cls="ico sm" />
                  </a>
                ) : (
                  <a className="link-more" href={`/e/new?template=${d.id}`}>
                    {t("site.demo.use")}
                    <Ico name="arrow" cls="ico sm" />
                  </a>
                )}
              </figcaption>
            </figure>
          </li>
        );
      })}
    </ul>
  );
}

export function Tiles({ items, five, ctx }: { items: { label: string; href?: string }[]; five: boolean; ctx: Ctx }) {
  return (
    <ul className={`tiles${five ? " five" : ""}`}>
      {items.map((it, i) => {
        const ok = it.href ? linkTarget(it.href).ok : false;
        return (
          <li key={i}>
            {ok ? (
              <a href={it.href}>
                {it.label}
                <Ico name="right" />
              </a>
            ) : (
              <span className="soon-tile">
                {it.label} <span className="soon-badge">{ctx.t("site.soon")}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ CTA, связанные, источники */

export function CtaRow({ items, ctx, hero = false }: { items: Cta[]; ctx: Ctx; hero?: boolean }) {
  const buttons = items.flatMap((c, i) => {
    const cls = c.variant === "primary" ? "btn primary" : "btn secondary";
    if (c.action === "share-whatsapp") {
      const url = absolute(ctx.page?.url ?? `/${ctx.locale}`);
      return [
        <a
          key={i}
          className="btn wa"
          href={`https://wa.me/?text=${encodeURIComponent(url)}`}
          target="_blank"
          rel="noopener"
        >
          <Ico name="wa" cls="ico sm fill" />
          {c.text}
        </a>,
      ];
    }
    if (!c.href || !linkTarget(c.href).ok) return [];
    return [
      <a key={i} className={cls} href={c.href}>
        {c.text}
      </a>,
    ];
  });
  if (!buttons.length) return null;
  return (
    <div className="btn-row stack" data-hero-cta={hero ? "" : undefined}>
      {buttons}
    </div>
  );
}

const KIND_ICON: Record<string, IconName> = { dastur: "book", shaqyru: "send", tilek: "heart", feature: "list" };

export function Related({ ctx, toi }: { ctx: Ctx; toi?: string }) {
  if (!ctx.page) return null;
  const items = related(ctx.page, toi);
  if (!items.length) return null;
  return (
    <section className="related" aria-labelledby="rel-h">
      <h2 id="rel-h">{ctx.t("site.related.title")}</h2>
      <ul className={`rel-cards${items.length === 3 ? " three" : ""}`}>
        {items.map((p) => {
          const k = kindOf(p.url);
          return (
            <li key={p.url}>
              <a href={p.url}>
                <span className="ri">
                  <Ico name={KIND_ICON[k]!} />
                </span>
                <span>
                  <span className="rk">{ctx.t(`site.related.${k}`)}</span>
                  <b>{shortTitle(p).replace(/\{BRAND\}/g, ctx.brand)}</b>
                </span>
                <Ico name="arrow" cls="ico arr" />
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Sources({ title, items, ctx }: { title: string; items: { c: Inline[]; url?: string }[]; ctx: Ctx }) {
  return (
    <section className="sources" aria-labelledby="src-h">
      <h2 id="src-h">
        <Ico name="book" />
        {title}
      </h2>
      <ol>
        {items.map((it, i) => (
          <li key={i} id={`src-${i + 1}`}>
            <Inl c={it.c} ctx={ctx} />
            {it.url ? (
              <>
                {" — "}
                <a href={it.url} rel="noopener" target="_blank">
                  {safeHost(it.url)}
                  <Ico name="ext" cls="ico sm" />
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Calc({ ctx }: { ctx: Ctx }) {
  const t = ctx.t;
  return (
    <form className="calc" data-calc action="#calc-h" method="get" aria-labelledby="calc-h">
      <h3 id="calc-h">{t("site.calc.title")}</h3>
      <div className="calc-grid">
        <div className="field">
          <label htmlFor="calc-g">{t("site.calc.guests")}</label>
          <input id="calc-g" name="guests" type="number" inputMode="numeric" min={1} defaultValue={150} />
        </div>
        <div className="field">
          <label htmlFor="calc-p">{t("site.calc.perTable")}</label>
          <select id="calc-p" name="per" defaultValue="12">
            <option value="10">10</option>
            <option value="11">11</option>
            <option value="12">12</option>
          </select>
        </div>
        <button className="btn primary" type="submit">
          {t("site.calc.submit")}
        </button>
      </div>
      <p className="calc-out" role="status" aria-live="polite" data-calc-out>
        {t.rich("site.calc.result", { guests: 150, per: 12, tables: 13, b: (c) => <b>{c}</b> })}
      </p>
      <template data-calc-tpl>{t.raw("site.calc.result") as string}</template>
    </form>
  );
}

/** Page used by the related block and crumbs. */
export function pageTitle(url: string): string | undefined {
  const p = getPage(url);
  return p ? shortTitle(p) : undefined;
}
