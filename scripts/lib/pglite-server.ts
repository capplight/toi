/**
 * Postgres-compatible local server on PGlite (WASM Postgres) — no Docker needed (the founder's machine
 * has none). Used by `pnpm db:local` and by integration tests. NOT for production: CI and preview use
 * real PostgreSQL 16 / Neon.
 */
import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

export type LocalPg = { url: string; port: number; stop: () => Promise<void> };

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => (typeof addr === "object" && addr ? resolve(addr.port) : reject(new Error("no port"))));
    });
  });
}

export async function startLocalPg(opts: { port?: number; dataDir?: string } = {}): Promise<LocalPg> {
  const port = opts.port ?? (await freePort());
  const db = await PGlite.create({ dataDir: opts.dataDir, extensions: { pgcrypto } });
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 50 });
  await server.start();
  return {
    port,
    url: `postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}
