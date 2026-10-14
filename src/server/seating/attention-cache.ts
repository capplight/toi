/**
 * In-memory cache of the «Зал» red dot per event (Ф7b review П1): the answer only changes with `seating_version`,
 * except reviewed duplicate pairs, which invalidate it explicitly. Bounded; per server process.
 */
const cache = new Map<string, { version: number; value: boolean }>();
const MAX = 1000;

export function cachedAttention(eventId: string, version: number): boolean | undefined {
  const hit = cache.get(eventId);
  return hit && hit.version === version ? hit.value : undefined;
}

export function storeAttention(eventId: string, version: number, value: boolean): void {
  if (!cache.has(eventId) && cache.size >= MAX) cache.delete(cache.keys().next().value!);
  cache.set(eventId, { version, value });
}

export function invalidateHallAttention(eventId: string): void {
  cache.delete(eventId);
}
