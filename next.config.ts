import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs/config";

// Plan 4.4 (7): standalone output so the same build runs on Vercel and in Docker.
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Several root layouts ((app), (site)/kk, (site)/ru) → one global 404 page (app/global-not-found.tsx, SEO-16).
  experimental: { globalNotFound: true },
  // Public site: content/site is read only while `next build` prerenders the pages — keep it out of the server bundle,
  // so a runtime read would fail loudly instead of silently working (e2e run against standalone).
  outputFileTracingExcludes: { "/*": ["./content/site/**"] },
  // ffmpeg-static resolves its binary next to its own file — keep it out of the bundle.
  serverExternalPackages: ["ffmpeg-static"],
  // Ф5: files read at runtime must be traced into the standalone output / Vercel functions.
  outputFileTracingIncludes: {
    "/i/[token]/opengraph-image": ["./src/server/invite/fonts/*"],
    "/api/media/finalize": ["./node_modules/ffmpeg-static/**"],
  },
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
