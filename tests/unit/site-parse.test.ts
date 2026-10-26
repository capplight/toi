import { describe, expect, it } from "vitest";
import { parseInline, plain, slugify } from "@/site/content/inline";
import { type Node, parseDocument } from "@/site/content/parse";
import { allPages, getPage, templateOf } from "@/site/content/pages";

const doc = (body: string, fm = "url: /kk/x\ntitle: T\ndescription: D\nh1: H") =>
  parseDocument(`---\n${fm}\n---\n# H\n\nIntro.\n\n## Бөлім\n\n${body}`);
const kinds = (nodes: Node[]) => nodes.slice(1).map((n) => n.t);

describe("site markdown: inline", () => {
  it("parses links, strong, em, placeholders and drops spaces left by comments", () => {
    const c = parseInline("**Бір** *екі* [үш](/kk/a) {BRAND} сөз .");
    expect(c.map((n) => n.t)).toEqual(["strong", "text", "em", "text", "link", "text", "ph", "text"]);
    expect(plain(c, (n) => (n === "BRAND" ? "Той" : n))).toBe("Бір екі үш Той сөз.");
  });
  it("marks [fields] only in invitation texts", () => {
    expect(parseInline("қызымыз [есімі] тойы", { fill: true }).some((n) => n.t === "fill")).toBe(true);
    expect(parseInline("қызымыз [есімі] тойы").some((n) => n.t === "fill")).toBe(false);
  });
  it("transliterates heading ids like the designer's generator", () => {
    expect(slugify("Қысқа тілектер")).toBe("qysqa-tilekter");
    expect(slugify("Тілекті қалай айту керек")).toBe("tilekti-qalai-aitu-kerek");
  });
});

