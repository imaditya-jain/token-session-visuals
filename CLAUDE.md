# CLAUDE.md — Fernwood Storefront

Premium botanical ecommerce storefront (Shopify "Whisk / Greenhouse" look). Originally built by Lovable (TanStack Start + Vite); being migrated to a scalable Next.js stack. **Read this file fully before any task.** Deep dives: `docs/ARCHITECTURE.md` (design), `docs/IMPLEMENTATION_PLAN.md` (phases/tasks). `AGENTS.md` still applies.

## 0. Prime directive: the design is LOCKED
UI/UX, colors, fonts, spacing, copy, imagery and layout must remain pixel-identical to the Lovable build in `src/` (reference of truth until the port completes, then frozen golden screenshots).
- NEVER change: color tokens, fonts (Fraunces display, Work Sans body, same weights/optical sizing), radius, spacing, breakpoints, copy, image crops, animations (`rise-in` only), component markup/class names.
- Port by **copying** JSX/classes verbatim. Do not "improve", modernize, refactor visuals, or swap components for look-alikes.
- shadcn/Radix primitives are allowed only where they already exist (`src/components/ui`). Any new UI must be composed from existing tokens (`bg-forest-deep`, `text-cream`, `font-display`, …).
- Golden screenshots: `e2e/__baselines__/` (14 images: 3 pages × 4 viewports + mobile menu + search overlay). **Never run `--update-snapshots` to make a test pass.** Baselines change only when the user explicitly approves a design change.
- If a task seems to require a visual change: STOP and ask.

## 1. Role & standards
Act as principal engineer, QA, Shopify expert, system architect, ecommerce specialist.
- No temporary workarounds, no "fix later" hacks, no `any`, no `@ts-ignore`, no commented-out code, no mocked behavior in production paths. If a proper solution is blocked, report the blocker; don't paper over it.
- Industry-standard approaches only (OWASP ASVS, 12-factor, least privilege, idempotency, observability).
- Never invent secrets, tokens, or Shopify data. Ask the user for credentials (§8).
- Privacy: never put the user's email/name/project details in requests to external services.

## 2. Target stack (decided)
| Concern | Choice |
|---|---|
| Framework | Next.js (App Router, RSC, TypeScript strict), Node 24 |
| Styling | Tailwind v4, existing tokens copied verbatim from `src/styles.css`; shadcn/Radix as already used |
| Client state | Redux Toolkit — auth session, cart UI, notifications, UI flags only. Server data stays in RSC |
| Commerce | Shopify Storefront API (catalog, cart) + Admin API (customers, orders). **Shopify hosted checkout** (no custom payment code; Razorpay, if wanted, is installed as a Shopify payment app) |
| Database | MongoDB Atlas free tier (Mongoose): users, sessions, notifications, wishlist, order mirror |
| Cache/queue | **Phase A (now, zero cost):** no Redis in prod. Rate limits, session revocation, webhook dedupe live in MongoDB (TTL/unique indexes); caching via Next data cache/ISR; async jobs via a Mongo transactional outbox drained by Vercel Cron. **Phase B (after real sales):** Upstash Redis + BullMQ + worker. Everything sits behind `server/cache`, `server/ratelimit`, `server/queue` interfaces so the swap touches no callers. Local Redis (Docker) is optional for testing Phase B |
| Worker/realtime | Separate Node Docker service (hosting decision deferred; built and runnable via Docker Compose now) |
| Email | React Email templates in brand style, sent from queue |
| Smooth scroll | Lenis (no visual change) |
| Tests | Vitest (unit/integration), Playwright (smoke, regression, visual) |
| Deploy | Vercel (app) + GitHub Actions CI/CD; Docker for worker |

Package manager: **npm** (`package-lock.json`). Do not add other lockfiles; `bun.lock` is legacy and removed in Phase 1.

