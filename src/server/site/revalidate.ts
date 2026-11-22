import "server-only";

import { revalidatePath, revalidateTag } from "next/cache";

import { logger } from "@/server/logger";
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
