import "server-only";

import * as Sentry from "@sentry/nextjs";

/**
 * Reports an unexpected failure to error monitoring with just enough context to find it again (request id, job
 * type), never request data. Safe to call when monitoring is disabled: the SDK then drops it.
 */
export function reportError(error: unknown, context: Record<string, string> = {}): void {
  Sentry.captureException(error, { tags: context });
}
