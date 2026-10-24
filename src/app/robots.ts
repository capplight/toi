import type { MetadataRoute } from "next";

/**
 * SEO-01 (docs/seo/SEO_PLAN.md §5.2): pilot and preview hosts (`*.vercel.app`) are also closed by the
 * `X-Robots-Tag: noindex, nofollow` header in vercel.json. Private routes are not blocked here on purpose:
 * crawlers must be able to fetch them to see their noindex. Host-specific rules and sitemaps come with SEO-05.
 */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }] };
}
