/**
 * Lighthouse CI: runs against the production build with the same hermetic server the e2e suite uses (in-memory
 * database, Shopify disabled so the built-in catalog is served: stable and independent of network).
 * Mobile emulation with Lighthouse's default simulated slow-4G / 4x-CPU profile, the standard field-like lab profile.
 *
 * Two layers, on purpose:
 *   - ERROR  = regression gate. Ceilings sit roughly 1.5-2x above the medians measured today (a laptop run of the
 *              same build swung TBT between 190 and 1,140 ms across identical runs, so a tighter gate would fail at
 *              random). They catch real regressions. Once CI has produced a stable baseline on its own runners,
 *              tighten them toward the medians. Layout shift, accessibility,
 *              best-practices and SEO are held at their real targets because the site already meets them.
 *   - WARN   = the target budgets from CLAUDE.md §11 (LCP < 2.5 s, TBT < 200 ms, performance >= 0.9). They are
 *              reported on every run so the remaining gap stays visible. When a target is met, move its ceiling
 *              down to it (ratchet); never raise a ceiling to make a build pass.
 */
const PORT = 3100;
const origin = `http://localhost:${PORT}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `PORT=${PORT} node scripts/e2e-server.mjs`,
      startServerReadyPattern: "Ready|ready|started server|Local:",
      startServerReadyTimeout: 300000,
      url: [
        `${origin}/`,
        `${origin}/shop`,
        `${origin}/collections/house-plants`,
        `${origin}/products/monstera-deliciosa`,
        `${origin}/login`,
      ],
      numberOfRuns: 5,
      settings: { chromeFlags: "--no-sandbox --headless=new" },
    },
    assert: {
      assertMatrix: [
        {
          // Held at the real target: the site meets these today.
          matchingUrlPattern: ".*",
          assertions: {
            "cumulative-layout-shift": ["error", { maxNumericValue: 0.05, aggregationMethod: "median" }],
            "categories:accessibility": ["error", { minScore: 0.9, aggregationMethod: "median" }],
            "categories:best-practices": ["error", { minScore: 0.9, aggregationMethod: "median" }],
          },
        },
        {
          // Regression ceilings for the metrics still above target.
          matchingUrlPattern: ".*",
          assertions: {
            "largest-contentful-paint": ["error", { maxNumericValue: 5500, aggregationMethod: "median" }],
            "total-blocking-time": ["error", { maxNumericValue: 800, aggregationMethod: "median" }],
            "categories:performance": ["error", { minScore: 0.65, aggregationMethod: "median" }],
          },
        },
        {
          // The real targets, reported as warnings until met.
          matchingUrlPattern: ".*",
          assertions: {
            "largest-contentful-paint": ["warn", { maxNumericValue: 2500, aggregationMethod: "median" }],
            "total-blocking-time": ["warn", { maxNumericValue: 200, aggregationMethod: "median" }],
            "categories:performance": ["warn", { minScore: 0.9, aggregationMethod: "median" }],
          },
        },
        {
          // SEO only for pages meant to be indexed: /login is deliberately `noindex`.
          matchingUrlPattern: `^${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(shop|collections/[^/]+|products/[^/]+)?$`,
          assertions: { "categories:seo": ["error", { minScore: 0.9, aggregationMethod: "median" }] },
        },
      ],
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci" },
  },
};
