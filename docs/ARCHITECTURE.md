# System Design & Architecture

Goal: Fernwood storefront (design locked) on Next.js, Shopify as commerce backend, handling ~1M concurrent visitors with Vercel hosting.

> **Cost decision (Nov 2026):** launch on Vercel + MongoDB Atlas free tier only. Redis/BullMQ/worker are Phase B, enabled when sales justify. Rate limiting, session revocation, webhook dedupe and job outbox use Mongo (TTL + unique indexes) behind interfaces (`RateLimiter`, `Cache`, `Queue`) so Phase B is a drop-in swap. Sections below describe the Phase B end state; Phase A substitutions are listed here.

## 1. Requirements

**Functional**: browse home/collections/products (Shopify catalog), search, cart, hosted Shopify checkout, accounts (register/login/logout, profile, addresses), order history, wishlist, real-time notifications, branded transactional emails.

**Non-functional**
| Attribute | Target |
|---|---|
| Concurrency | 1M concurrent visitors, ~95% anonymous browse |
| LCP / CLS | < 2.5s / < 0.05 on 4G mobile |
| API latency | p95 < 300 ms, p99 < 800 ms |
| Availability | 99.9%, graceful degradation if Shopify is down (serve stale) |
| Security | OWASP ASVS L2, no public data APIs, secrets server-side |
| Design | Pixel-identical to golden baselines |

## 2. Capacity reasoning
1M concurrent visitors is a CDN problem, not an origin problem.
- Browse traffic (home, collection, product, assets) is static/ISR at the CDN edge: effectively unlimited, zero origin load, zero Shopify calls per user.
- Assuming 3% of visitors act (cart/auth) with ~1 request per 10 s ≈ 3k req/s at origin worst case. Serverless scales horizontally; the real limits are MongoDB connections, Shopify rate limits and Redis ops, which this design protects.
- Shopify Storefront API has no hard request limit for public tokens but is bot-throttled; Admin API is cost-bucketed (~1000 points, 50/s restore on standard plans). Hence Admin calls are **queued and rate-shaped**, and Storefront reads are cached and webhook-invalidated.

## 3. High-level architecture

```
                         ┌───────────────────────────────┐
 Browser ──► Vercel Edge │ CDN cache, ISR pages, assets  │
                         │ Middleware: headers, bot rules │
                         └──────────────┬────────────────┘
                                        │ miss / dynamic
                         ┌──────────────▼────────────────┐
                         │ Next.js (RSC + Route Handlers)│
                         └─┬──────┬──────────┬──────────┬┘
                           │      │          │          │
                 Shopify   │   MongoDB     Redis      BullMQ producers
                 Storefront│   Atlas      (Upstash)        │
                 + Admin   │   users,      cache, rate     ▼
                           │   sessions,   limit, denylist ┌──────────────────┐
                           │   notifs,     pub/sub         │ Worker (Docker)  │
                           │   orders mirror               │ email, sync,     │
                           │                               │ webhook, notify  │
 Shopify webhooks ─HMAC──► /api/webhooks/shopify ─► queue ►│ + SSE/Socket GW  │
                                                           └────────┬─────────┘
                                                           Resend (email) / Shopify Admin
```

## 4. Component responsibilities

**Next.js app (Vercel)**
- RSC renders catalog pages from the catalog facade (Shopify behind it). ISR with tag-based revalidation.
- Route handlers: auth, cart, wishlist, notifications, account, orders, webhook intake. Stateless; no sockets, no long jobs.

**Shopify (system of record)**: products, collections, inventory, carts, checkout/payment, orders, customers (mirrored).
**MongoDB (our state)**: `users` (credentials hash, profile, `shopifyCustomerId`, `sessions[]`), `notifications`, `wishlists`, `orders` (read-mirror keyed by Shopify order id), `webhook_events` (dedupe/audit, TTL 30d).
**Redis**: Next data-cache backing for hot reads, rate limit counters, JWT `jti` denylist, webhook dedupe, pub/sub, BullMQ.
**Worker (Docker)**: BullMQ consumers + realtime gateway. Scaled independently; stateless; health/readiness probes.

## 5. Catalog data flow (hot path)
1. Request `/products/monstera-deliciosa` → CDN HIT (most traffic ends here).
2. MISS → RSC calls `getProduct(handle)` → `server/shopify/storefront.ts` (tagged `product:{handle}`) → mapper → domain `Product` → existing component tree.
3. Shopify `products/update` webhook → HMAC check → dedupe → queue → worker → `revalidateTag('product:{handle}')` via signed internal call. Pages refresh on next hit (stale-while-revalidate).
4. If Shopify errors: serve last cached page (stale-if-error), log + alert.

