import "server-only";

import { logger } from "@/server/logger";

/**
 * Blog pages read MongoDB when they are built and rebuilt (never per visitor). A database hiccup while the site is
 * being BUILT must not fail the whole deployment, so during the build the page falls back to `fallback` (the next
 * rebuild, at most an hour later or on the next admin save, fills it in). At run time errors propagate instead, so
 * a failed rebuild keeps serving the last good page rather than caching an empty one.
 */
export async function duringBuildFallback<T>(run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (process.env["NEXT_PHASE"] !== "phase-production-build") throw error;
    logger.warn(
      { err: error instanceof Error ? error.message : String(error) },
      "Blog data unavailable during build; using an empty page until the next rebuild",
    );
    return fallback;
  }
}
