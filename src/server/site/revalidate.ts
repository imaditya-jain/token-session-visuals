import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { logger } from "@/server/logger";
import { PAGE_CONTENT_TAG } from "@/server/services/page-content-public";
import { SITE_CHROME_TAG } from "@/server/services/site-chrome-public";

/**
 * After the header, footer or social links are published: drop the cached chrome and rebuild every page that shows
 * it on its next visit. Never throws (pages also refresh hourly), so a failed purge can't fail a publish.
 */
export function revalidateSiteChrome(): void {
  try {
    // Expire at once (not stale-while-revalidate): the owner who just published expects to see it.
    revalidateTag(SITE_CHROME_TAG, { expire: 0 });
    revalidatePath("/", "layout");
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Site revalidation skipped",
    );
  }
}

/**
 * After a product, variant, image or stock change: drop the cached catalog so shop pages show it at once. (The
 * Shopify webhook does the same for changes made in Shopify itself.) Never throws.
 */
export function revalidateCatalog(): void {
  try {
    revalidateTag("catalog", { expire: 0 });
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Catalog revalidation skipped",
    );
  }
}

/** After a page's content is published: drop the cached content and rebuild that page on its next visit. Never throws. */
export function revalidatePageContent(path: string): void {
  try {
    revalidateTag(PAGE_CONTENT_TAG, { expire: 0 });
    revalidatePath(path);
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Page content revalidation skipped",
    );
  }
}
