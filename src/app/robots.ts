import type { MetadataRoute } from "next";
import { absolute } from "@/site/content/pages";

/**
 * SEO-01 (docs/seo/SEO_PLAN.md §5.2): pilot and preview hosts (`*.vercel.app`) are also closed by the
 * `X-Robots-Tag: noindex, nofollow` header in vercel.json — that header stays the gate for the pilot host. Private
 * routes are not blocked here on purpose: crawlers must be able to fetch them to see their noindex.
 * SEO-05: the sitemap of the public site (`SITE_URL`, falls back to `APP_URL`). Host-specific rules come with the domain.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/" }], sitemap: absolute("/sitemap.xml") };
}
