import * as Sentry from "@sentry/nextjs";

import { sharedSentryOptions } from "./sentry.shared";

const dsn = process.env["SENTRY_DSN"];

// Without a DSN the SDK stays disabled and sends nothing (local development, CI, previews).
Sentry.init({ ...sharedSentryOptions, enabled: Boolean(dsn), ...(dsn ? { dsn } : {}) });
