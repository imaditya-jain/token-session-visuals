import * as Sentry from "@sentry/nextjs";

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "nodejs") await import("./sentry.server.config");
}

/** Reports errors from server components and route handlers that Next catches itself. */
export const onRequestError = Sentry.captureRequestError;
