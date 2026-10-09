import { loadEnvConfig } from "@next/env";
import { defineConfig } from "drizzle-kit";

// Same .env.local loading as Next.js (values are not printed).
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL_UNPOOLED;
if (!url) {
  throw new Error(
    "drizzle-kit: DATABASE_URL_UNPOOLED (direct connection for migrations) is not set. See .env.example.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/schema.ts",
  out: "./db/migrations",
  dbCredentials: { url },
  strict: true,
  verbose: false,
});
