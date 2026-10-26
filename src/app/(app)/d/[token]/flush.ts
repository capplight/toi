/**
 * Ф8 review П1: the door outbox goes to the server in batches of ≤ 200 operations (the API limit), oldest
 * `clientAt` first; every accepted batch is removed from the outbox at once, so a helper who was offline the whole
 * evening still gets everything through, and a failure mid-way keeps only the unsent rest.
 * Pure (no IndexedDB / fetch inside) — the caller passes `send` and `remove`.
 */
export const BATCH = 200;

export type FlushOp = { opId: string; clientAt: string };
export type SendResult<A> = { kind: "ok"; arrivals: A } | { kind: "revoked" } | { kind: "error" };

export async function flushOutbox<O extends FlushOp, A>(
  ops: O[],
  send: (batch: O[]) => Promise<SendResult<A>>,
  remove: (batch: O[]) => Promise<void>,
): Promise<{ sent: number; arrivals: A | null; revoked: boolean }> {
  const sorted = [...ops].sort((a, b) => a.clientAt.localeCompare(b.clientAt));
  let sent = 0;
  let arrivals: A | null = null;
  // an empty outbox still asks once: the answer carries the other devices' marks
  const batches = sorted.length ? ([] as O[][]) : [[] as O[]];
  for (let i = 0; i < sorted.length; i += BATCH) batches.push(sorted.slice(i, i + BATCH));
  for (const batch of batches) {
    const r = await send(batch);
    if (r.kind === "revoked") return { sent, arrivals, revoked: true };
    if (r.kind === "error") break;
    await remove(batch);
    sent += batch.length;
    arrivals = r.arrivals;
  }
  return { sent, arrivals, revoked: false };
}
