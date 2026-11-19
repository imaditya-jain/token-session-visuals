# Implementation Plan

Rules: see `CLAUDE.md`. One task = one branch from `dev`. Every phase ends with the full suite on `dev`, then `main`. Design baselines must stay green throughout. Tick boxes as you go.

## Status
- [x] Audit of Lovable build (no Shopify/Mongo/auth existed)
- [x] Decisions: Shopify hosted checkout · own JWT auth mirrored to Shopify · scope home/collection/product · worker host deferred
- [x] `dev` branch created
- [x] **Phase 0** visual baselines (`chore/phase-0-visual-baselines`) — 14 golden screenshots, stable across 2 runs
- [x] **Phase 1** Next.js port — 14/14 golden screenshots pass unchanged (threshold 0.1%), typecheck/lint/build/unit green
- [x] Phase 1b next/image + self-hosted fonts (exact Google woff2 files) — 21/21 e2e, baselines unchanged
- [x] **Phase 2** Shopify catalog: data layer, webhook, live/fallback facade, seed applied to dev store, 52 unit tests; 33/33 e2e green in BOTH live and fallback mode
- [x] Shop page `/shop`: all products, 12/page cursor pagination, availability/price/type filters + sort, URL-driven SSR, noindex variants
- [x] Phase 3a auth backend (tokens, sessions, rotation, lockout, rate limit, `/api/me`): 41 integration tests
- [x] Phase 3b auth UI: /login, /register, /account (12 e2e journeys + visual baselines); found+fixed missing unique index in production mode
- [x] Collections: 12-per-page cursor pagination (shared listing toolbar/pagination)
- [x] Phase 5a email system (outbox, branded templates) + email verification + forgot/reset + mobile account link; 69 e2e, 70 unit, 73 integration tests
- [x] Orders: API + /account/orders + detail (verified accounts only; 12 integration tests, 10 e2e + visual baselines). Live check pending a real test order (dev store has none)
- [x] Newsletter + campaign groundwork (double opt-in, one-click unsubscribe, enqueueCampaign) · security headers · 503 on DB outage · black-box contract tests for every API endpoint (61) — 183 unit+integration tests, 144 e2e
- [x] Cart: Shopify Cart API, signed guest cookie, mini-cart, real header badge (27 integration + 13 e2e tests; verified live against the dev store)
- [x] Search: `/search` results page + working overlay, prefix/relevance on Shopify, injection-safe terms (unit + 6 e2e; verified live)
- [x] Content pages: about, care guide, contact (outbox email), Shopify-sourced policy pages (privacy/terms/shipping/refund), footer wired; 12 new golden baselines
- [x] CSP: hardened, nonce-free (owner decision to keep static/ISR pages), violation-free tour in e2e
- [ ] Next: FAQ (needs your policy facts), cart↔account link, Shopify customer mirror;

## Blocking inputs from the user
| Needed by | Input |
|---|---|
| Before Phase 0 closes | Confirm Lovable is disconnected in the Lovable dashboard (or accept the sync risk) |
| Phase 2 | Shopify store domain, Storefront token, Admin token (scopes in CLAUDE.md §8), webhook secret; permission to seed the dev store with the current catalog |
| Phase 3 | MongoDB Atlas free-tier URI, JWT signing key (I generate; you store), email provider key + sending domain (Resend free tier). Redis NOT needed now |
| Phase 6 | Vercel project + GitHub repo secrets, worker host choice |

## Phase 0 — Foundation (finish)
Branch `chore/phase-0-visual-baselines`
- [x] Playwright config + `e2e/visual.spec.ts` (3 pages × 4 viewports, menu, search, overflow check)
- [x] `.gitignore`: `test-results/`, `playwright-report/`
- [ ] Commit baselines + docs; merge to `dev`
- [ ] Branch `chore/ci-skeleton`: GitHub Actions (lint, typecheck, vitest, playwright) against legacy app
- [ ] Branch `chore/docker-compose`: mongo + redis for local dev
**Accept**: `npx playwright test` green on legacy; CI green on `dev`.

## Phase 1 — Next.js port (pixel-identical)
Branch `feat/nextjs-port`
1. Scaffold Next.js (App Router, TS strict, Tailwind v4) in place; remove `@lovable.dev/*`, TanStack, Nitro, `bun.lock`, Lovable error libs.
2. Copy `styles.css` tokens verbatim; fonts via `next/font` (Fraunces opsz 9..144 w400–600, Work Sans w300–600), same CSS variables.
3. Move assets; replace `<img>` with `next/image` only where output size/crop stays identical (verify by baseline).
4. Port `Header`, `Hero`, `sections`, `ProductCard`, pages `/`, `/collections/[slug]`, `/products/[slug]`; keep `data/catalog` facade (static data for now, async signatures).
5. Fix legacy broken anchors only if the user approves (they are part of current behavior — port as-is by default).
6. Redux Toolkit store + provider scaffold; Lenis smooth scroll (verify no layout/visual change; disable under `prefers-reduced-motion`).
7. 404/error pages ported from `__root.tsx` (same markup).
8. Vitest: update routing tests; keep `catalog` tests.
**Accept**: Playwright visual suite passes against Next with ratio ≤ 0.001, zero diff-threshold changes, no horizontal overflow, Lighthouse perf ≥ 90 mobile.

