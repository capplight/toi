import { describe, expect, it } from "vitest";
import { BATCH, flushOutbox } from "@/app/d/[token]/flush";

const op = (i: number) => ({ opId: `op-${i}`, clientAt: new Date(Date.UTC(2026, 10, 15, 13, 0, i)).toISOString() });

describe("Ф8 review П1: door outbox in batches", () => {
  it("250 operations → 200 + 50, oldest first; every accepted batch leaves the outbox; the server keeps all", async () => {
    const server: string[] = [];
    let outbox = Array.from({ length: 250 }, (_, i) => op(249 - i)); // stored newest first
    const sizes: number[] = [];
    const r = await flushOutbox(
      outbox,
      async (batch) => {
        if (batch.length > BATCH) return { kind: "error" as const }; // the API refuses > 200 (400)
        sizes.push(batch.length);
        server.push(...batch.map((b) => b.opId));
        return { kind: "ok" as const, arrivals: server.length };
      },
      async (batch) => {
        const ids = new Set(batch.map((b) => b.opId));
        outbox = outbox.filter((o) => !ids.has(o.opId));
      },
    );
    expect(sizes).toEqual([200, 50]);
    expect(r).toEqual({ sent: 250, arrivals: 250, revoked: false });
    expect(outbox).toEqual([]);
    expect(server[0]).toBe("op-0");
    expect(server.at(-1)).toBe("op-249");
  });

  it("an error mid-way keeps only the unsent rest; revoked stops; an empty outbox still asks once", async () => {
    let outbox = Array.from({ length: 450 }, (_, i) => op(i));
    let calls = 0;
    const r = await flushOutbox(
      outbox,
      async () => (++calls === 2 ? { kind: "error" as const } : { kind: "ok" as const, arrivals: calls }),
      async (batch) => {
        const ids = new Set(batch.map((b) => b.opId));
        outbox = outbox.filter((o) => !ids.has(o.opId));
      },
    );
    expect(r.sent).toBe(200);
    expect(outbox).toHaveLength(250);
    expect(outbox[0]!.opId).toBe("op-200");

    const revoked = await flushOutbox(
      [op(1)],
      async () => ({ kind: "revoked" as const }),
      async () => {},
    );
    expect(revoked.revoked).toBe(true);

    let asked = 0;
    const empty = await flushOutbox(
      [],
      async (b) => {
        asked++;
        expect(b).toEqual([]);
        return { kind: "ok" as const, arrivals: "x" };
      },
      async () => {},
    );
    expect(asked).toBe(1);
    expect(empty.arrivals).toBe("x");
  });
});
