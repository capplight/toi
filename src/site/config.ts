/**
 * Public SEO site (`/kk/**`, `/ru/**`) — the ONE place the founder switches publication and placeholders.
 * Read only at build time (pages are static), so a change needs a rebuild/deploy.
 */

export const SITE_CONFIG = {
  /**
   * Publication gate (docs/phases/SITE-handover.md «Решения»). An unpublished page still opens by its URL for review,
   * but gets `noindex`, stays out of sitemap.xml, the menu, tiles and related cards, and links to it render as text.
   */
  gate: {
    /** frontmatter `status: needs_fix` → not published. */
    hideNeedsFix: true,
    /** frontmatter `needs_tradition_review: true` without a reviewer signature (`reviewedBy`) → not published. */
    hideUntilTraditionReview: true,
    /** Unresolved placeholders in the text (`{REVIEWER}`, `{EMAIL}`, … — see `placeholders` below) → not published. */
    hideWithOpenPlaceholders: true,
    /** Force-publish single URLs after a manual check (e.g. "/kk/dastur/betashar"). */
    alwaysPublish: [] as string[],
    /** Force-hide single URLs. */
    neverPublish: [] as string[],
  },

  /**
   * Placeholders in content/site markdown. `null` = not decided yet:
   * `{PRICE}` / `{FREE}` render as the «жақында / скоро» badge, the others make the page unpublishable (see gate).
   * `{BRAND}` — temporary display name until the brand is chosen (SEO_PLAN О1): change it here only.
   */
  placeholders: {
    BRAND: "Той",
    FREE: null,
    PRICE: null,
    REVIEWER: null,
    REVIEW_DATE: null,
    UPDATED: null,
    EMAIL: null,
    SUPPORT_WHATSAPP: null,
    SUPPORT_HOURS: null,
  } as Record<string, string | null>,

  /** Fallback origin for canonical / hreflang / sitemap when neither SITE_URL nor APP_URL is set at build time. */
  fallbackOrigin: "http://localhost:3000",
} as const;

/** Placeholders that may stay open: they render as a «soon» badge instead of blocking publication. */
export const SOFT_PLACEHOLDERS = new Set(["PRICE", "FREE"]);
