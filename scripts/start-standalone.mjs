// Ф0 review Н6: e2e run against the standalone server (what ships in Docker), not `next start`.
// Copies .next/static and public into .next/standalone and starts server.js (PORT from env).
import { cpSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";

const root = ".next/standalone";
if (!existsSync(`${root}/server.js`)) {
  console.error("start-standalone: run `pnpm build` first (.next/standalone/server.js not found)");
  process.exit(1);
}
cpSync(".next/static", `${root}/.next/static`, { recursive: true });
if (existsSync("public")) cpSync("public", `${root}/public`, { recursive: true });
const child = spawn(process.execPath, ["server.js"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, HOSTNAME: process.env.HOSTNAME ?? "0.0.0.0" },
});
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
