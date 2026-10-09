import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// Plan 11.1: src/domain is pure TypeScript — no framework, UI, server or DB imports.
const domainForbidden = [
  { group: ["next", "next/*"], message: "src/domain is pure TS: no Next.js (plan 11.1)." },
  { group: ["react", "react/*", "react-dom", "react-dom/*"], message: "src/domain is pure TS: no React (plan 11.1)." },
  { group: ["@/server", "@/server/*"], message: "src/domain must not import server code (plan 11.1)." },
  { group: ["@/ui", "@/ui/*"], message: "src/domain must not import UI code (plan 11.1)." },
  {
    group: ["drizzle-orm", "drizzle-orm/*", "pg", "pg/*", "@neondatabase/*"],
    message: "src/domain has no DB access (plan 11.1).",
  },
  {
    group: ["../server/*", "../../server/*", "../ui/*", "../../ui/*"],
    message: "src/domain must not import server/UI code (plan 11.1).",
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/domain/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: domainForbidden }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Documents and static mockups are not app code.
    "prototype/**",
    "design/**",
    "research/**",
    "architecture/**",
    "content/**",
    "docs/**",
  ]),
]);