## 6. Authentication & session design
```
Login ─► verify argon2id ─► create session {familyId, hash(rt)} in user doc
      ◄─ 200 {accessToken(15m)}  Set-Cookie: rt=…; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=7d

API call: Authorization: Bearer <access>
   valid ─► handler
   401 expired ─► POST /api/auth/refresh (single-flight)
        cookie rt ─► sha256 ─► match session (not expired, not rotated)
             yes ─► rotate (new rt, mark old rotated), new access token
             rotated token seen again ─► revoke familyId (theft signal) ─► 401
```
- Access JWT claims: `sub`, `sid` (session id), `jti`, `iss`, `aud`, `iat`, `exp`. Redis denylist by `jti`/`sid` for logout.
- Single-flight refresh on client (one in-flight promise) avoids rotation races; server allows a 10 s grace window for the immediately previous token to tolerate parallel tabs.
- Session list per device supports "log out everywhere"; password reset/change revokes all.
- CSRF: refresh cookie is SameSite=Strict + path-scoped + Origin check; access token is header-based (not auto-sent).

## 7. Cart & checkout
- Anonymous: Shopify cart created server-side; cart id stored in httpOnly cookie (signed). Authenticated: cart linked through `buyerIdentity` (customer email) on login and merged.
- Mutations go through our route handlers (token-checked) calling Storefront Cart API; responses mapped and written to Redux.
- Checkout: redirect to Shopify `checkoutUrl`. Shopify handles payment, tax, shipping, fraud, PCI scope (we have none).
- Orders return via `orders/create|paid|fulfilled|cancelled` webhooks → queue → Mongo mirror + notification + email.

## 8. Asynchronous processing
| Queue | Jobs | Notes |
|---|---|---|
| `email` | welcome, verify, reset, order confirm/shipped | React Email, idempotent by `userId:template:eventId` |
| `shopify-sync` | customerCreate/update, address sync | Admin API with leaky-bucket shaping, retry on THROTTLED |
| `webhook` | normalize + dispatch Shopify events | dedupe by webhook id |
| `notification` | create + publish realtime | persists then pub/sub |

Defaults: 5 attempts, exponential backoff (2s base), `removeOnComplete` 1k, keep failed 7d, DLQ alert. Producers never block requests; job enqueue failure returns 503 for critical flows (e.g. registration email) after retry.

## 9. Real-time notifications
Event → worker persists in Mongo → publishes `user:{id}` on Redis → gateway pushes to authenticated SSE/Socket clients. Client keeps unread count in Redux, hydrates from `GET /api/notifications`, falls back to 30s polling when the stream is unavailable. Gateway hosting is deferred; interface is fixed, so provider (own Node service vs managed) can change without frontend change.

## 10. Caching layers
1. CDN (full page + assets, immutable hashed assets, `s-maxage` + SWR)
2. Next Data Cache (tagged fetch)
3. Redis (cross-instance hot reads, e.g. collection product lists, search)
4. Browser (SWR for account/cart calls via Redux thunks)
Invalidate by tag from webhooks; never by time alone for product price/stock.

## 11. Search
Phase 4 uses Shopify Storefront `predictiveSearch`/`search` through a token-protected handler, debounced (250ms), cached in Redis for 60s per normalized query, rate-limited per IP. Revisit Shopify Search & Discovery filters before introducing external engines.

## 12. Security architecture
- Threats modeled: credential stuffing, token theft/replay, CSRF, IDOR, webhook spoofing, SSRF, XSS, dependency compromise, bot scraping.
- Controls: argon2id, rotation + reuse detection, Redis rate limits (IP+account), zod everywhere, `userId` from token only, HMAC webhooks, strict CSP with nonces, `server-only` boundaries, least-privilege Shopify scopes, secret scanning (gitleaks) in CI, audit logging of auth events (no PII beyond ids).
- "No public endpoints": catalog is RSC-only; the API surface is authenticated or signature-verified. Unauthenticated exceptions are explicit and rate-limited (register/login/refresh/forgot/reset).
- Email: SPF/DKIM/DMARC on sending domain.

## 13. Observability & reliability
- Structured logs (pino) with request id; Sentry for errors (client+server+worker); Vercel Analytics/Speed Insights; BullMQ dashboard behind auth; uptime checks on `/api/health` (internal token) and homepage.
- SLO alerts: error rate > 1%, p95 > 500ms, queue lag > 60s, DLQ > 0, Shopify 429 spikes.
- Timeouts (Shopify 8s, Mongo 5s), circuit breaker around Shopify, bulkheads per queue.

