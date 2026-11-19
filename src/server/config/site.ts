import "server-only";

/**
 * Public origin for metadata: canonical URLs, sitemap, social cards and structured data. Unlike `siteUrl()` (used
 * for emailed links, which must fail loudly in production without SITE_URL), this never throws, so a build that
 * has no SITE_URL (CI, previews) still succeeds with a localhost origin instead of crashing.
 */
export function publicOrigin(): string {
  const configured = process.env["SITE_URL"];
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the default
    }
  }
  return "http://localhost:3000";
}
