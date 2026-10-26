/**
 * Inline markdown of content/site (a small, known subset): links, **strong**, *em*, `<br>`, `<a id>` anchors,
 * `{PLACEHOLDER}` and — in invitation texts — `[есімі]` fields. Pure TypeScript, no dependencies.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] }
  | { t: "br" }
  | { t: "ph"; name: string }
  | { t: "fill"; v: string }
  | { t: "anchor"; id: string };

export type InlineOptions = { fill?: boolean };

/** Folk marker left in the text by the loader (`<!-- folk S# -->` → this sentinel). */
export const FOLK = "⟦folk⟧";

const RE =
  /(<br\s*\/?>)|<a id="([\w-]+)"><\/a>|\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|(?<![\p{L}\p{N}*])\*(?![\s*])(.+?)(?<![\s*])\*(?![\p{L}\p{N}*])|\{([A-Z_]+)\}|\[([^\]\n]+)\]/gu;

/** Whitespace clean-up after comments were stripped: hard breaks, spaces before punctuation, double spaces. */
export function normalize(s: string): string {
  return s
    .split(FOLK)
    .join("")
    .replace(/ {2,}\n/g, "<br>")
    .replace(/\s*\n\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .trim();
}

export function parseInline(src: string, opts: InlineOptions = {}): Inline[] {
  return parseRaw(normalize(src), opts);
}

function parseRaw(s: string, opts: InlineOptions): Inline[] {
  const out: Inline[] = [];
  const push = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let pos = 0;
  RE.lastIndex = 0;
  const re = new RegExp(RE.source, RE.flags);
  for (let m = re.exec(s); m; m = re.exec(s)) {
    push(s.slice(pos, m.index));
    pos = m.index + m[0].length;
    if (m[1]) {
      // trim spaces around a line break
      const last = out[out.length - 1];
      if (last && last.t === "text") last.v = last.v.replace(/\s+$/, "");
      out.push({ t: "br" });
      const rest = s.slice(pos);
      pos += rest.length - rest.replace(/^\s+/, "").length;
    } else if (m[2]) out.push({ t: "anchor", id: m[2] });
    else if (m[3] !== undefined && m[4] !== undefined) out.push({ t: "link", href: m[4], c: parseRaw(m[3], opts) });
    else if (m[5] !== undefined) out.push({ t: "strong", c: parseRaw(m[5], opts) });
    else if (m[6] !== undefined) out.push({ t: "em", c: parseRaw(m[6], opts) });
    else if (m[7] !== undefined) out.push({ t: "ph", name: m[7] });
    else if (m[8] !== undefined) {
      if (opts.fill) out.push({ t: "fill", v: m[8] });
      else push(m[0]);
    }
  }
  push(s.slice(pos));
  // drop leading / trailing breaks
  while (out[0]?.t === "br") out.shift();
  while (out[out.length - 1]?.t === "br") out.pop();
  return out;
}

/** Plain text of inline nodes (copy buttons, JSON-LD, TOC, ids). Placeholders resolve through `ph`. */
export function plain(nodes: Inline[], ph: (name: string) => string = (n) => `{${n}}`): string {
  let s = "";
  for (const n of nodes) {
    switch (n.t) {
      case "text":
        s += n.v;
        break;
      case "br":
        s += "\n";
        break;
      case "ph":
        s += ph(n.name);
        break;
      case "fill":
        s += `[${n.v}]`;
        break;
      case "anchor":
        break;
      default:
        s += plain(n.c, ph);
    }
  }
  return s;
}

export function placeholdersIn(nodes: Inline[], acc: Set<string> = new Set()): Set<string> {
  for (const n of nodes) {
    if (n.t === "ph") acc.add(n.name);
    else if (n.t === "strong" || n.t === "em" || n.t === "link") placeholdersIn(n.c, acc);
  }
  return acc;
}

export function linksIn(nodes: Inline[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.t === "link") {
      acc.push(n.href);
      linksIn(n.c, acc);
    } else if (n.t === "strong" || n.t === "em") linksIn(n.c, acc);
  }
  return acc;
}

const TR: Record<string, string> = {
  ә: "a", ғ: "g", қ: "q", ң: "n", ө: "o", ұ: "u", ү: "u", һ: "h", і: "i", а: "a", б: "b", в: "v", г: "g", д: "d",
  е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sh", ы: "y", э: "e", ю: "yu", я: "ya", ь: "", ъ: "",
};

/** Heading ids — the designer's transliteration (gen_site.py `slug`). */
export function slugify(text: string): string {
  const t = [...text.toLowerCase()].map((ch) => TR[ch] ?? ch).join("");
  return t
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
}
