// Vercel build entry (vercel.json buildCommand).
// Preview deployments: apply migrations to the PR's own Neon branch first (Neon ↔ Vercel integration
// sets DATABASE_URL_UNPOOLED per preview), then build. Production is built by deploy-prod.yml, which
// migrates before `vercel build`, so nothing is migrated here for production.
import { execSync } from "node:child_process";

const run = (cmd) => execSync(cmd, { stdio: "inherit" });
if (process.env.VERCEL_ENV === "preview") {
  if (process.env.DATABASE_URL_UNPOOLED) run("pnpm db:migrate");
  else console.warn("vercel-build: preview without DATABASE_URL_UNPOOLED — migrations skipped");
}
run("pnpm build");
