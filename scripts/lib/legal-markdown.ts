/**
 * The small Markdown subset of `content/legal/*.md` (CONTENT_REVIEW §8) → HTML, at build time (RA Л5).
 * Supported: `#`/`##`/`###` headings, paragraphs, `-`/`*` and `1.` lists, one pipe table, `>` quote (the draft
 * plate), `---`, inline `**bold**`, `*italic*` and `[text](/path | https://…)` links. No raw HTML: every character of
 * the source is escaped. `[ЮРИСТ: …]` notes (a bracket not followed by `(`) stay literal, marked with `<mark>`.
 */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]!);

export function inline(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const link = rest.match(/^\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/);
    if (link) {
      out += `<a href="${esc(link[2]!)}">${inline(link[1]!)}</a>`;
      i += link[0].length;
      continue;
    }
    const note = rest.match(/^\[(ЮРИСТ[^\]]*)\]/);
    if (note) {
      out += `<mark class="lawyer">[${esc(note[1]!)}]</mark>`;
      i += note[0].length;
      continue;
    }
    const bold = rest.match(/^\*\*(.+?)\*\*/);
    if (bold) {
      out += `<strong>${inline(bold[1]!)}</strong>`;
      i += bold[0].length;
      continue;
    }
    const em = rest.match(/^\*([^*\s][^*]*?)\*/);
    if (em) {
      out += `<em>${inline(em[1]!)}</em>`;
      i += em[0].length;
      continue;
    }
    out += esc(src[i]!);
    i++;
  }
  return out;
}

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  for (let i = 0; i < lines.length;) {
    const line = lines[i]!;
    const t = line.trim();
    if (!t) {
      flush();
      i++;
      continue;
    }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
      i++;
      continue;
    }
    if (/^-{3,}$/.test(t)) {
      flush();
      out.push("<hr>");
      i++;
      continue;
    }
    if (t.startsWith(">")) {
      flush();
      const q: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith(">")) q.push(lines[i++]!.trim().replace(/^>\s?/, ""));
      out.push(
        `<blockquote class="draft">${q
          .filter(Boolean)
          .map((x) => `<p>${inline(x)}</p>`)
          .join("")}</blockquote>`,
      );
      continue;
    }
    if (t.startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{3,}/)) {
      flush();
      const head = cells(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith("|")) rows.push(cells(lines[i++]!));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th scope="col">${inline(c)}</th>`).join("")}</tr></thead>` +
          `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`,
      );
      continue;
    }
    const ul = /^[-*]\s+/;
    const ol = /^\d+\.\s+/;
    if (ul.test(t) || ol.test(t)) {
      flush();
      const re = ul.test(t) ? ul : ol;
      const tag = re === ul ? "ul" : "ol";
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i]!.trim();
        if (re.test(l)) items.push(l.replace(re, ""));
        else if (l && /^\s{2,}/.test(lines[i]!) && items.length) items[items.length - 1] += ` ${l}`;
        else break;
        i++;
      }
      out.push(`<${tag}>${items.map((x) => `<li>${inline(x)}</li>`).join("")}</${tag}>`);
      continue;
    }
    para.push(t);
    i++;
  }
  flush();
  return out.join("\n");
}

/** Lawyer notes left in a text (warning-level check until the founder decides, CONTENT_REVIEW §8). */
export function lawyerNotes(md: string): number {
  return (md.match(/\[ЮРИСТ/g) ?? []).length;
}