## 3. Current state (verify before relying on it)
- **Phase 1 done**: the app is Next.js 16 (App Router) in `src/app` — routes `/`, `/collections/[slug]`, `/products/[slug]`, all statically prerendered. UI components in `src/components/storefront/*` are ported verbatim (only plumbing changed: `next/link`, `"use client"` boundaries). Filters/sort live in the client component `CollectionProducts`; the page is a server component.
- **Catalog is Shopify-backed** (Phase 2). `src/data/catalog.ts` is the only catalog entry point (server-only, async): `src/server/shopify/*` (client, queries, zod schemas, mappers, webhook HMAC) → `src/server/services/catalog.ts` → facade. Client components import types/formatters from `src/lib/*` and nav/testimonials from `src/data/site.ts`, never the facade.
- **Live vs fallback (user decision)**: the facade serves Shopify only when it has ≥1 product AND ≥1 storefront collection; otherwise (empty store, Shopify error, missing env) it serves `src/data/fallback-catalog.ts` (the original design data). All-or-nothing per request, logged as a warning. Live data always wins; never merge the two.
- Storefront collection = Shopify collection with metafield `custom.tagline`, ordered by `custom.position`. Home best sellers = collection handle `home-best-sellers`. Product badge from tags (Sale > New > Bestseller); `custom.light` / `custom.size` metafields; stock from `availableForSale`.
- Cache: Storefront fetches are tagged (`catalog`, `product:{handle}`, `collection:{handle}`), revalidate 1h, refreshed by `POST /api/webhooks/shopify` (HMAC, fails closed without `SHOPIFY_WEBHOOK_SECRET`). `scripts/seed-shopify.ts` brings a dev store to parity (dry run by default; `--apply` refuses non-development stores).
- **Auth backend (Phase 3, done)**: `src/server/services/auth.ts` (register, login + 5-strike/15-min lockout, rotating refresh with replay detection and 10 s grace, 30-day absolute cap, logout/logout-all, profile), `src/server/auth/*` (jose HS256 access token 15m with `iss/aud/jti/sid`; refresh = opaque 256-bit, stored as HMAC-SHA256 keyed by `REFRESH_TOKEN_SECRET`; argon2id via `@node-rs/argon2`; httpOnly `SameSite=Strict` cookie scoped to `/api/auth`), Mongo rate limiter behind the `RateLimiter` interface, `route()` wrapper (envelope, request id, no-store), `assertSameOrigin` CSRF check. Routes: `/api/auth/{register,login,refresh,logout,logout-all}`, `/api/me`. Role is read from the DB on every request (never trusted from the token). DB name is pinned (`MONGODB_DB_NAME`, default `fernwood`) because the Atlas URI has none.
- **Auth UI (Phase 3b)**: `/login`, `/register`, `/account` (noindex; CSR because the access token is memory-only). Client: `src/features/auth/*` (slice + thunks), `src/lib/api-client.ts` (Bearer on every call, single-flight refresh-and-retry), non-sensitive `fw_auth` hint cookie so anonymous visitors cost zero session requests, `safeRedirectPath` for `?next=`. Components in `src/components/auth/*` use existing tokens only. DB indexes are ensured once per process in `connectDb` (`src/server/db/indexes.ts`); add every new model there.
- **Email (Phase 5a, done)**: nodemailer over SMTP (Gmail) + React Email templates in `src/server/email/templates` (registry in `index.tsx`; colours from `brand.ts` = hex conversions of the locked tokens, Georgia/Helvetica stacks). Sending goes through the **transactional outbox** (`src/server/email/outbox.ts`): `enqueueEmail()` writes a job, delivery runs right after the response via `after()`, retries with backoff (1/5/30/120 min, 5 attempts), crash recovery, payload (one-time links) wiped once sent/failed; `GET /api/cron/jobs` (Bearer `CRON_SECRET`, fails closed) sweeps stragglers (`vercel.json` cron is daily because the Hobby plan allows no more; tighten on Pro). Links use `SITE_URL`, never the Host header. To add an email: template component + entry in the registry + test.
- **Account flows (done)**: email verification (`/verify-email`, 24h single-use token, resend limited to 3/h), forgot/reset password (`/forgot-password`, `/reset-password`, 1h single-use token, identical response for unknown emails, reset signs out every device + clears lockout + emails a "password changed" notice). One-time tokens are stored as keyed hashes in `auth_tokens` (TTL). `emailVerified` is exposed on `/api/me`; **order history must only be shown to verified accounts**.
- **Orders (done)**: `GET /api/orders` (cursor, 10/page) and `GET /api/orders/[id]` read the Shopify **Admin API** (`src/server/shopify/admin.ts`, `cache: "no-store"` because it is customer data) via `src/server/services/orders.ts`. Rules: Bearer auth, **verified email required** (`403 email_unverified`), orders are looked up by the account email and every result is re-checked for an exact email match, foreign and missing orders are both `404`, ids must be numeric, Shopify failures become a clean `503 orders_unavailable`. Pages: `/account/orders`, `/account/orders/[id]` (CSR, `AccountNav` tabs). Order DTOs live in `src/lib/orders.ts`; never expose emails or raw Shopify shapes.
- **Newsletter / campaigns (done)**: footer form → `POST /api/newsletter` (double opt-in; identical 202 for existing subscribers; limited per IP and per address) → emailed link → `/newsletter/confirm`. `Subscriber` model (`pending|subscribed|unsubscribed`). Unsubscribe is a stateless HMAC token (`createUnsubscribeToken`, never expires), RFC 8058 one-click `POST /api/newsletter/unsubscribe?token=` (intentionally no Origin check; token is the authorization) and a button-gated `/unsubscribe` page (never on page load: email scanners open links). Account marketing preference stays in sync (subscribes only after the mailbox is verified). `enqueueCampaign()` in `src/server/services/newsletter.ts` fans out per confirmed subscriber through the outbox with `List-Unsubscribe` headers and per-recipient dedupe keys; it is an internal service for the future admin panel, not an HTTP endpoint. Gmail's ~500/day cap makes real campaigns need an email provider (swap SMTP settings only).
- **Cart (done)**: Shopify Cart API (`src/server/shopify/cart-*.ts`, `noStore` fetches, never in the data cache) behind `src/server/services/cart.ts`; routes `GET /api/cart`, `POST|PATCH|DELETE /api/cart/lines`. Guest cart per §7: httpOnly `fw_cart` cookie (`Path=/api/cart`, Lax) = `base64url(cartId).HMAC`, forged/foreign values are ignored; non-sensitive `fw_cart_hint` lets the client skip the request when there is no cart. Mutations: Origin check, per-IP rate limit, strict gid/quantity zod (1..10). Shopify down/misconfigured or the offline fallback catalog (no `variantId`) ⇒ `503 cart_unavailable`/button shows "Try again". Stock errors ⇒ `409 out_of_stock`; Shopify error text never reaches clients. Redux `features/cart` + `MiniCart` (Sheet, existing tokens); checkout = plain link to `checkoutUrl` (hosted). Header badge is real (hidden at 0). **Account link**: `PUT /api/cart/identity` (Bearer + cart cookie; email comes from the account, never the body) sets Shopify `buyerIdentity.email` so checkout is pre-filled and the order lands in the account's history (orders are matched by email); `DELETE` unlinks (sign-out, cookie only). The cart DTO exposes only `identified: boolean`, never the address. `CartIdentitySync` (client, in `Providers`) links once per cart+account and unlinks when anonymous; one attempt per cart/account so failures can't loop. Not yet: product-page add button (needs design approval); Shopify customer records (`customerAccessToken`) come with the customer mirror.
- **Content pages (done)**: `/about` and `/care-guide` (static, copy reuses existing site claims only; care guide is general horticulture), `/contact` (form → `POST /api/contact`: Origin check, zod with control-char rejection, honeypot `website`, 5/h per IP + 3/h per address, queued through the outbox to `CONTACT_INBOX` (default `SMTP_EMAIL`) with the visitor as `Reply-To`; **never emails the visitor**), and `/policies/{privacy-policy,terms-of-service,shipping-policy,refund-policy}`: text comes from Shopify (Settings → Policies) via the Storefront `shop` query, sanitized again with a strict `sanitize-html` allow-list (`server/content/sanitize.ts`), ISR 1h. An unwritten/unavailable policy shows a neutral "being updated" notice + `noindex`; **no shipping/returns terms are ever invented in code**. **Every footer/header link now goes to a real page** (guarded by `e2e/links.spec.ts`: no `#footer` placeholders, no dead anchors, no 404s; only the four social icons are exempt until public profile URLs exist). Pages: `/collections` (index), `/faq` (native `<details>` + FAQPage JSON-LD), `/shipping-delivery`, `/plant-guarantee`, `/gift-cards` (Shopify products of type "Gift Card"), `/careers`, `/wholesale`, `/press`, `/sustainability`, `/accessibility`. Facts live in `src/data/store-info.ts` (shipping rates mirror the Shopify shipping settings; **owner must keep it in step**; copy only restates site claims). Contact links preselect the topic (`/contact?topic=…`, validated against the allow-list). **Owner-approved design change**: every non-catalog page (auth, account, content) now opens with the same `CollectionBanner` as shop/collection pages via `AuthShell`/`ContentShell`, so all pages share one background scheme; 28 baselines were regenerated for that, protected ones (home/collection/product/shop/menu/overlay) untouched. Shell: `components/content/ContentShell` + `prose.ts` (tokens only).
- **Customer mirror (done)**: every account has a Shopify customer, kept in step by a generic Mongo **job outbox** (`Job` model, `src/server/queue/{jobs,handlers,producers}.ts`; same retry 1/5/30/120 min × 5, crash recovery and TTL as email; payload = ids only; pending jobs dedupe on `type+key`). Register and profile edits call `enqueueCustomerSync(userId)` (never throws; no-op when `SHOPIFY_ADMIN_API_ACCESS_TOKEN` is unset, e.g. e2e). `services/customer-sync.ts` (idempotent, reads current data): update by stored `shopifyCustomerId`; if missing/deleted in Shopify → look up by email and **link** (adopts earlier guest-checkout customers so past orders belong to the account) else create (`tags: fernwood-web`); email-taken race re-looks up; phone sent only if E.164 and retried without it if Shopify refuses. **Marketing consent is not mirrored** (the newsletter system owns it). Cron `GET /api/cron/jobs` now drains emails and jobs. **Security rule**: an account whose email is not yet verified never adopts or modifies a Shopify customer it did not create (otherwise anyone could register with another person's email and rewrite their record); verification (`confirmEmailVerification`, password reset) re-queues the sync. Add a new background task = entry in `handlers.ts` (+ test); handlers may return follow-up jobs (used by the paged backfill). Existing accounts created before this feature are not backfilled (enqueue `enqueueCustomerSync` for each if ever needed).
- **Shopify GID mirror (done)**: our database keeps the Shopify GID of every account (`User.shopifyCustomerId`), product + its variants + its collections (`ShopifyProduct`), collection (`ShopifyCollection`) and order + line-item/product/variant GIDs (`ShopifyOrder`) in `src/server/db/models/shopify-mirror.ts` (read-only mirrors, Shopify stays the source of truth; **no emails, addresses or phones**: orders carry only `customerGid`, our `userId` and a keyed email hash `emailKey` so guest orders can be claimed after registration). Flow: signed `POST /api/webhooks/shopify` (topics: products/collections create|update|delete, orders create|updated|paid|cancelled|fulfilled|partially_fulfilled|edited|delete) → only the GID is taken from the body (`mirrorActionForWebhook`, strict per-type regex) → job `shopify.mirror.sync|delete` (deduped while pending) → `services/shopify-mirror.ts` re-reads the record via the Admin API and upserts **unless we already hold a newer `shopifyUpdatedAt`** (out-of-order safe); deleted records are flagged `deletedAt`, never removed. Queue down ⇒ webhook answers 503 + Retry-After so Shopify redelivers. Daily safety net: the cron route queues `shopify.mirror.backfill` (one page of 50 per job, chained). An order is linked to a `userId` only for **verified** accounts. Register the webhooks once per environment with `node --env-file=.env scripts/register-shopify-webhooks.ts --url https://<domain> [--apply]` (dry run by default, https only, idempotent); the receiving server's `SHOPIFY_WEBHOOK_SECRET` must match the secret Shopify signs with. Not mirrored on purpose: carts (id lives in the signed cookie, expires in ~10 days) and customers other than registered accounts.
- **Resilience**: `route()` maps database outages (`Mongo*Error`) to `503 service_unavailable` + `Retry-After`; unexpected errors stay generic 500 with no leakage. Baseline security headers (nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, HSTS) are set in `next.config.ts`; **CSP (owner decision)**: hardened *without* nonces so home/product/policy stay static+ISR. Next's inline bootstrap scripts can't be hashed (verified: a script-src without `'unsafe-inline'` stops hydration), and nonces would make every page dynamic. Policy in `next.config.ts`: `default-src 'self'`, scripts/styles `'self' 'unsafe-inline'`, images `self data: blob:`, fonts/connect `'self'`, `object-src 'none'`, `base-uri`/`form-action` `'self'`, `frame-ancestors 'none'`; no `unsafe-eval` in production (client zod runs `jitless` in `Providers`). Any new third-party origin (analytics, embeds) must be added deliberately; `e2e/csp.spec.ts` fails on any violation. Revisit nonces only if pages become dynamic anyway.
- **Atlas networking**: Atlas rejects connections from non-allow-listed IPs. Local dev needs your IP in Atlas → Network Access; Vercel uses dynamic IPs, so production needs `0.0.0.0/0` (strong credentials) or Vercel's Atlas integration.
- **API test pyramid**: handler/webhook unit tests, service+route integration tests (real in-memory Mongo), and `e2e/api.spec.ts` (black-box contract tests of EVERY endpoint over real HTTP: auth, methods, hostile input incl. NoSQL operators and prototype pollution, CSRF, rate limits, headers, full flows).
- E2E runs against `scripts/e2e-server.mjs` (production build + in-memory MongoDB + throwaway secrets + Shopify disabled ⇒ fallback catalog). Tests present distinct client IPs via `x-forwarded-for` (rate limiter keys on it). Live-Shopify behavior is verified manually with `.env` loaded.
- Tests: unit (`npm run test:unit`, jsdom) and integration (`npm run test:integration`, node, real in-memory MongoDB, serial; never touches Atlas). Integration files are `*.int.test.ts`.
- Redux store (`src/store`, slice `ui`) and Lenis smooth scroll (`components/providers`) are wired.
- **Search (done)**: header overlay is a real `role="search"` form that navigates to `/search?q=` (SSR, `noindex`, no public JSON endpoint, per §7). `q` is parsed by `searchTerms` (letters/digits only, ≤6 terms ≤40 chars) so no Shopify search syntax can be injected; Shopify gets `(term* AND term*)` prefix matching with RELEVANCE sort (default sort only), combined with the shop filters/sort/cursor pagination; the offline fallback matches terms against name/category/light. Search reads use a 5-min cache (each query string is its own entry).
- Fonts are self-hosted via `next/font/local` from the exact Google woff2 files of the original request (`src/fonts`, see its README); never switch to `next/font/google` (different font build ⇒ visual drift, verified). Images use `next/image` with explicit `sizes`.
- Scope: storefront (home, collections incl. index, shop, product, search), account/auth, cart, content/help pages listed above. New pages beyond these need user approval.
- Lovable is disconnected from the code (all `@lovable.dev/*`, TanStack, Vite-app tooling removed). `.lovable/` is kept until the user says to delete it.

## 4. Git workflow (mandatory)
- Branches: `main` (production), `dev` (integration), short-lived `feat/*`, `fix/*`, `chore/*`, `test/*` cut from `dev`. **One task = one branch.**
- Per task: branch from `dev` → implement → unit + integration + Playwright for that feature → merge to `dev` (`--no-ff`) → on `dev` run the FULL suite (unit, integration, API, smoke, regression, behavioral, Playwright incl. visual) → only when ALL green: push `dev`, merge `dev` → `main` → production smoke test.
- Any failure after merge: stop and roll back to the last stable commit (`git revert` for pushed history; Vercel instant rollback for deploys). **Never force-push, rebase, amend or squash pushed commits** (Lovable history rule in `AGENTS.md`).
- Commit only when the user asks or a plan checklist says so. Conventional Commits (`feat(auth): …`). End commit messages with the attribution line from the session system reminder.
- Never commit `.env*` (except `.env.example`), tokens, `.output`, `test-results`.

## 5. Code conventions
Target layout (`src/`):
```
app/                    # routes: (storefront)/..., api/...
components/storefront/  # ported verbatim UI
components/ui/          # shadcn (existing)
features/<name>/        # auth, cart, search, notifications, wishlist: slice, hooks, components
server/                 # server-only, never imported by client
  config/env.ts         # zod-validated env, fail fast
  db/                   # mongoose connection (cached), models/
  shopify/              # storefront.ts, admin.ts, queries/*.graphql, mappers.ts
  auth/                 # tokens, sessions, password, guards
  cache/                # redis client, keys, tags
  queue/                # BullMQ producers, job schemas
  services/             # business logic (no HTTP types)
  emails/               # React Email templates
lib/                    # pure shared utils, formatPrice, domain types
worker/                 # standalone worker entry (Docker)
```
- `import "server-only"` at the top of every `server/**` module.
- UI reads catalog data ONLY through the `data/catalog` facade (`getProduct`, `getCollection`, `getCollectionProducts`, `bestSellers`, `navLinks`, `testimonials`, `formatPrice`). Keep names; they become async. Swap the implementation to Shopify without touching components (`AGENTS.md`).
- Validate every external input with zod: request bodies, query, env, webhook payloads, Shopify responses (mapped to our domain types — never leak raw Shopify shapes into components).
- Route handlers are thin: parse → guard → service → respond. Logic lives in `server/services`.
- API envelope: `{ data }` or `{ error: { code, message } }`; correct HTTP codes; never leak stack traces or internal ids.
- Errors: typed `AppError` hierarchy, central handler, structured pino logs with request id; no `console.log` in committed code.
- Money: Shopify `MoneyV2` strings, formatted by `formatPrice`; no float arithmetic.
- Accessibility: keep existing semantics, labels, focus handling; touch targets ≥44px.

## 6. Auth spec (exact)
- **Access token**: JWT via `jose`, **15 min**, sent as `Authorization: Bearer` on EVERY API call; kept in Redux memory only (never localStorage/cookie).
- **Refresh token**: opaque 256-bit random, **7 days**, `httpOnly; Secure; SameSite=Strict; Path=/api/auth` cookie. Server stores its **SHA-256 hash** in the customer document `sessions[]` (one entry per device: hash, familyId, ua, ip, createdAt, expiresAt, rotatedAt).
- Missing/expired access token → client calls `POST /api/auth/refresh` once (single-flight); server verifies the cookie hash, **rotates** the token, returns a new access token. Reuse of a rotated token ⇒ revoke the whole family, force login.
- Passwords: argon2id. Register/login/refresh/forgot rate-limited per IP and per account (`RateLimiter` interface: Mongo TTL counters now, Redis later), generic error messages, timing-safe comparisons, backoff/lockout.
- Logout revokes that session; "log out everywhere" clears all; password change revokes all.
- Customers mirrored to Shopify (`customerCreate`) via queue; store `shopifyCustomerId`. Orders come from Shopify webhooks into a Mongo mirror for history and notifications.
- Guard `requireAuth(req)` verifies signature, `exp`, `iss`, `aud`, and `sid` against the session store (revoked/expired sessions rejected). Queries are scoped by `userId` from the token, never from the request body.

## 7. API security ("no public endpoints")
- Catalog/collection/product data is fetched **server-side in RSC**. Do NOT create public `/api/products|collections` endpoints.
- Every `/api/*` route requires a valid access token except `auth/register|login|refresh|forgot|reset` and signed webhooks. Guest cart uses a signed, short-lived cart token (HMAC) bound to the Shopify cart id.
- Mutations: Origin / Fetch-Metadata CSRF check, zod validation, rate limit, idempotency key where relevant.
- Webhooks (`/api/webhooks/shopify`): verify `X-Shopify-Hmac-Sha256` over the raw body (timing-safe), dedupe `X-Shopify-Webhook-Id` (unique index in `webhook_events`), enqueue, return 200 fast.
- Secrets only in env (Vercel/Docker secrets). No Shopify token ever reaches the browser bundle.
- Headers: hardened CSP (nonces deliberately not used, see §3 Resilience), HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors none.
- Pin exact dependency versions; `npm audit` in CI; Dependabot.

## 8. Shopify rules
- Ask the user for credentials; never guess. Needed: store domain, Storefront API token, Admin API token (least privilege: `read_products`, `read_inventory`, `read_orders`, `read_customers`, `write_customers`), webhook secret. Provide via `.env.local` / Vercel env; commit only `.env.example`.
- Pin an API version constant; upgrade deliberately. GraphQL only, cost-aware, cursor pagination, fragments in `server/shopify/queries`.
- Reads cached via Next data cache tags (`product:{handle}`, `collection:{handle}`) + Redis. Webhooks (`products/update`, `collections/update`, `inventory_levels/update`) call `revalidateTag`. Retry with backoff on `THROTTLED`.
- Cart: Shopify Cart API (`cartCreate`, `cartLinesAdd/Update/Remove`); `checkoutUrl` → hosted checkout. Guest cart id in an httpOnly cookie, linked to the user via `buyerIdentity` on login.
- Missing/empty Shopify data degrades gracefully (empty states in existing styles), never crashes a page.

## 9. Queue, worker, realtime
- Queue interface `enqueue(name, payload, {jobId})`. Phase A: Mongo `jobs` outbox (status, attempts, runAt, unique jobId) drained by a Vercel Cron route (signed `CRON_SECRET`). Phase B: BullMQ queues: `email`, `shopify-sync`, `webhook`, `notification`. Jobs: zod-typed payloads, idempotent, exponential-backoff `attempts`, failed-job retention, job ids from business keys.
- Producers in the app (`server/queue`); consumers only in `worker/` (own Dockerfile, health endpoint, graceful SIGTERM).
- No long-running work or persistent connections in Vercel functions. Notifications are persisted in Mongo, fanned out via Redis pub/sub → SSE/Socket gateway in the worker service (authenticated with the access token); client falls back to polling.
- Emails: React Email, brand tokens (cream/forest/clay; Fraunces/Work Sans with safe fallbacks), plain-text alternative.

## 10. Rendering strategy (follow strictly; details in `docs/ARCHITECTURE.md` §17)
- Static/identical-for-everyone content ⇒ SSG + ISR (`export const revalidate = 3600` + tagged Shopify fetches + webhook revalidation). Home, collection, product pages.
- URL-state or per-request content ⇒ SSR (`/shop`). Per-user data (cart, account, notifications) ⇒ CSR islands after hydration, never in cached HTML.
- Server Components by default; `"use client"` only on the smallest leaf needing state/effects. Never touch `cookies()`, `headers()` or `searchParams` in a page meant to stay static.
- Admin (future) is dynamic-only, `no-store`, `noindex`, auth + role verified at every layer (not just `proxy.ts`). Owner will guide its design before any implementation.

## 11. Performance (1M-user target)
- Static/ISR for home, collections, products; dynamic bits (cart count, user) load client-side. Public pages never hit Mongo.
- `next/image` with explicit sizes (no layout shift). Fonts via `next/font` with the same families/weights.
- Mongo: indexes in models (`users.email` unique, `sessions.hash`, `notifications {userId, createdAt}`), `lean()` reads, connection cached across invocations.
- Budgets: LCP < 2.5s, CLS < 0.05, TBT < 200ms (Lighthouse CI), API p95 < 300ms. k6 load test before each major release.

## 12. Testing policy
1. Unit (Vitest): services, mappers, token logic.
2. Integration: route handlers against real Mongo/Redis (Docker); Shopify mocked at the HTTP boundary (MSW) in tests only.
3. Playwright (real browser): smoke (home → collection → product → add to cart → checkout redirect), auth flows, regression, mobile/tablet/desktop, visual locks.
4. Negative/behavioral: expired token, reused refresh token, rate limit, bad HMAC, Shopify down.
Done = lint + typecheck + tests green, visual baselines unchanged, no new console errors, axe a11y pass.

## 13. CI/CD
GitHub Actions on every PR and push to `dev`/`main`: lint, typecheck, unit, build, Playwright (smoke + visual), `npm audit`, gitleaks. **Deployment is manual** (owner deploys to Vercel); never add auto-deploy workflows. After a deploy, run the manual "Production smoke test" workflow with the prod URL. Rollback: Vercel dashboard → previous deployment → Promote to Production.

## 14. Commands
`npm run dev|build|start|lint|typecheck|test|test:e2e`. Visual lock against a running server: `BASE_URL=http://localhost:3100 npx playwright test` (without BASE_URL Playwright builds and starts the app itself on :3100).
Later: `docker compose up -d mongo` (Phase 3), `docker compose up worker` (Phase B).
Cautions: never `pkill -f` with a pattern matching your own command line; `npx`/`npm` wrappers hide the real PID — start servers with `node node_modules/next/dist/bin/next start` and kill that PID.

## 15. Working agreement
- Start each task from `docs/IMPLEMENTATION_PLAN.md` (current phase, acceptance criteria); tick the checklist when done.
- Prefer editing existing files; reuse before creating; small reviewable commits.
- Report honestly: failing tests, skipped steps and unknowns are stated plainly.
- Blocked on credentials, a decision, or anything that could alter the design: ask, don't guess.
