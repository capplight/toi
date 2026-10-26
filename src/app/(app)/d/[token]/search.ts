/**
 * Door search (Ф8, plan 8): on the device, by 2–3 letters, from the start of any word of the family name.
 * Lower case, «ё» = «е»; the match is returned for highlighting (original string positions).
 */
export type DoorMatch = { start: number; end: number };

const norm = (s: string) => s.toLocaleLowerCase("kk").replace(/ё/g, "е");

export function doorMatch(name: string, query: string): DoorMatch | null {
  const q = norm(query.trim());
  if (q.length < 2) return null;
  const n = norm(name);
  // word starts: position 0 and after any non-letter (space, hyphen, quote, bracket)
  for (let i = 0; i < n.length; i++) {
    const startOfWord = i === 0 || !/\p{L}|\p{N}/u.test(n[i - 1]!);
    if (startOfWord && n.startsWith(q, i)) return { start: i, end: i + q.length };
  }
  return null;
}