## Phase 2 — Shopify data layer
Branch `feat/shopify-catalog`
1. `server/config/env.ts` (zod), `.env.example`.
2. `server/shopify/storefront.ts` client (pinned API version, timeout, retry/backoff, THROTTLED handling).
3. GraphQL queries: collections, collection products (pagination, filters: availability/price, sort), product by handle, best sellers, search (later).
4. Mappers → domain types in `lib/types`; contract tests with fixtures.
5. Seed script `scripts/seed-shopify.ts`: import current catalog (20 products, 4 collections, images, tags like badge/light/size via metafields) into the dev store (Admin API; idempotent; runs only with user's approval).
6. Swap `data/catalog` implementation to Shopify; ISR + tags; webhook route `/api/webhooks/shopify` (HMAC, dedupe) → revalidate.
7. Parity test: Shopify-rendered pages vs baselines (same content).
**Accept**: visuals unchanged; stale-if-error verified by simulating Shopify failure; webhook negative tests pass.

## Phase 3 — Auth & accounts
Branch `feat/auth`
1. Mongoose `User` (indexes), `server/auth` (argon2id, `jose` JWT, session family, rotation, reuse detection).
2. Routes: `register`, `login`, `refresh`, `logout`, `logout-all`, `forgot`, `reset`, `me`, `PATCH me`.
3. Redis rate limiters + denylist; `requireAuth` guard; request-id + error envelope.
4. Client: Redux `auth` slice, `apiClient` (adds Bearer, single-flight refresh on 401/missing).
5. Header account icon behavior (dropdown/login sheet) — UI proposal to user BEFORE building (built from existing tokens/Sheet).
6. Queue: `shopify-sync` customerCreate; `email` welcome/reset (Phase 5 templates).
**Accept**: integration tests for every flow incl. expired access, rotated/reused refresh, cookie flags, rate limit, IDOR; Playwright auth journey.

## Phase 4 — Cart, search, wishlist
Branch `feat/cart`, `feat/search`, `feat/wishlist` (separate)
1. Cart service on Shopify Cart API; guest cookie; merge on login; Redux `cart` slice; header badge real count; ProductCard "Add to cart" wired; mini-cart via existing Sheet (proposal to user first).
2. Checkout redirect to `checkoutUrl`.
3. Search overlay wired to protected, cached, rate-limited search handler with debounce; results rendering reuses `ProductCard`.
4. Wishlist (Mongo) optional per user approval.
**Accept**: Playwright smoke: home → product → add → badge updates → checkout URL reached; negative tests (invalid variant, out of stock, tampered cart token).

## Phase 5 — Orders, notifications, email
Branch `feat/orders`, `feat/notifications`, `feat/email`
1. Webhooks orders/* → queue → Mongo mirror; `GET /api/orders` (paginated, user-scoped).
2. Notification model, publish via Redis, SSE gateway in `worker/`, Redux `notifications` slice, polling fallback.
3. React Email templates (welcome, reset, order confirmed, shipped) using brand palette; render snapshot tests; preview route not deployed to prod.
4. `worker/` Dockerfile, health, graceful shutdown; compose service.
**Accept**: end-to-end in compose: order webhook → email in test inbox + notification received in browser.

## Phase 6 — CI/CD, hardening, launch
Branch `chore/cicd`, `chore/hardening`
1. GitHub Actions: PR + `dev` gates (lint, types, unit, integration w/ service containers, build, Playwright+visual, audit, gitleaks); `main` deploy to Vercel; post-deploy prod smoke; auto-rollback (`vercel rollback`) + issue on failure.
2. Branch protection on `main`/`dev`; Dependabot.
3. Security headers + hardened CSP (nonce-free by decision, keeps ISR); penetration checklist (OWASP ASVS L2); secret rotation doc.
4. Sentry, uptime checks, alerts; Lighthouse CI budgets.
5. k6 load test (cart/auth endpoints + cache-miss storm) and CDN cache hit-rate verification; tune Mongo pool & rate limits.
6. Runbooks: rollback, incident, key rotation.
**Accept**: all gates green on `dev`; production smoke green; rollback drill executed once.

## Per-task checklist (copy into each branch)
- [ ] Branch from `dev`; scope is one task
- [ ] Code follows CLAUDE.md conventions; no workarounds
- [ ] Unit + integration + Playwright added for the change
- [ ] Visual baselines unchanged (never updated to pass)
- [ ] Lint, typecheck, build green
- [ ] Merged `--no-ff` to `dev`; full regression/smoke/behavioral/Playwright green on `dev`
- [ ] Pushed `dev`; merged to `main`; production smoke green (or rolled back)
- [ ] This plan updated