## 14. Deployment topology
- **Vercel**: Next.js app; preview per PR; production from `main`. Regions near Mongo/Upstash (e.g. `bom1` for India-first traffic) .
- **MongoDB Atlas**: M30+ replica set, PITR backups, IP/private-link allowlist, pooled connections (maxPoolSize tuned for serverless).
- **Upstash Redis**: global/regional with TLS.
- **Worker**: Docker image from `worker/Dockerfile`, host decided later (Fly/Railway/ECS). Local parity via `docker-compose.yml` (mongo, redis, worker).
- **CI/CD**: GitHub Actions gates (lint, types, unit, integration, build, Playwright+visual, audit, gitleaks) on every PR and push to `dev`/`main`. **Deploys are manual** (owner decision): deploy from Vercel after CI is green, then run the "Production smoke test" workflow with the production URL. Rollback = Vercel dashboard → Deployments → previous deployment → Promote to Production (instant).
- **Environments**: local (compose), preview, production. Separate Shopify dev store for non-prod.

## 15. Design-lock architecture
- Tokens (`styles.css`), fonts and markup ported verbatim; catalog facade keeps component props stable.
- Golden screenshots in `e2e/__baselines__` taken from the legacy app; the Next port must pass them with `maxDiffPixelRatio ≤ 0.001`. Visual tests are a required CI check.
- Data differences (e.g. Shopify copy/images) are a content concern: the seed Shopify store is populated with the exact current catalog (names, prices, images, tags) so rendering is identical.

## 16. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Shopify rate limits/outage | tag cache + stale-if-error, queue shaping, breaker |
| Mongo connection exhaustion on serverless | cached client, small pools, Atlas pooling |
| Visual drift in port | frozen baselines + CI gate |
| Refresh race across tabs | single-flight + grace window |
| Vercel can't run workers/sockets | separate worker service, polling fallback |
| Lovable overwriting repo | disconnect Lovable before Phase 1 |
| Data mismatch Shopify vs legacy catalog | import script + parity test against `catalog.ts` snapshot |

## 17. Rendering strategy (SSG / ISR / SSR / CSR)

Principle: render on the server as early and as cacheable as possible; ship JavaScript only for interaction.

| Surface | Strategy | Why |
|---|---|---|
| Home `/`, static sections (hero, promo, story, footer) | **SSG + ISR** (`revalidate = 3600`) | Same HTML for everyone; CDN-served |
| `/collections/[slug]`, `/products/[slug]` | **SSG + ISR** via `generateStaticParams`; `dynamicParams` on so new Shopify products render on first hit then cache | SEO-critical, identical for all users; invalidated by Shopify webhooks (`catalog`, `product:{h}`, `collection:{h}` tags) |
| `/shop` (filters, sort, cursors) | **SSR** (`force-dynamic`) | Output depends on URL state; Shopify reads stay in the tagged data cache; non-base URLs are `noindex` |
| Header menu/search, collection filters, newsletter form, smooth scroll | **CSR islands** (`"use client"`, smallest possible) | Pure interaction state |
| Cart count, account menu, notifications (later) | **CSR**, fetched after hydration with the access token | Per-user data must never be baked into cached HTML |
| Account, orders, checkout hand-off (later) | **SSR/dynamic, `no-store`**, auth-guarded, `noindex` | Personal data |
| **Admin panel (future)** | **SSR/dynamic only** + CSR islands for tables/forms; never cached, never indexed | See below |

Rules: (1) never read cookies/headers/searchParams in a page that should be static, since that silently makes it dynamic; (2) keep personalization out of cached HTML (CSR islands); (3) data fetched in RSC must carry cache tags and a fallback `revalidate`; (4) prefer Server Components, and add `"use client"` only at the leaf that needs state or effects; (5) a future optimization is Next `cacheComponents`/PPR (static shell + streamed dynamic holes), which would let `/shop` keep a static shell.

### Admin panel (future scope, plan locked now)
- Lives in an `(admin)` route group at `/admin/*`, separate layout, `robots: noindex`, `Cache-Control: no-store`.
- Authentication and authorization **at every layer**: `proxy.ts` (formerly middleware) is only a first gate; every Server Action, Route Handler and RSC data call re-verifies the access token and the `admin` role server-side (defense in depth; never trust middleware alone).
- Role model in Mongo (`role: admin | staff`), least-privilege permissions per resource, audit log for every mutation, short admin sessions, optional MFA, strict CSP, CSRF/Origin checks, rate limits, separate refresh-cookie path.
- Data via Shopify Admin API (products, collections, inventory, orders) behind service functions; the admin never exposes Shopify tokens to the browser.
- Details to be guided by the owner before implementation.