describe("site markdown: blocks", () => {
  it("drops HIDDEN, TODO, S# and EDITOR comments from the output", () => {
    const d = doc(
      "Мәтін. <!-- S1 S2 -->\n\n<!-- HIDDEN until:\n## Жасырын\nTODO\n-->\n\n<!-- TODO: x --> <!-- EDITOR: y -->\nСоңы.",
    );
    const text = JSON.stringify(d.body);
    expect(text).not.toMatch(/Жасырын|TODO|EDITOR|S1/);
    expect(kinds(d.body)).toEqual(["p", "p"]);
  });

  it("turns «Біздің кеңес» quotes into tips and the sources section into a list", () => {
    const d = doc(
      "> **Біздің кеңес.** Ерте бастаңыз.\n\n## Дереккөздер\n\n- ЮНЕСКО, 2024 — https://ich.unesco.org/x\n- Кітап",
    );
    expect(kinds(d.body)).toEqual(["tip", "sources"]);
    const src = d.body[2] as Extract<Node, { t: "sources" }>;
    expect(src.items[0]!.url).toBe("https://ich.unesco.org/x");
    expect(src.items[1]!.url).toBeUndefined();
  });

  it("reads tilek lists: groups, length, poem, folk, «(атасынан)» label, nested callout", () => {
    const d = doc(
      [
        "<!-- BLOCK: tilek-list -->",
        "## Сүндет тойға тілек: балаға",
        "**1.** *қысқа* — Азамат бол. <!-- original -->",
        "<!-- BLOCK: callout tip -->",
        "> **Біздің кеңес.** Қысқа айтыңыз.",
        "<!-- /BLOCK -->",
        "**2.** *орташа* — (атасынан)<br>\nБірінші жол,<br>\nекінші жол. <!-- folk S33 -->",
        "## Қысқа тілектер",
        "**3.** *ұзақ* — Ұзақ тілек.",
        "<!-- /BLOCK -->",
        "## Кейін",
      ].join("\n\n"),
    );
    expect(kinds(d.body)).toEqual(["tileks", "h"]);
    const t = d.body[1] as Extract<Node, { t: "tileks" }>;
    expect(t.groups.map((g) => [g.id, g.format, g.label])).toEqual([
      ["balaga", false, "Балаға"],
      ["qysqa", true, "Қысқа тілектер"],
    ]);
    const cards = t.groups.flatMap((g) => g.items.filter((x) => x.t === "tilek"));
    expect(cards).toHaveLength(3);
    expect(cards[1]).toMatchObject({ no: 2, len: "ortasha", poem: true, folk: true, from: "атасынан", who: "balaga" });
    expect(cards[2]).toMatchObject({ who: "" });
    expect(t.groups[0]!.items.some((x) => x.t === "node")).toBe(true);
  });

  it("reads FAQ with and without an end marker; HIDDEN questions are not included", () => {
    const kk = doc(
      "<!-- BLOCK: faq -->\n### С1?\n\nЖ1.\n\n<!-- HIDDEN:\n### Жасырын?\nTODO\n-->\n### С2?\n\nЖ2.\n<!-- /BLOCK -->\n\nСоңы [бет](/kk).",
    );
    const f = kk.body[1] as Extract<Node, { t: "faq" }>;
    expect(f.groups[0]!.items.map((i) => plain(i.q))).toEqual(["С1?", "С2?"]);
    expect(kinds(kk.body)).toEqual(["faq", "p"]);
    const ru = doc(
      '<!-- BLOCK: Faq -->\n### В1?\n\nО1.\n\n### В2?\n\nО2.\n\nВсё — на странице [«Как работает»](/ru).\n\n<!-- BLOCK: CTA primary "Создать" href="/e/new" -->',
    );
    const fr = ru.body[1] as Extract<Node, { t: "faq" }>;
    expect(fr.groups[0]!.items).toHaveLength(2);
    expect(kinds(ru.body)).toEqual(["faq", "p", "ctas"]);
  });

  it("reads CTA markers of both syntaxes", () => {
    const d = doc(
      '<!-- BLOCK: cta href="/e/new?kind=sundet" text="Шақыру жасау" -->\n<!-- BLOCK: cta-secondary href="/kk/shaqyru/ulgi/ak-shanyraq" text="Демоны ашу" -->\n\n<!-- BLOCK: CTA primary "Создать" href="/e/new" -->',
    );
    const c = d.body[1] as Extract<Node, { t: "ctas" }>;
    expect(c.items).toEqual([
      { text: "Шақыру жасау", href: "/e/new?kind=sundet", variant: "primary", action: undefined },
      { text: "Демоны ашу", href: "/kk/shaqyru/ulgi/ak-shanyraq", variant: "secondary", action: undefined },
      { text: "Создать", href: "/e/new", variant: "primary", action: undefined },
    ]);
  });
});

describe("site index (content/site) and publication gate", () => {
  const pages = allPages();
  it("loads every content page with a unique url and the soon stubs", () => {
    expect(pages.size).toBeGreaterThanOrEqual(61);
    expect(getPage("/kk/baga")?.template).toBe("soon");
    expect(templateOf("/kk/tilekter/sundet-toi")).toBe("tilek");
    expect(templateOf("/ru/priglashenie/shablon/kok-tun")).toBe("demo");
  });
  it("hides needs_fix and unsigned tradition pages, publishes edited ones", () => {
    expect(getPage("/kk/shaqyru")!.reasons).toContain("status: needs_fix");
    expect(getPage("/kk/dastur/betashar")!.reasons).toContain("needs_tradition_review");
    expect(getPage("/kk/tilekter/sundet-toi")!.published).toBe(true);
    expect(getPage("/kk/baga")!.published).toBe(false);
  });
  it("pairs hreflang symmetrically and only between published pages", () => {
    expect(getPage("/kk")!.pair).toBe("/ru");
    expect(getPage("/ru")!.pair).toBe("/kk");
    // /kk/dastur/betashar ↔ /ru/traditsii/betashar is declared but both sides are gated
    expect(getPage("/ru/traditsii/betashar")!.pairDeclared).toBe("/kk/dastur/betashar");
    expect(getPage("/ru/traditsii/betashar")!.pair).toBeUndefined();
  });
});
