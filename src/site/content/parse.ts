/**
 * content/site markdown → document tree (build time only). Mirrors the designer's generator
 * (design/v2/tools/gen_site.py) so the pages match the mockups:
 *  - frontmatter (flat `key: value`);
 *  - `<!-- BLOCK: … -->` markers → component nodes (SITE_DESIGN.md §4; kk and ru syntaxes both);
 *  - `<!-- folk … -->` → folk flag; every other comment (`S#`, `original`, `HIDDEN …`, `TODO/EDITOR/SEO`) is dropped;
 *  - «Біздің кеңес» / «Наш совет» quotes → tip; `## Дереккөздер` / `## Источники` + list → sources.
 * Pure TypeScript: unit-tested in tests/unit/site-parse.test.ts.
 */
import { FOLK, type Inline, normalize, parseInline, plain, slugify } from "./inline";

export type Frontmatter = Record<string, string>;

export type TilekCard = {
  t: "tilek";
  no: number;
  /** qysqa | ortasha | uzaq | folk */
  len: "qysqa" | "ortasha" | "uzaq" | "folk";
  folk: boolean;
  /** «халық батасы» label instead of «халық аузынан» */
  folkBata: boolean;
  poem: boolean;
  bata: boolean;
  from?: string;
  lines: Inline[][];
  /** ru cards: «Как читать» and «Перевод» lines */
  translit?: Inline[];
  translation?: Inline[];
  /** filter group (who) id, "" for format groups */
  who: string;
};

export type InviteCard = { t: "invite"; no: number; lines: Inline[][]; app: boolean };

export type FaqItem = { q: Inline[]; a: Node[] };
export type FaqGroup = { title?: Inline[]; id?: string; items: FaqItem[] };

export type TilekGroup = {
  id: string;
  title: Inline[];
  label: string;
  format: boolean;
  items: (TilekCard | { t: "sub"; text: string } | { t: "intro"; c: Inline[] } | { t: "node"; node: Node })[];
};

export type Cta = { text: string; href?: string; variant: "primary" | "secondary" | "soft"; action?: "share-whatsapp" };

export type Node =
  | { t: "h"; level: 2 | 3 | 4; c: Inline[]; id: string; text: string }
  | { t: "p"; c: Inline[]; folk: boolean; kind?: "caption" | "reviewed" }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; items: Inline[][]; start: number }
  | { t: "table"; head: Inline[][]; rows: Inline[][][]; folk?: boolean }
  | { t: "quote"; c: Node[] }
  | { t: "tip"; c: Node[] }
  | { t: "faq"; groups: FaqGroup[] }
  | { t: "tileks"; groups: TilekGroup[]; hub: boolean }
  | { t: "cards"; cards: (TilekCard | InviteCard)[] }
  | { t: "invites"; items: (InviteCard | { t: "label"; text: string })[] }
  | { t: "demo"; tpl: string }
  | { t: "templates" }
  | { t: "tiles"; items: { label: string; href?: string }[]; five: boolean }
  | { t: "links"; items: { label: string; href?: string }[] }
  | { t: "ctas"; items: Cta[] }
  | { t: "caption"; text: string }
  | { t: "related"; toi?: string }
  | { t: "print"; text?: string }
  | { t: "hall"; alt: string }
  | { t: "calc" }
  | { t: "screenshot" }
  | { t: "sources"; title: string; items: { c: Inline[]; url?: string }[] };

export type Doc = { fm: Frontmatter; h1: string; intro: Inline[][]; body: Node[] };

/* ------------------------------------------------------------------ loader */

export function splitFrontmatter(raw: string): { fm: Frontmatter; body: string } {
  const src = raw.replace(/\r\n?/g, "\n");
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(src);
  if (!m) return { fm: {}, body: src };
  const fm: Frontmatter = {};
  for (const line of m[1]!.split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0 || /^\s/.test(line)) continue;
    fm[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^"(.*)"$/, "$1");
  }
  return { fm, body: m[2]! };
}

