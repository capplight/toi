import type { MetadataRoute } from "next";
import { absolute } from "@/site/content/pages";
import { alternates, imagesOf, sitemapPages } from "@/site/seo";

/**
 * SEO-05: published public-site pages only (the publication gate in src/site/config.ts keeps unpublished, noindex and
 * «soon» pages out), with hreflang alternates for published pairs and template/hall images (SEO-18).
 * `lastModified` only from frontmatter `updated` — never the build time.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPages().map((p) => {
    const languages = alternates(p);
    const images = imagesOf(p);
    return {
      url: absolute(p.url),
      ...(p.doc.fm.updated ? { lastModified: p.doc.fm.updated } : {}),
      ...(languages ? { alternates: { languages } } : {}),
      ...(images.length ? { images } : {}),
    };
  });
}
