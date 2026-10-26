"use client";

import { useEffect } from "react";

/**
 * The site's only client code (SITE_DESIGN §6.1 islands, merged into one delegated script to keep the bundle small):
 * copy with toast, WhatsApp text, tilek filter, sticky CTA, TOC highlight, menu close (Esc / link), print button,
 * table calculator, `locale` cookie on the language switch. Everything works without it: the server HTML is complete,
 * menu / TOC / FAQ / filter wrapper are `<details>`, WhatsApp links already carry the card URL.
 */
export type IslandTexts = { copied: string; toastCopied: string; toastFail: string; shown: string };

const $$ = <T extends Element = HTMLElement>(q: string, r: ParentNode = document) =>
  [...r.querySelectorAll<T>(q)] as T[];

export function SiteIsland({ texts }: { texts: IslandTexts }) {
  useEffect(() => {
    const ac = new AbortController();
    const on = <K extends keyof DocumentEventMap>(type: K, fn: (e: DocumentEventMap[K]) => void) =>
      document.addEventListener(type, fn as EventListener, { signal: ac.signal });

    /* toast */
    const toast = document.getElementById("toast");
    let tt: ReturnType<typeof setTimeout> | undefined;
    const showToast = (msg: string, ok: boolean) => {
      if (!toast) return;
      toast.querySelector(".msg")!.textContent = msg;
      toast.querySelector("use")?.setAttribute("href", ok ? "#i-check" : "#i-info");
      toast.hidden = false;
      clearTimeout(tt);
      tt = setTimeout(() => (toast.hidden = true), 3000);
    };

    const cardText = (el: Element) =>
      (el.closest(".tcard")?.querySelector<HTMLElement>(".tcard-text")?.innerText ?? "").trim();

    on("click", (e) => {
      const target = e.target as Element;
      const copy = target.closest<HTMLButtonElement>("[data-copy]");
      if (copy) {
        const text = cardText(copy);
        const done = () => {
          const card = copy.closest(".tcard");
          const label = copy.querySelector(".lbl")!;
          const old = label.textContent;
          copy.classList.add("is-copied");
          card?.classList.add("is-copied");
          copy.querySelector("use")?.setAttribute("href", "#i-check");
          label.textContent = texts.copied;
          showToast(texts.toastCopied, true);
          setTimeout(() => {
            copy.classList.remove("is-copied");
            card?.classList.remove("is-copied");
            copy.querySelector("use")?.setAttribute("href", "#i-copy");
            label.textContent = old;
          }, 2500);
        };
        if (!navigator.clipboard) showToast(texts.toastFail, false);
        else navigator.clipboard.writeText(text).then(done, () => showToast(texts.toastFail, false));
        return;
      }
      const wa = target.closest<HTMLAnchorElement>("[data-wa]");
      if (wa) {
        const link = decodeURIComponent(wa.href.split("text=")[1] ?? "")
          .split("\n")
          .pop();
        wa.href = "https://wa.me/?text=" + encodeURIComponent(cardText(wa) + "\n\n" + link);
        return;
      }
      const lang = target.closest<HTMLAnchorElement>("[data-lang]");
      if (lang) {
        document.cookie = `locale=${lang.dataset.lang}; path=/; max-age=31536000; samesite=lax`;
        return;
      }
      if (target.closest("[data-print]")) {
        window.print();
        return;
      }
      const menuLink = target.closest(".menu-panel a");
      if (menuLink) menuLink.closest("details")?.removeAttribute("open");
    });

    on("keydown", (e) => {
      if (e.key !== "Escape") return;
      const menu = document.querySelector<HTMLDetailsElement>("details[data-menu][open]");
      if (menu) {
        menu.open = false;
        menu.querySelector("summary")?.focus();
      }
    });

    /* tilek filter */
    const filter = document.querySelector<HTMLElement>("[data-filter]");
    if (filter) {
      const cards = $$(".tcard[data-who]");
      const total = cards.length;
      const sel: Record<string, string> = { who: "all", len: "all" };
      const out = document.querySelector("[data-filter-count]");
      const sum = document.querySelector("[data-filter-sum]");
      const apply = (touched: boolean) => {
        let n = 0;
        for (const c of cards) {
          const ok =
            (sel.who === "all" || (c.dataset.who ?? "").split(" ").includes(sel.who!)) &&
            (sel.len === "all" || c.dataset.len === sel.len);
          c.hidden = !ok;
          if (ok) n++;
        }
        for (const g of $$(".tilek-group")) g.hidden = !g.querySelector(".tcard:not([hidden])");
        const msg = texts.shown.replace("{shown}", String(n)).replace("{total}", String(total));
        if (out) out.textContent = touched ? msg : "";
        if (sum) sum.textContent = msg;
        const empty = document.querySelector<HTMLElement>("[data-empty]");
        if (empty) empty.hidden = n > 0;
      };
      on("click", (e) => {
        const chip = (e.target as Element).closest<HTMLButtonElement>("[data-f]");
        if (chip && filter.contains(chip)) {
          const [k, v] = chip.dataset.f!.split(":") as [string, string];
          sel[k] = v;
          for (const o of $$(`[data-f^="${k}:"]`, filter)) o.setAttribute("aria-pressed", String(o === chip));
          apply(true);
          return;
        }
        if ((e.target as Element).closest("[data-reset]")) {
          sel.who = sel.len = "all";
          for (const o of $$<HTMLElement>("[data-f]", filter))
            o.setAttribute("aria-pressed", String(o.dataset.f!.endsWith(":all")));
          apply(true);
        }
      });
      const wrap = filter.closest("details");
      if (wrap && matchMedia("(min-width: 1024px)").matches) wrap.open = true;
      apply(false);
    }

    /* calculator */
    const calc = document.querySelector<HTMLFormElement>("[data-calc]");
    if (calc) {
      const tpl = calc.querySelector("template")?.innerHTML ?? "";
      const run = () => {
        const g = Math.max(0, Number((calc.elements.namedItem("guests") as HTMLInputElement).value) || 0);
        const p = Number((calc.elements.namedItem("per") as HTMLSelectElement).value) || 10;
        const outEl = calc.querySelector("[data-calc-out]")!;
        const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);
        outEl.innerHTML = esc(tpl.replace(/&lt;b&gt;|&lt;\/b&gt;/g, (m) => (m.includes("/") ? "\u0001" : "\u0000")))
          .replace("{guests}", String(g))
          .replace("{per}", String(p))
          .replace("{tables}", String(Math.ceil(g / p)))
          .replace("\u0000", "<b>")
          .replace("\u0001", "</b>");
      };
      calc.addEventListener(
        "submit",
        (e) => {
          e.preventDefault();
          run();
        },
        { signal: ac.signal },
      );
      calc.addEventListener("input", run, { signal: ac.signal });
    }

    const observers: IntersectionObserver[] = [];
    if ("IntersectionObserver" in window) {
      /* TOC highlight */
      const links = $$<HTMLAnchorElement>('.article-aside .toc a[href^="#"]');
      if (links.length) {
        const map = new Map(links.map((a) => [a.getAttribute("href")!.slice(1), a]));
        const io = new IntersectionObserver(
          (es) =>
            es.forEach((en) => {
              if (!en.isIntersecting) return;
              links.forEach((a) => a.removeAttribute("aria-current"));
              map.get(en.target.id)?.setAttribute("aria-current", "true");
            }),
          { rootMargin: "-20% 0px -70% 0px" },
        );
        map.forEach((_, id) => {
          const el = document.getElementById(id);
          if (el) io.observe(el);
        });
        observers.push(io);
      }
      /* sticky CTA: visible when the hero CTA is gone, hidden near the banner / footer */
      const sticky = document.querySelector<HTMLElement>("[data-sticky]");
      if (sticky) {
        const vis = new Set<Element>();
        const io = new IntersectionObserver((es) => {
          es.forEach((en) => (en.isIntersecting ? vis.add(en.target) : vis.delete(en.target)));
          const hidden = vis.size > 0;
          sticky.classList.toggle("is-hidden", hidden);
          sticky.querySelector("a")?.setAttribute("tabindex", hidden ? "-1" : "0");
        });
        $$("[data-hero-cta], .cta-banner, .site-footer").forEach((w) => io.observe(w));
        observers.push(io);
      }
    }

    return () => {
      ac.abort();
      observers.forEach((o) => o.disconnect());
      clearTimeout(tt);
    };
  }, [texts]);
  return null;
}
