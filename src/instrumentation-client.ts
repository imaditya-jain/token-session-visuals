import { scrubEvent } from "@/lib/sentry-scrub";
import { dataCollection } from "@/sentry.shared";

// `process.env.NEXT_PUBLIC_*` is replaced at build time. When no DSN is set the whole block below is removed, so
// the browser SDK costs nothing: no chunk is emitted and nothing extra is downloaded. With a DSN it loads as its
// own chunk after the page is interactive.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      dataCollection,
      beforeSend: scrubEvent,
    });
  });
}
