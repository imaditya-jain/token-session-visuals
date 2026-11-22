import "server-only";

import { revalidatePath } from "next/cache";

import { logger } from "@/server/logger";

/**
 * Called after any change to public blog content: every blog page (index, posts, categories, tags, paging), the
 * feed and the sitemap are rebuilt on their next visit. Never throws: a failed cache purge must not fail a save
 * (pages still refresh on their hourly schedule).
 */
export function revalidateBlog(): void {
  try {
    revalidatePath("/blog", "layout");
    revalidatePath("/sitemap.xml");
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Blog revalidation skipped",
    );
  }
}
