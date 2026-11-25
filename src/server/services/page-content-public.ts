import "server-only";

import { unstable_cache } from "next/cache";

import { defaultValues, pageDef, reader, type PageValues, type Reader } from "@/lib/page-content";
import { logger } from "@/server/logger";

import { readPublishedPage } from "./page-content";

export const PAGE_CONTENT_TAG = "page-content";

/** A failed read throws inside the cache so fallback values are never stored (and served for an hour). */
const cached = unstable_cache(readPublishedPage, ["page-content-v1"], {
  tags: [PAGE_CONTENT_TAG],
  revalidate: 3600,
});

/**
 * The published content of one storefront page, read through typed accessors. Cached in Next's data cache and
 * refreshed the moment an admin publishes; if the database is unreachable the built-in defaults show for that
 * request, so the storefront never breaks because of it.
 */
export async function getPageContent(pageId: string): Promise<Reader> {
  let values: PageValues;
  try {
    values = await cached(pageId);
  } catch (error) {
    logger.warn(
      { err: error instanceof Error ? error.message : String(error), pageId },
      "Page content unavailable; using defaults",
    );
    const page = pageDef(pageId);
    values = page ? defaultValues(page) : {};
  }
  return reader(pageId, values);
}
