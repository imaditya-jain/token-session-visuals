import { fileURLToPath } from "node:url";

import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const isDev = process.env["NODE_ENV"] === "development";

/**
 * Content-Security-Policy. Decision (owner-approved): keep home, product and policy pages statically cached,
 * so scripts cannot be nonce-protected (a nonce needs per-request rendering and Next's inline bootstrap
 * scripts would otherwise be blocked; verified in a browser). Everything else is locked down: same-origin
 * only for images, fonts and connections, no plugins, no framing, no foreign form posts or base tag. Inline
 * styles are allowed because Radix dialogs inject a scroll-lock <style> whose text depends on the scrollbar
 * width (so it can't be hashed), and with inline scripts already allowed, blocking them would add no real
 * protection. `upgrade-insecure-requests` is omitted: production is HTTPS-only via HSTS, and it would
 * break the plain-http e2e server. Revisit nonces (CLAUDE.md §7) if pages ever become dynamic anyway.
 */
/**
 * Reels are stored in Supabase Storage and played straight from its public address, so that one origin (taken
 * from `SUPABASE_URL` at build time) may serve images and video. Nothing else, and never scripts or connections.
 */
const reelsOrigin = (() => {
  try {
    const url = process.env["SUPABASE_URL"];
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();
const mediaSources = ["'self'", ...(reelsOrigin ? [reelsOrigin] : [])].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src ${mediaSources} data: blob:`,
  `media-src ${mediaSources} blob:`,
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Baseline security headers for every response (pages and APIs). */
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for the Docker image (`NEXT_OUTPUT=standalone`). Off by default: Vercel and
  // `next start` (used by the e2e suite) must keep the regular output.
  ...(process.env["NEXT_OUTPUT"] === "standalone" ? { output: "standalone" as const } : {}),
  // The site's CSS is ~12 KB gzipped. Inlining it into the HTML removes a render-blocking round trip on every
  // first load (the dominant cost on slow mobile connections). Allowed by the CSP (`style-src 'unsafe-inline'`).
  experimental: { inlineCss: true },
  // Pin the workspace root to this project; otherwise Next infers it from stray lockfiles in parent folders.
  turbopack: { root: fileURLToPath(new URL(".", import.meta.url)) },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Belt and braces next to the page metadata and robots.txt: the console is never indexed.
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "cdn.shopify.com", pathname: "/s/files/**" }],
  },
};

/**
 * Browser error monitoring needs Sentry's build plugin (tunnel route, optional source-map upload). The plugin also
 * injects code into every page, so it is applied only when a browser DSN is configured at build time. Server-side
 * monitoring (`SENTRY_DSN`) does not need it, so builds without Sentry are byte-for-byte unaffected.
 */
const hasBrowserSentry = Boolean(process.env["NEXT_PUBLIC_SENTRY_DSN"]);

export default hasBrowserSentry
  ? withSentryConfig(config, {
      ...(process.env["SENTRY_ORG"] ? { org: process.env["SENTRY_ORG"] } : {}),
      ...(process.env["SENTRY_PROJECT"] ? { project: process.env["SENTRY_PROJECT"] } : {}),
      ...(process.env["SENTRY_AUTH_TOKEN"] ? { authToken: process.env["SENTRY_AUTH_TOKEN"] } : {}),
      silent: !process.env["CI"],
      telemetry: false,
      // Source maps are uploaded (and then removed from the public build) only when an auth token is present.
      sourcemaps: { disable: !process.env["SENTRY_AUTH_TOKEN"] },
      // Same-origin proxy: the browser SDK needs no extra `connect-src` in our CSP and ad blockers don't hit it.
      tunnelRoute: "/monitoring",
    })
  : config;
