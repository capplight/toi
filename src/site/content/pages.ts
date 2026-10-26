import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Locale } from "@/i18n/config";
import { siteOrigin } from "@/server/env";
import { SITE_CONFIG, SOFT_PLACEHOLDERS } from "../config";
import { type Inline, linksIn, placeholdersIn } from "./inline";
import { type Doc, type Node, parseDocument } from "./parse";

/**
 * Index of the public site, built from content/site/{kk,ru}/**.md at BUILD time (all site routes are static with
 * `dynamicParams = false`; nothing here runs in the production server).
 */

export type Template =
  | "landing"
  | "inviteHub"
  | "invite"
  | "demo"
  | "tilekHub"
  | "tilek"
  | "dasturHub"
  | "dastur"
  | "feature"
  | "faq"
  | "service"
  | "soon";

export type ToiType = "uilenu_toi" | "kyz_uzatu" | "sundet" | "besik" | "merey" | "seating";

export type SitePage = {
  url: string;
  locale: Locale;
  /** path segments after the locale */
  slug: string[];
  file: string | null;
  doc: Doc;
  template: Template;
  published: boolean;
  /** why the page is not published (empty when published) */
  reasons: string[];
  /** hreflang pair (both sides published) */
  pair?: string;
  /** declared pair, published or not */
  pairDeclared?: string;
  toi?: ToiType;
  title: string;
  description: string;
  h1: string;
};

const CONTENT = join(process.cwd(), "content", "site");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return walk(p);
    return f.endsWith(".md") && !f.startsWith("_") ? [p] : [];
  });
}

