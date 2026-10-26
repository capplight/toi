import { Fragment, type ReactNode } from "react";
import { SITE_CONFIG } from "../config";
import type { Inline } from "../content/inline";
import { linkTarget } from "../content/pages";
import type { Ctx } from "./ctx";

/** Inline nodes → React. Links to unpublished/unknown site pages render as plain text (publication gate). */
export function Inl({ c, ctx }: { c: Inline[]; ctx: Ctx }): ReactNode {
  return c.map((n, i) => <Fragment key={i}>{one(n, ctx)}</Fragment>);
}

function one(n: Inline, ctx: Ctx): ReactNode {
  switch (n.t) {
    case "text":
      return n.v;
    case "br":
      return <br />;
    case "strong":
      return (
        <strong>
          <Inl c={n.c} ctx={ctx} />
        </strong>
      );
    case "em":
      return (
        <span className="em">
          <Inl c={n.c} ctx={ctx} />
        </span>
      );
    case "anchor":
      return <a id={n.id} />;
    case "fill":
      return <span className="fill">[{n.v}]</span>;
    case "ph":
      return <Ph name={n.name} ctx={ctx} />;
    case "link": {
      const target = linkTarget(n.href);
      const inner = <Inl c={n.c} ctx={ctx} />;
      if (!target.ok) return <span className="link-off">{inner}</span>;
      if (target.kind === "external")
        return (
          <a href={n.href} rel="noopener" target="_blank">
            {inner}
          </a>
        );
      return <a href={n.href}>{inner}</a>;
    }
  }
}

export function Ph({ name, ctx }: { name: string; ctx: Ctx }) {
  const v = SITE_CONFIG.placeholders[name];
  if (v) return <>{v}</>;
  if (name === "PRICE" || name === "FREE") return <span className="soon-badge">{ctx.t("site.soon")}</span>;
  return <span className="ph">{`{${name}}`}</span>;
}
