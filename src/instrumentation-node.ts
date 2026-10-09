import { env, EnvError } from "@/server/env";

// Node.js runtime only (imported from instrumentation.ts).
// Fail fast at server start with a clear message naming the missing variable(s) — never values.
// Skipped during `next build`: env is checked at runtime, not baked into the build/image.
if (process.env.NEXT_PHASE !== "phase-production-build") {
  try {
    env();
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

await import("../sentry.server.config");
