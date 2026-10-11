/**
 * Ф5 guest page templating (brief §2, spike result in the handover): tagged template literals with mandatory
 * escaping. Every interpolated value is escaped unless it is a `SafeHtml` — produced only by `html` itself or by
 * `raw()` for the designer's static SVG/CSS (generated from the mockups, never from user data).
 */
export class SafeHtml {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

type Value = SafeHtml | string | number | boolean | null | undefined | Value[];

function render(v: Value): string {
  if (v === null || v === undefined || v === false || v === true) return "";
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(render).join("");
  return escapeHtml(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Value[]): SafeHtml {
  let out = strings[0]!;
  for (let i = 0; i < values.length; i++) out += render(values[i]!) + strings[i + 1]!;
  return new SafeHtml(out);
}

/** Trusted static markup only (generated design assets, our own constants). */
export function raw(s: string): SafeHtml {
  return new SafeHtml(s);
}

/** Attribute value: escaped string (use inside quotes: `attr="${x}"`). Same as plain interpolation; for clarity. */
export const attr = (s: string | number) => escapeHtml(String(s));
