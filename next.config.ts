import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

// Plan 4.4 (7): standalone output so the same build runs on Vercel and in Docker.
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Sentry: build-time wrapper only. Runtime init is skipped when no DSN is set
// (see sentry.*.config.ts). Source maps are uploaded only when SENTRY_AUTH_TOKEN exists (CI).
export default withSentryConfig(withNextIntl(nextConfig), {
  silent: true,
  telemetry: false,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
