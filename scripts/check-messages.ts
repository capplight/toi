/**
 * CI check of UI texts (CONTENT_REVIEW.md sections 3 and 6.12, plan 11.1).
 *
 *   pnpm check:messages [--dir content/messages]
 *
 * Checks:
 *  1. the same key set in _keys.json, kk.json, ru.json;
 *  2. no empty values (kk, ru);
 *  3. every message passes ICU parsing;
 *  4. per key, kk ↔ ru have the same variables AND the same rich-text tags;
 *  5. every `select` has an `other` branch;
 *  6. every ru `plural` has `one`, `few`, `many`, `other`.
 * Exit code 1 and a list of violations on failure.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

export type Messages = Record<string, unknown>;
export type Violation = { rule: string; key: string; detail: string };

const RU_PLURAL_FORMS = ["one", "few", "many", "other"] as const;

export function flatten(obj: Messages, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) flatten(v as Messages, key, out);
    else out[key] = v;
  }
  return out;
}

type Analysis = {
  variables: Set<string>;
  tags: Set<string>;
  selectsWithoutOther: string[];
  plurals: { name: string; forms: string[] }[];
};

function analyse(elements: MessageFormatElement[], acc: Analysis): Analysis {
  for (const el of elements) {
    switch (el.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        acc.variables.add(el.value);
        break;
      case TYPE.select:
        acc.variables.add(el.value);
        if (!("other" in el.options)) acc.selectsWithoutOther.push(el.value);
        for (const opt of Object.values(el.options)) analyse(opt.value, acc);
        break;
      case TYPE.plural:
        acc.variables.add(el.value);
        if (el.pluralType === "cardinal") acc.plurals.push({ name: el.value, forms: Object.keys(el.options) });
        for (const opt of Object.values(el.options)) analyse(opt.value, acc);
        break;
      case TYPE.tag:
        acc.tags.add(el.value);
        analyse(el.children, acc);
        break;
      default:
        break; // literal, pound
    }
  }
  return acc;
}

const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const fmt = (s: Set<string>) => `{${[...s].sort().join(", ")}}`;

export function checkMessages(input: { keys: Messages; kk: Messages; ru: Messages }): Violation[] {
  const v: Violation[] = [];
  const files = { "_keys.json": flatten(input.keys), "kk.json": flatten(input.kk), "ru.json": flatten(input.ru) };

  // 1. Same key sets.
  const all = new Set(Object.values(files).flatMap((f) => Object.keys(f)));
  for (const key of all) {
    for (const [file, flat] of Object.entries(files)) {
      if (!(key in flat)) v.push({ rule: "keys", key, detail: `missing in ${file}` });
    }
  }

  const parsed: Record<"kk" | "ru", Record<string, Analysis>> = { kk: {}, ru: {} };
  for (const lang of ["kk", "ru"] as const) {
    const flat = files[`${lang}.json`];
    for (const [key, value] of Object.entries(flat)) {
      // 2. Non-empty strings.
      if (typeof value !== "string") {
        v.push({ rule: "type", key, detail: `${lang}: value is not a string` });
        continue;
      }
      if (value.trim() === "") {
        v.push({ rule: "empty", key, detail: `${lang}: empty value` });
        continue;
      }
      // 3. ICU parsing.
      let ast: MessageFormatElement[];
      try {
        ast = parse(value, { requiresOtherClause: false });
      } catch (err) {
        v.push({ rule: "icu", key, detail: `${lang}: ${(err as Error).message}` });
        continue;
      }
      const a = analyse(ast, { variables: new Set(), tags: new Set(), selectsWithoutOther: [], plurals: [] });
      parsed[lang][key] = a;
      // 5. select needs `other`.
      for (const s of a.selectsWithoutOther)
        v.push({ rule: "select-other", key, detail: `${lang}: {${s}, select} has no "other"` });
      // 6. ru plural completeness.
      if (lang === "ru") {
        for (const p of a.plurals) {
          const missing = RU_PLURAL_FORMS.filter((f) => !p.forms.includes(f));
          if (missing.length)
            v.push({ rule: "ru-plural", key, detail: `{${p.name}, plural} is missing ${missing.join(", ")}` });
        }
      }
    }
  }

  // 4. Variables and tags match kk ↔ ru.
  for (const [key, kk] of Object.entries(parsed.kk)) {
    const ru = parsed.ru[key];
    if (!ru) continue;
    if (!sameSet(kk.variables, ru.variables)) {
      v.push({ rule: "variables", key, detail: `kk ${fmt(kk.variables)} ≠ ru ${fmt(ru.variables)}` });
    }
    if (!sameSet(kk.tags, ru.tags)) {
      v.push({ rule: "tags", key, detail: `kk <${[...kk.tags].join(">, <")}> ≠ ru <${[...ru.tags].join(">, <")}>` });
    }
  }
  return v;
}

export function loadDir(dir: string) {
  const read = (f: string) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as Messages;
  return { keys: read("_keys.json"), kk: read("kk.json"), ru: read("ru.json") };
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const i = argv.indexOf("--dir");
  const dir = resolve(i >= 0 && argv[i + 1] ? argv[i + 1]! : "content/messages");
  let input: ReturnType<typeof loadDir>;
  try {
    input = loadDir(dir);
  } catch (err) {
    console.error(`check:messages: cannot read messages in ${dir}: ${(err as Error).message}`);
    return 1;
  }
  const violations = checkMessages(input);
  const keyCount = Object.keys(flatten(input.keys)).length;
  if (violations.length) {
    console.error(`check:messages: ${violations.length} violation(s) in ${dir} (${keyCount} keys)`);
    for (const x of violations) console.error(`  [${x.rule}] ${x.key}: ${x.detail}`);
    return 1;
  }
  console.log(`check:messages: OK — ${keyCount} keys, kk/ru: ICU, variables, tags, select/other, ru plural forms`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]).endsWith("check-messages.ts")) {
  process.exit(main());
}