export function templateOf(url: string): Template {
  const [, loc, ...rest] = url.split("/");
  const p = rest.join("/");
  if (!p) return "landing";
  if (p === "shaqyru" || p === "priglashenie") return "inviteHub";
  if (/^(shaqyru\/ulgi|priglashenie\/shablon)\//.test(p)) return "demo";
  if (/^(shaqyru|priglashenie)\//.test(p)) return "invite";
  if (p === "tilekter" || p === "pozdravleniya-na-kazakhskom") return "tilekHub";
  if (p.startsWith("tilekter/")) return "tilek";
  if (p === "dastur" || p === "traditsii") return "dasturHub";
  if (/^(dastur|traditsii)\//.test(p)) return "dastur";
  if (/^(otyrgyzu-jospary|rassadka-gostei|qonaqtar-tizimi|spisok-gostei|toi-shygyny|byudzhet-toya)$/.test(p))
    return "feature";
  if (p === "suraqtar" || p === "voprosy") return "faq";
  if (p === "baga" || p === "tseny") return "soon";
  void loc;
  return "service";
}

export function toiOf(url: string): ToiType | undefined {
  if (/sundet/.test(url)) return "sundet";
  if (/(qyz|kyz)-uzatu|syrga-salu|qudalyq|kudalyk|qudalarga|qyzgaldaq|kyzgaldak/.test(url)) return "kyz_uzatu";
  if (/uilenu-toi|betashar|kelinge|ak-shanyra/.test(url)) return "uilenu_toi";
  if (/mereitoi|50-jas|70-jas|yubilei/.test(url)) return "merey";
  if (/besik-toi|shildekhana|tusau/.test(url)) return "besik";
  if (/otyrgyzu|rassadka|qonaqtar|spisok|shygyny|byudzhet/.test(url)) return "seating";
  return undefined;
}

/** Walks every inline run of a node tree. */
export function eachInline(nodes: Node[], fn: (c: Inline[]) => void): void {
  for (const n of nodes) {
    switch (n.t) {
      case "h":
      case "p":
        fn(n.c);
        break;
      case "ul":
      case "ol":
        n.items.forEach(fn);
        break;
      case "table":
        n.head.forEach(fn);
        n.rows.forEach((r) => r.forEach(fn));
        break;
      case "quote":
      case "tip":
        eachInline(n.c, fn);
        break;
      case "faq":
        for (const g of n.groups) {
          if (g.title) fn(g.title);
          for (const it of g.items) {
            fn(it.q);
            eachInline(it.a, fn);
          }
        }
        break;
      case "tileks":
        for (const g of n.groups) {
          fn(g.title);
          for (const it of g.items) {
            if (it.t === "tilek") it.lines.forEach(fn);
            else if (it.t === "intro") fn(it.c);
            else if (it.t === "node") eachInline([it.node], fn);
          }
        }
        break;
      case "cards":
        for (const c of n.cards) {
          c.lines.forEach(fn);
          if (c.t === "tilek") {
            if (c.translit) fn(c.translit);
            if (c.translation) fn(c.translation);
          }
        }
        break;
      case "invites":
        for (const it of n.items) if (it.t === "invite") it.lines.forEach(fn);
        break;
      case "sources":
        n.items.forEach((it) => fn(it.c));
        break;
      default:
        break;
    }
  }
}

function openPlaceholders(doc: Doc): string[] {
  const found = new Set<string>();
  const add = (c: Inline[]) => placeholdersIn(c, found);
  doc.intro.forEach(add);
  eachInline(doc.body, add);
  for (const k of ["title", "description", "h1"]) for (const m of (doc.fm[k] ?? "").matchAll(/\{([A-Z_]+)\}/g)) found.add(m[1]!);
  return [...found].filter((n) => !SOFT_PLACEHOLDERS.has(n) && !SITE_CONFIG.placeholders[n]);
}

function gate(url: string, doc: Doc, template: Template): string[] {
  const g = SITE_CONFIG.gate;
  if (g.neverPublish.includes(url)) return ["neverPublish"];
  if (g.alwaysPublish.includes(url)) return [];
  if (template === "soon") return ["soon"];
  const reasons: string[] = [];
  if (g.hideNeedsFix && doc.fm.status === "needs_fix") reasons.push("status: needs_fix");
  const reviewer = doc.fm.reviewedBy ?? "";
  const signed = Boolean(reviewer) && !/\{[A-Z_]+\}/.test(reviewer);
  if (g.hideUntilTraditionReview && doc.fm.needs_tradition_review === "true" && !signed)
    reasons.push("needs_tradition_review");
  const open = openPlaceholders(doc);
  if (g.hideWithOpenPlaceholders && open.length) reasons.push(`placeholders: ${open.join(", ")}`);
  return reasons;
}

const SOON: { url: string; locale: Locale }[] = [
  { url: "/kk/baga", locale: "kk" },
  { url: "/ru/tseny", locale: "ru" },
];

function build(): Map<string, SitePage> {
  const pages = new Map<string, SitePage>();
  for (const file of walk(CONTENT)) {
    const doc = parseDocument(readFileSync(file, "utf8"));
    const url = doc.fm.url;
    if (!url || !/^\/(kk|ru)(\/|$)/.test(url)) throw new Error(`content/site: no valid url in ${file}`);
    if (pages.has(url)) throw new Error(`content/site: duplicate url ${url}`);
    if (!doc.fm.title || !doc.fm.description) throw new Error(`content/site: empty title/description in ${file}`);
    const template = templateOf(url);
    const reasons = gate(url, doc, template);
    pages.set(url, {
      url,
      locale: url.slice(1, 3) as Locale,
      slug: url.split("/").slice(2),
      file: relative(process.cwd(), file).split("\\").join("/"),
      doc,
      template,
      published: reasons.length === 0,
      reasons,
      pairDeclared: doc.fm.hreflang_pair || undefined,
      toi: toiOf(url),
      title: doc.fm.title,
      description: doc.fm.description,
      h1: doc.fm.h1 || doc.h1,
    });
  }
  for (const s of SOON) {
    pages.set(s.url, {
      url: s.url,
      locale: s.locale,
      slug: s.url.split("/").slice(2),
      file: null,
      doc: { fm: {}, h1: "", intro: [], body: [] },
      template: "soon",
      published: false,
      reasons: ["soon"],
      pairDeclared: s.locale === "kk" ? "/ru/tseny" : "/kk/baga",
      title: "",
      description: "",
      h1: "",
    });
  }
  // hreflang pairs are symmetric: declared on either side
  for (const p of pages.values()) {
    if (!p.pairDeclared) continue;
    const other = pages.get(p.pairDeclared);
    if (!other) throw new Error(`content/site: ${p.url} → hreflang_pair ${p.pairDeclared} does not exist`);
    if (other.locale === p.locale) throw new Error(`content/site: ${p.url} → hreflang_pair in the same language`);
    other.pairDeclared ??= p.url;
  }
  for (const p of pages.values()) {
    const other = p.pairDeclared ? pages.get(p.pairDeclared) : undefined;
    if (other && other.pairDeclared === p.url && p.published && other.published) p.pair = other.url;
  }
  return pages;
}

let cache: Map<string, SitePage> | undefined;
export function allPages(): Map<string, SitePage> {
  cache ??= build();
  return cache;
}

export function getPage(url: string): SitePage | undefined {
  return allPages().get(url);
}

export function isPublished(url: string): boolean {
  return allPages().get(url.split("#")[0]!.split("?")[0]!)?.published ?? false;
}

/** Internal site link state: published page → link; unknown or unpublished site page → plain text. */
export function linkTarget(href: string): { kind: "site" | "app" | "external" | "anchor"; ok: boolean } {
  if (href.startsWith("#")) return { kind: "anchor", ok: true };
  if (/^https?:\/\//.test(href)) return { kind: "external", ok: true };
  if (/^\/(kk|ru)(\/|$|#|\?)/.test(href)) return { kind: "site", ok: isPublished(href) };
  return { kind: "app", ok: true };
}

export function origin(): string {
  return siteOrigin() ?? SITE_CONFIG.fallbackOrigin;
}

export function absolute(path: string): string {
  return origin() + path;
}

/** Links to unpublished/unknown site pages, for the build report in the handover (scripts / tests). */
export function deadSiteLinks(): { from: string; to: string }[] {
  const out: { from: string; to: string }[] = [];
  for (const p of allPages().values()) {
    const hrefs: string[] = [];
    p.doc.intro.forEach((c) => linksIn(c, hrefs));
    eachInline(p.doc.body, (c) => linksIn(c, hrefs));
    for (const h of hrefs) if (/^\/(kk|ru)/.test(h) && !getPage(h.split("#")[0]!)) out.push({ from: p.url, to: h });
  }
  return out;
}
