import type { NodeOptions } from "@sentry/nextjs";

import { scrubEvent } from "@/lib/sentry-scrub";

/**
 * What the SDK may collect on its own. This Sentry version collects cookies, headers, bodies, query strings,
 * local variables and database parameters BY DEFAULT, any of which could carry tokens, passwords or customer
 * data, so everything is switched off explicitly. Errors stay debuggable from the stack trace, route and request
 * id. `scrubEvent` below is a second, independent layer.
 */
export const dataCollection: NonNullable<NodeOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
};

/** Options common to server and browser. */
export const sharedSentryOptions = {
  environment:
    process.env["SENTRY_ENVIRONMENT"] ?? process.env["VERCEL_ENV"] ?? process.env["NODE_ENV"],
  ...(process.env["VERCEL_GIT_COMMIT_SHA"]
    ? { release: process.env["VERCEL_GIT_COMMIT_SHA"] }
    : {}),
  tracesSampleRate: 0.1,
  dataCollection,
  beforeSend: scrubEvent,
} satisfies NodeOptions;
