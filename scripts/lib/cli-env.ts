import nextEnv from "@next/env"; // CJS package: no named ESM exports

/** Load .env / .env.local like Next.js does (values are never printed). */
export function loadEnv(): void {
  nextEnv.loadEnvConfig(process.cwd(), false, { info: () => {}, error: console.error });
}
