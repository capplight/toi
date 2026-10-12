import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inline, lawyerNotes, markdownToHtml } from "../../scripts/lib/legal-markdown";

describe("RA Л5: legal Markdown subset → HTML", () => {
  it("headings, quote plate, lists, table, links; [ЮРИСТ …] stays literal; everything escaped", () => {
    const html = markdownToHtml(
      [
        "# Саясат",
        "",
        "> **ЖОБА** — черновик",
        "",
        "## Қысқаша",
        "",
        "- бір <b>",
        "- екі [ЮРИСТ: кім?]",
        "",
        "| A | B |",
        "|---|---|",
        "| x | [Құпиялылық](/privacy) |",
        "",
        "Мәтін",
        "жалғасы & соңы.",
      ].join("\n"),
    );
    expect(html).toContain("<h1>Саясат</h1>");
    expect(html).toContain('<blockquote class="draft"><p><strong>ЖОБА</strong> — черновик</p></blockquote>');
    expect(html).toContain("<li>бір &lt;b&gt;</li>");
    expect(html).toContain('<mark class="lawyer">[ЮРИСТ: кім?]</mark>');
    expect(html).toContain('<th scope="col">A</th>');
    expect(html).toContain('<a href="/privacy">Құпиялылық</a>');
    expect(html).toContain("<p>Мәтін жалғасы &amp; соңы.</p>");
    expect(html).not.toMatch(/<b>/);
  });

  it("links only to site paths or https; no javascript:", () => {
    expect(inline("[x](javascript:alert(1))")).not.toContain("<a");
    expect(inline("[x](https://example.kz)")).toBe('<a href="https://example.kz">x</a>');
  });

  it("the four drafts convert; [ЮРИСТ notes are counted (warning-level check)", () => {
    for (const f of ["privacy.kk", "privacy.ru", "terms.kk", "terms.ru"]) {
      const md = readFileSync(resolve(process.cwd(), `content/legal/${f}.md`), "utf8");
      const html = markdownToHtml(md);
      expect(html.startsWith("<h1>")).toBe(true);
      expect(html).toContain('<blockquote class="draft">');
      expect(lawyerNotes(md)).toBeGreaterThan(0);
    }
  });
});
