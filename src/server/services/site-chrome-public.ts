import "server-only";

import { unstable_cache } from "next/cache";

import { DEFAULT_CHROME, type SiteChrome } from "@/lib/site-chrome";
import { logger } from "@/server/logger";

import { readPublishedChrome } from "./site-chrome";

export const SITE_CHROME_TAG = "site-chrome";

/** A failed read throws inside the cache so a fallback is never stored (and served for an hour). */
const cached = unstable_cache(readPublishedChrome, ["site-chrome-v1"], {
  tags: [SITE_CHROME_TAG],
  revalidate: 3600,
});

/**
 * The header/footer content for every storefront page. Cached in Next's data cache (so even server-rendered pages
 * don't query MongoDB per visitor) and refreshed the moment an admin publishes. If the database is unreachable the
 * built-in defaults are shown for that request: the site never breaks because of it.
 */
export async function getSiteChrome(): Promise<SiteChrome> {
  try {
    return await cached();
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Site chrome unavailable; using defaults",
    );
    return DEFAULT_CHROME;
  }
}
