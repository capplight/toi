/**
 * Site icon sprite (Lucide ISC; WhatsApp — Simple Icons CC0; ornaments from DESIGN_v2) — the mockup's
 * design/v2/site/js/site.js sprite rendered on the server, once per page.
 */
const I: Record<string, string> = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  quote:
    '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 0-1 1v3c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .75-2 2v6c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  printer:
    '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  offline:
    '<path d="M12 20h.01"/><path d="M8.5 16.43a5 5 0 0 1 7 0"/><path d="M2 8.82a15 15 0 0 1 4.18-2.64"/><path d="M22 8.82a15 15 0 0 0-11.29-3.76"/><path d="m2 2 20 20"/>',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/>',
};
const WA =
  '<path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.26-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.22 1.36.19 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.18-1.41-.08-.13-.27-.2-.57-.35m-5.42 7.4h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88m8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.24-6.17-3.48-8.41z"/>';

const SHANYRAQ =
  '<circle r="40"/><circle r="34"/><path d="M-13 -31.4 Q-18 0 -13 31.4 M13 -31.4 Q18 0 13 31.4 M-31.4 -13 Q0 -18 31.4 -13 M-31.4 13 Q0 18 31.4 13"/>' +
  Array.from({ length: 32 }, (_, i) => {
    const a = (i * Math.PI) / 16;
    const r1 = 45;
    const r2 = i % 2 ? 54 : 62;
    return `<path d="M${(r1 * Math.cos(a)).toFixed(2)} ${(r1 * Math.sin(a)).toFixed(2)} L${(r2 * Math.cos(a)).toFixed(2)} ${(r2 * Math.sin(a)).toFixed(2)}"/>`;
  }).join("");
const KOSHKAR =
  '<path d="M-28 0 H-12 M12 0 H28"/><path d="M0 4 C-3 -6 -16 -8 -16 1 C-16 7 -9 8 -7 3 M0 4 C3 -6 16 -8 16 1 C16 7 9 8 7 3"/>';

const SPRITE =
  Object.entries(I)
    .map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`)
    .join("") +
  `<symbol id="i-wa" viewBox="0 0 24 24">${WA}</symbol>` +
  `<symbol id="o-shanyraq" viewBox="-64 -64 128 128">${SHANYRAQ}</symbol>` +
  `<symbol id="o-koshkar" viewBox="-30 -12 60 24">${KOSHKAR}</symbol>`;

export function Sprite() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "none" }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: SPRITE }}
    />
  );
}

export type IconName = keyof typeof I | "wa";

export function Ico({ name, cls = "ico" }: { name: IconName; cls?: string }) {
  return (
    <svg className={cls} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function Orn({ name, cls }: { name: "shanyraq" | "koshkar"; cls?: string }) {
  return (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden="true">
      <use href={`#o-${name}`} />
    </svg>
  );
}