/** Comments → markers / nothing. BLOCK specs are URI-encoded so a multi-line spec stays one token line. */
export function stripComments(body: string): string {
  return body
    .replace(/<!--\s*folk\b[\s\S]*?-->/g, ` ${FOLK}`)
    .replace(
      /<!--\s*(\/?)BLOCK:?\s*([\s\S]*?)-->/g,
      (_, end: string, spec: string) => `\n@@${end ? "/" : ""}BLOCK ${encodeURIComponent(spec.trim())}@@\n`,
    )
    .replace(/<!--[\s\S]*?-->/g, "");
}

/* ------------------------------------------------------------------ tokens */

type Tok =
  | { k: "block"; name: string; spec: string }
  | { k: "end" }
  | { k: "h"; level: number; text: string; id?: string }
  | { k: "p"; text: string }
  | { k: "ul"; items: string[] }
  | { k: "ol"; items: string[]; start: number }
  | { k: "table"; rows: string[][] }
  | { k: "quote"; toks: Tok[] }
  | { k: "hr" };

const START = /^(#{1,4}\s|@@|\||>|- |\d+\.\s)/;

export function tokenize(body: string): Tok[] {
  const lines = body.split("\n");
  const toks: Tok[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const s = line.trim();
    if (!s) {
      i++;
      continue;
    }
    if (s.startsWith("@@")) {
      const m = /^@@(\/?)BLOCK ?(.*?)@@$/.exec(s);
      if (m) {
        if (m[1]) toks.push({ k: "end" });
        else {
          const spec = decodeURIComponent(m[2] ?? "");
          toks.push({ k: "block", name: (spec.split(/[\s"→]/)[0] ?? "").toLowerCase(), spec });
        }
      }
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*?)(?:\s*\{#([\w-]+)\})?$/.exec(s);
    if (h) {
      toks.push({ k: "h", level: h[1]!.length, text: h[2]!, id: h[3] });
      i++;
      continue;
    }
    if (s === "---" || s === "***") {
      toks.push({ k: "hr" });
      i++;
      continue;
    }
    if (s.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) {
        const cells = splitRow(lines[i]!.trim());
        if (!cells.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      toks.push({ k: "table", rows });
      continue;
    }
    if (s.startsWith(">")) {
      const q: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) {
        q.push(lines[i]!.trim().replace(/^>\s?/, ""));
        i++;
      }
      toks.push({ k: "quote", toks: tokenize(q.join("\n")) });
      continue;
    }
    if (/^- /.test(s)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*- /.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*- /, "").trim());
        i++;
      }
      toks.push({ k: "ul", items });
      continue;
    }
    if (/^\d+\.\s/.test(s)) {
      const items: string[] = [];
      const start = Number(/^(\d+)/.exec(s)![1]);
      while (i < lines.length && lines[i]!.trim()) {
        const t = lines[i]!.trim();
        if (/^\d+\.\s/.test(t)) items.push(t.replace(/^\d+\.\s/, ""));
        else if (t.startsWith("@@") || t.startsWith("#")) break;
        else items[items.length - 1] += "\n" + t;
        i++;
      }
      toks.push({ k: "ol", items, start });
      continue;
    }
    const para = [line.replace(/^\s+/, "")];
    i++;
    while (i < lines.length && lines[i]!.trim() && !START.test(lines[i]!.trim())) {
      para.push(lines[i]!.replace(/^\s+/, ""));
      i++;
    }
    toks.push({ k: "p", text: para.join("\n") });
  }
  return toks;
}

function splitRow(row: string): string[] {
  return row
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

/* ------------------------------------------------------------------ structure */

const TIP_RE = /^\*\*(Біздің кеңес|Наш совет)\.\*\*\s*/;
const SOURCES = new Set(["Дереккөздер", "Источники"]);
const CONTAINERS = new Set([
  "tilek-list",
  "invite-text-cards",
  "toi-cards",
  "occasion-cards",
  "link-cards",
  "folk-table",
  "template-cards",
]);

/** Blocks that carry their own `/BLOCK` in kk content (ru content has no end markers at all). */
const PAIRED = new Set([...CONTAINERS, "faq", "callout"]);

function attr(spec: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(spec)?.[1];
}

export class Parser {
  private ids = new Set<string>();
  constructor(private readonly toks: Tok[]) {}

  uid(base: string): string {
    let id = base || "s";
    for (let n = 2; this.ids.has(id); n++) id = `${base}-${n}`;
    this.ids.add(id);
    return id;
  }

  /** Index of the matching `/BLOCK` before the next block of the same name, or -1. */
  private endOf(from: number, name: string): number {
    let depth = 0;
    for (let j = from; j < this.toks.length; j++) {
      const t = this.toks[j]!;
      if (t.k === "end") {
        if (depth === 0) return j;
        depth--;
      } else if (t.k === "block") {
        if (t.name === name && depth === 0) return -1;
        if (PAIRED.has(t.name)) depth++;
      }
    }
    return -1;
  }

  parse(from = 0, to = this.toks.length): Node[] {
    const out: Node[] = [];
    let i = from;
    while (i < to) {
      const t = this.toks[i]!;
      switch (t.k) {
        case "end":
        case "hr":
          i++;
          break;
        case "h": {
          if (t.level === 1) {
            i++;
            break;
          }
          const text = t.text.trim();
          if (t.level === 2 && SOURCES.has(text)) {
            const next = this.toks[i + 1];
            out.push(sources(text, next?.k === "ul" ? next.items : []));
            i += next?.k === "ul" ? 2 : 1;
            break;
          }
          out.push(this.heading(t.level, text, t.id));
          i++;
          break;
        }
        case "p":
          out.push(para(t.text));
          i++;
          break;
        case "ul":
          out.push({ t: "ul", items: t.items.map((x) => parseInline(x)) });
          i++;
          break;
        case "ol": {
          // blank-line separated numbered lists continue one list
          const items = [...t.items];
          let j = i + 1;
          let next = t.start + t.items.length;
          while (j < to) {
            const n = this.toks[j]!;
            if (n.k !== "ol" || n.start !== next) break;
            items.push(...n.items);
            next += n.items.length;
            j++;
          }
          out.push({ t: "ol", start: t.start, items: items.map((x) => parseInline(x)) });
          i = j;
          break;
        }
        case "table":
          out.push(table(t.rows));
          i++;
          break;
        case "quote":
          out.push(this.quote(t.toks));
          i++;
          break;
        case "block":
          i = this.block(i, to, out);
          break;
      }
    }
    return out;
  }

  private heading(level: number, text: string, id?: string): Node {
    const c = parseInline(text);
    const label = plain(c, () => "");
    return { t: "h", level: Math.min(4, level) as 2 | 3 | 4, c, text: label, id: this.uid(id ?? slugify(label)) };
  }

  private quote(toks: Tok[]): Node {
    const first = toks[0];
    if (first?.k === "p" && TIP_RE.test(first.text)) {
      const rest: Tok[] = [{ k: "p", text: first.text.replace(TIP_RE, "") }, ...toks.slice(1)];
      const sub = new Parser(rest.filter((x) => !(x.k === "p" && !x.text.trim())));
      return { t: "tip", c: sub.parse() };
    }
    return { t: "quote", c: new Parser(toks).parse() };
  }

  /** Returns the index after the block. */
  private block(i: number, to: number, out: Node[]): number {
    const t = this.toks[i] as Extract<Tok, { k: "block" }>;
    const { name, spec } = t;
    const explicitEnd = CONTAINERS.has(name) || name === "faq" ? this.endOf(i + 1, name) : -1;
    const end = explicitEnd >= 0 && explicitEnd < to ? explicitEnd : -1;

    switch (name) {
      case "faq": {
        const [node, next] = this.faq(i + 1, end >= 0 ? end : to, end >= 0, /групп/.test(spec));
        out.push(node);
        return end >= 0 ? Math.max(next, end + 1) : next;
      }
      case "tilek-list": {
        const stop = end >= 0 ? end : to;
        out.push(this.tileks(i + 1, stop));
        return stop + (end >= 0 ? 1 : 0);
      }
      case "tilekcard": {
        // ru: marker + paragraph «**kk**  / *Как читать:* … / *Перевод:* …»
        const cards: (TilekCard | InviteCard)[] = [];
        let j = i;
        while (j < to) {
          const m = this.toks[j]!;
          if (m.k !== "block" || m.name !== "tilekcard") break;
          const p = this.toks[j + 1];
          if (p?.k === "p") cards.push(ruTilek(m.spec, p.text, cards.length + 1 + this.ruTilekCount));
          j += p?.k === "p" ? 2 : 1;
        }
        this.ruTilekCount += cards.length;
        out.push({ t: "cards", cards });
        return j;
      }
      case "invitetextcard":
      case "invite-text-cards": {
        if (name === "invite-text-cards") {
          const stop = end >= 0 ? end : to;
          out.push(this.invites(i + 1, stop));
          return stop + (end >= 0 ? 1 : 0);
        }
        // ru: «**Label**» paragraphs + marker + quote, repeated
        const items: (InviteCard | { t: "label"; text: string })[] = [];
        let j = i;
        let label = "";
        while (j < to) {
          const m = this.toks[j]!;
          if (m.k === "block" && m.name === "invitetextcard") {
            const q = this.toks[j + 1];
            if (q?.k === "quote") {
              const lines = q.toks.filter((x) => x.k === "p").map((x) => parseInline((x as { text: string }).text, { fill: true }));
              items.push({ t: "invite", no: this.inviteNo++, lines, app: /^Из сервиса/.test(label) });
              j += 2;
            } else j++;
            continue;
          }
          // a label paragraph followed by another card continues the group
          if (m.k === "p" && /^\*\*[^*]+\*\*$/.test(m.text.trim())) {
            const nx = this.toks[j + 1];
            if (nx?.k === "block" && nx.name === "invitetextcard") {
              label = m.text.trim().replace(/^\*\*|\*\*$/g, "");
              items.push({ t: "label", text: label });
              j++;
              continue;
            }
          }
          break;
        }
        // a label right before the first card belongs to this group
        const prev = out[out.length - 1];
        if (prev?.t === "p" && prev.c.length === 1 && prev.c[0]!.t === "strong") {
          out.pop();
          const text = plain(prev.c);
          items.unshift({ t: "label", text });
          if (/^Из сервиса/.test(text)) {
            for (const it of items) if (it.t === "invite") it.app = true;
          }
        }
        // merge with the previous invites node (labels split the run)
        const last = out[out.length - 1];
        if (last?.t === "invites") last.items.push(...items);
        else out.push({ t: "invites", items });
        return j;
      }
      case "demo-invite":
      case "demoinvite": {
        const m = /(ak-shanyra[qk]|kok-tun|qyzgaldaq|kyzgaldak)/.exec(spec);
        out.push({ t: "demo", tpl: normalizeTpl(m?.[1] ?? "ak-shanyrak") });
        return i + 1;
      }
      case "template-cards":
      case "templatecards": {
        out.push({ t: "templates" });
        if (end >= 0) return end + 1;
        return i + 1;
      }
      case "toi-cards":
      case "occasion-cards":
      case "link-cards": {
        const stop = end >= 0 ? end : i + 1;
        const items: { label: string; href?: string }[] = [];
        for (let j = i + 1; j < stop; j++) {
          const tk = this.toks[j]!;
          if (tk.k !== "ul") continue;
          for (const it of tk.items) {
            const m = /^\[(.+?)\]\((.+?)\)/.exec(it);
            items.push(m ? { label: m[1]!, href: m[2]! } : { label: normalize(it) });
          }
        }
        out.push(name === "link-cards" ? { t: "links", items } : { t: "tiles", items, five: name === "occasion-cards" });
        return end >= 0 ? end + 1 : i + 1;
      }
      case "toitypecards": {
        const items = [...spec.matchAll(/- (.+?) → (\S+)/g)].map((m) => ({
          label: m[1]!.replace(/\s*\(.*?\)/g, "").trim(),
          href: m[2]!,
        }));
        if (items.length) out.push({ t: "tiles", items, five: false });
        return i + 1;
      }
      case "folk-table": {
        const stop = end >= 0 ? end : i + 2;
        for (let j = i + 1; j < stop; j++) {
          const tk = this.toks[j]!;
          if (tk.k === "table") out.push({ ...table(tk.rows), folk: true });
        }
        return stop + (end >= 0 ? 1 : 0);
      }
      case "cta":
      case "cta-secondary": {
        const items: Cta[] = [];
        let j = i;
        while (j < to) {
          const m = this.toks[j]!;
          if (m.k !== "block" || (m.name !== "cta" && m.name !== "cta-secondary")) break;
          const c = cta(m.name, m.spec);
          if (c) items.push(c);
          j++;
        }
        if (items.length) out.push({ t: "ctas", items });
        return j;
      }
      case "caption": {
        const m = /"(.+?)"/.exec(spec);
        if (m) out.push({ t: "caption", text: m[1]!.replace(/\.?$/, ".") });
        return i + 1;
      }
      case "related-cluster":
      case "relatedcluster": {
        const toi = attr(spec, "toiType") ?? spec.split(/\s+/)[1];
        out.push({ t: "related", toi });
        return i + 1;
      }
      case "print-checklist":
        out.push({ t: "print", text: attr(spec, "text") });
        return i + 1;
      case "hall-scheme":
      case "hallscheme": {
        const alt = attr(spec, "alt") ?? /alt: «(.+?)»/.exec(spec)?.[1] ?? "";
        out.push({ t: "hall", alt });
        return i + 1;
      }
      case "tablecalc":
        out.push({ t: "calc" });
        return i + 1;
      case "screenshot":
        out.push({ t: "screenshot" });
        return i + 1;
      default:
        // callout / Callout: tips are recognised by their «Біздің кеңес.» / «Наш совет.» quote instead
        return i + 1;
    }
  }

  private ruTilekCount = 0;
  private inviteNo = 1;

  /** FAQ items: H3 = question, following nodes = answer. */
  private faq(from: number, to: number, explicit: boolean, grouped: boolean): [Node, number] {
    const groups: FaqGroup[] = [{ items: [] }];
    let cur: { q: Inline[]; toks: Tok[] } | null = null;
    const flush = () => {
      if (cur) {
        const sub = new Parser(cur.toks);
        sub.ids = this.ids;
        groups[groups.length - 1]!.items.push({ q: cur.q, a: sub.parse() });
        cur = null;
      }
    };
    let j = from;
    for (; j < to; j++) {
      const t = this.toks[j]!;
      if (t.k === "end" || t.k === "hr") break;
      if (t.k === "block" && !explicit) break;
      if (t.k === "block") continue;
      if (t.k === "h" && t.level <= 2) {
        const next = this.toks[j + 1];
        if ((grouped || explicit) && t.level === 2 && next?.k === "h" && next.level === 3) {
          flush();
          const c = parseInline(t.text);
          const label = plain(c, () => "");
          groups.push({ title: c, id: this.uid(t.id ?? slugify(label)), items: [] });
          continue;
        }
        break;
      }
      if (t.k === "h" && t.level === 3) {
        flush();
        cur = { q: parseInline(t.text), toks: [] };
        continue;
      }
      if (!cur) {
        if (explicit) continue;
        break;
      }
      // ru FAQs have no /BLOCK: a closing «see also» paragraph with a link ends the FAQ
      if (!explicit && t.k === "p" && cur.toks.length > 0 && /\]\(\//.test(t.text)) break;
      cur.toks.push(t);
    }
    flush();
    return [{ t: "faq", groups: groups.filter((g) => g.items.length) }, j];
  }

  private tileks(from: number, to: number): Node {
    const groups: TilekGroup[] = [];
    let hub = false;
    const implicit = (): TilekGroup => {
      const g: TilekGroup = { id: "", title: [], label: "", format: true, items: [] };
      groups.push(g);
      return g;
    };
    for (let j = from; j < to; j++) {
      const t = this.toks[j]!;
      if (t.k === "h" && t.level === 2) {
        const c = parseInline(t.text);
        const text = plain(c, () => "");
        const format = /қысқа|өлең/i.test(text) || /^ақ бата$/i.test(text.trim());
        groups.push({ id: this.uid(t.id ?? groupId(text)), title: c, label: groupLabel(text), format, items: [] });
        continue;
      }
      const g = groups[groups.length - 1] ?? implicit();
      if (t.k === "h") {
        g.items.push({ t: "sub", text: t.text.trim() });
        continue;
      }
      if (t.k === "quote") {
        g.items.push({ t: "node", node: this.quote(t.toks) });
        continue;
      }
      if (t.k !== "p") continue;
      const s = t.text.trim();
      const m = /^\*\*(\d+)\.\*\*\s*\*([^*]+)\*\s*—\s*([\s\S]*)$/.exec(s);
      if (m) {
        g.items.push(kkTilek(Number(m[1]), m[2]!.trim(), m[3]!, g));
        continue;
      }
      if (/^\*\*[^*]+\*\*$/.test(s)) {
        hub = true;
        g.items.push({ t: "sub", text: s.replace(/^\*\*|\*\*$/g, "") });
      } else g.items.push({ t: "intro", c: parseInline(s) });
    }
    return { t: "tileks", groups, hub };
  }

  private invites(from: number, to: number): Node {
    const items: (InviteCard | { t: "label"; text: string })[] = [];
    let label = "";
    for (let j = from; j < to; j++) {
      const t = this.toks[j]!;
      if (t.k === "p" && /^\*\*[^*]+\*\*$/.test(t.text.trim())) {
        label = t.text.trim().replace(/^\*\*|\*\*$/g, "");
        items.push({ t: "label", text: label });
        continue;
      }
      if (t.k === "ol") {
        t.items.forEach((it, n) => {
          const lines = it.split("\n").map((x) => parseInline(x, { fill: true }));
          items.push({ t: "invite", no: t.start + n, lines, app: label === "Үлгі мәтіндер" });
        });
      }
    }
    return { t: "invites", items };
  }
}

function groupId(text: string): string {
  const s = text.toLowerCase();
  if (/^ақ бата$/.test(s.trim())) return "aq-bata";
  if (/қысқа/.test(s)) return "qysqa";
  if (/өлең/.test(s)) return "olenmen";
  const tail = text.includes(":") ? text.split(":").slice(1).join(":") : text;
  return slugify(tail);
}

function groupLabel(text: string): string {
  const tail = (text.includes(":") ? text.split(":").slice(1).join(":") : text).trim();
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

const LEN: Record<string, TilekCard["len"]> = {
  қысқа: "qysqa",
  орташа: "ortasha",
  ұзақ: "uzaq",
  короткий: "qysqa",
  qysqa: "qysqa",
  ortasha: "ortasha",
  uzaq: "uzaq",
};

function kkTilek(no: number, lenLabel: string, raw: string, g: TilekGroup): TilekCard {
  const folk = raw.includes(FOLK) || lenLabel === "халық батасы";
  let text = raw.split(FOLK).join("").trim().replace(/^<br>\s*/, "");
  let from: string | undefined;
  const fm = /^\((\p{L}+)\)\s*/u.exec(text);
  if (fm) {
    from = fm[1];
    text = text.slice(fm[0].length);
  }
  const poem = /<br>/.test(text);
  const lines = poem
    ? text
        .split(/<br>\s*/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => parseInline(x))
    : [parseInline(text)];
  return {
    t: "tilek",
    no,
    len: LEN[lenLabel] ?? "folk",
    folk,
    folkBata: lenLabel === "халық батасы",
    poem,
    bata: g.id === "aq-bata" || /бата/i.test(g.label),
    from,
    lines,
    who: g.format ? "" : g.id,
  };
}

function ruTilek(spec: string, text: string, no: number): TilekCard {
  const parts = text.split(/\n/).map((x) => x.replace(/ {2,}$/, "").trim());
  const kk = parts.find((x) => /^\*\*/.test(x)) ?? parts[0] ?? "";
  const tr = parts.find((x) => /^\*Как читать:\*/.test(x));
  const pe = parts.find((x) => /^\*Перевод:\*/.test(x));
  return {
    t: "tilek",
    no,
    len: LEN[attr(spec, "length") ?? ""] ?? "qysqa",
    folk: text.includes(FOLK),
    folkBata: false,
    poem: false,
    bata: false,
    from: attr(spec, "from"),
    lines: [parseInline(kk.replace(/^\*\*|\*\*$/g, ""))],
    translit: tr ? parseInline(tr.replace(/^\*Как читать:\*\s*/, "")) : undefined,
    translation: pe ? parseInline(pe.replace(/^\*Перевод:\*\s*/, "")) : undefined,
    who: "",
  };
}

export function normalizeTpl(id: string): string {
  return { "ak-shanyraq": "ak-shanyrak", qyzgaldaq: "kyzgaldak" }[id] ?? id;
}

function cta(name: string, spec: string): Cta | null {
  const text = attr(spec, "text") ?? /"(.+?)"/.exec(spec)?.[1];
  if (!text) return null;
  const href = attr(spec, "href");
  const lower = spec.toLowerCase();
  const variant: Cta["variant"] =
    name === "cta-secondary" || /^cta\s+secondary/.test(lower) ? "secondary" : /^cta\s+soft/.test(lower) ? "soft" : "primary";
  const action = /share-whatsapp|в whatsapp/i.test(spec) && !href ? "share-whatsapp" : undefined;
  return { text, href, variant, action };
}

function para(text: string): Node {
  const s = text.trim();
  const folk = s.includes(FOLK);
  const clean = s.split(FOLK).join("").trim();
  if (/^\*[^*][\s\S]*[^*]\*$/.test(clean)) {
    const inner = clean.slice(1, -1);
    const kind = /Мәтінді тексерген|Проверка текста/.test(inner) ? "reviewed" : "caption";
    return { t: "p", c: parseInline(inner), folk, kind };
  }
  return { t: "p", c: parseInline(clean), folk };
}

function table(rows: string[][]): Extract<Node, { t: "table" }> {
  const [head = [], ...rest] = rows;
  return { t: "table", head: head.map((c) => parseInline(c)), rows: rest.map((r) => r.map((c) => parseInline(c))) };
}

function sources(title: string, items: string[]): Node {
  return {
    t: "sources",
    title,
    items: items.map((it) => {
      const m = /^(.*?)\s+—\s+(https?:\/\/\S+)(?:\s.*)?$/.exec(it);
      return m ? { c: parseInline(m[1]!), url: m[2]! } : { c: parseInline(it) };
    }),
  };
}

/* ------------------------------------------------------------------ document */

export function parseDocument(raw: string): Doc {
  const { fm, body } = splitFrontmatter(raw);
  const toks = tokenize(stripComments(body));
  const hIdx = toks.findIndex((t) => t.k === "h" && t.level === 1);
  const h1 = hIdx >= 0 ? (toks[hIdx] as { text: string }).text : (fm.h1 ?? "");
  let j = hIdx + 1;
  const intro: Inline[][] = [];
  while (j < toks.length && toks[j]!.k === "p") {
    intro.push(parseInline((toks[j] as { text: string }).text));
    j++;
  }
  const parser = new Parser(toks);
  return { fm, h1, intro, body: parser.parse(j) };
}
