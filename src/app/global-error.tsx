"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors in the root layout itself (where `error.tsx` cannot render). It replaces the
 * whole document, so it brings its own html/body and uses only system fonts.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Same build-time switch as `instrumentation-client.ts`: removed entirely when monitoring is off.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN)
      void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf3e5",
          color: "#25321e",
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
          textAlign: "center",
          padding: "0 16px",
        }}
      >
        <main>
          <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500 }}>
            This page didn&apos;t load
          </h1>
          <p>Something went wrong on our end. Please refresh, or try again in a moment.</p>
          {/* A plain link on purpose: the app shell (and its router) may be what failed. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" style={{ color: "#314329" }}>
            Go home
          </a>
        </main>
      </body>
    </html>
  );
}
