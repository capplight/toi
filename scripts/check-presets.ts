import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `content/invitation-presets.json` — ready invitation texts (decision А6, Ф3 review П1; spec — CONTENT_REVIEW §8):
 * `{ version, kk: { <kind>: [{ id, text }] }, ru: { … } }`. Rules: both languages, all six toi kinds with at least
 * one text each, unique ids, no `[ ] { } < >` in a text (no samples, no variables, no markup), ≤ 600 characters.
 * Run by `pnpm check:messages` (and therefore CI).
 */
export const PRESET_KINDS = ["uilenu_toi", "kyz_uzatu", "sundet", "besik", "merey", "other"] as const;
export const PRESET_LANGS = ["kk", "ru"] as const;
export type PresetFile = { version?: number } & Partial<Record<string, unknown>>;
export type PresetViolation = { rule: string; where: string; detail: string };

export function checkPresets(data: PresetFile): PresetViolation[] {
  const v: PresetViolation[] = [];
  const ids = new Set<string>();
  for (const lang of PRESET_LANGS) {
    const byKind = data[lang] as Record<string, { id?: string; text?: string }[]> | undefined;
    if (!byKind || typeof byKind !== "object") {
      v.push({ rule: "lang", where: lang, detail: "missing" });
      continue;
    }
    for (const kind of PRESET_KINDS) {
      const list = byKind[kind];
      if (!Array.isArray(list) || list.length === 0) {
        v.push({ rule: "kind", where: `${lang}/${kind}`, detail: "missing or empty" });
        continue;
      }
      for (const p of list) {
        const where = `${lang}/${kind}/${p.id ?? "?"}`;
        if (!p.id || ids.has(p.id)) v.push({ rule: "id", where, detail: "empty or duplicate id" });
        if (p.id) ids.add(p.id);
        if (typeof p.text !== "string" || !p.text.trim()) {
          v.push({ rule: "text", where, detail: "empty" });
          continue;
        }
        const bad = p.text.match(/[[\]{}<>]/g);
        if (bad)
          v.push({
            rule: "chars",
            where,
            detail: `forbidden ${[...new Set(bad)].join(" ")} (samples/variables/markup)`,
          });
        if (p.text.length > 600) v.push({ rule: "length", where, detail: `${p.text.length} > 600` });
      }
    }
    for (const k of Object.keys(byKind)) {
      if (!(PRESET_KINDS as readonly string[]).includes(k))
        v.push({ rule: "kind", where: `${lang}/${k}`, detail: "unknown kind" });
    }
  }
  return v;
}

export function main(file = "content/invitation-presets.json"): number {
  let data: PresetFile;
  try {
    data = JSON.parse(readFileSync(resolve(file), "utf8")) as PresetFile;
  } catch (err) {
    console.error(`check:presets: cannot read ${file}: ${(err as Error).message}`);
    return 1;
  }
  const v = checkPresets(data);
  if (v.length) {
    console.error(`check:presets: ${v.length} violation(s) in ${file}`);
    for (const x of v) console.error(`  [${x.rule}] ${x.where}: ${x.detail}`);
    return 1;
  }
  const n = PRESET_LANGS.reduce(
    (s, l) => s + Object.values((data[l] ?? {}) as Record<string, unknown[]>).reduce((a, x) => a + x.length, 0),
    0,
  );
  console.log(`check:presets: OK — ${n} texts, ${PRESET_KINDS.length} kinds × kk/ru, no samples, variables or markup`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("check-presets.ts")) {
  process.exit(main(process.argv[2]));
}
