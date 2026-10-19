/**
 * Duplicate guests by name (plan 7.7) — port of `nameKey` / `similar` / `dupPairs` from the prototype.
 * Compares the first meaningful word; honorifics and kinship words are stop words.
 * Phone duplicates are a hard block elsewhere (unique index, Ф4).
 */
export const NAME_STOP_WORDS: ReadonlySet<string> = new Set([
  "ағай",
  "апай",
  "отбасы",
  "құда",
  "құдағи",
  "нағашы",
  "мен",
  "әже",
  "ата",
]);

export function nameKey(name: string | null | undefined): string {
  const words = String(name ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s,.;:«»"!?]+/)
    .filter((w) => w && !NAME_STOP_WORDS.has(w));
  return words[0] ?? "";
}

export function similar(a: string, b: string): boolean {
  const ka = nameKey(a);
  return ka !== "" && ka === nameKey(b);
}

/** Order-independent key of a pair (stored in `duplicate_reviews` when a pair is marked «different people»). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export type DupCandidate = { id: string; name: string; rsvp: "yes" | "no" | "pending"; tableNo: number | null };

/**
 * Pairs of similar names among families that did not decline, minus reviewed pairs.
 * Inside a pair the family with the smaller table number comes first (unseated last).
 */
export function dupPairs<T extends DupCandidate>(
  families: readonly T[],
  reviewed: ReadonlySet<string> = new Set(),
): [T, T][] {
  const fs = families.filter((f) => f.rsvp !== "no");
  const keys = fs.map((f) => nameKey(f.name));
  const out: [T, T][] = [];
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      const a = fs[i]!;
      const b = fs[j]!;
      if (keys[i] && keys[i] === keys[j] && !reviewed.has(pairKey(a.id, b.id))) {
        out.push((a.tableNo ?? 999) <= (b.tableNo ?? 999) ? [a, b] : [b, a]);
      }
    }
  }
  return out;
}
