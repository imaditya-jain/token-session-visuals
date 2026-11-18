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
- Catalog is still static in `src/data/catalog.ts` (24 products, 4 collections, sync) with images in `public/images`. Becomes async/Shopify-backed in Phase 2.
- Redux store (`src/store`, slice `ui`) and Lenis smooth scroll (`components/providers`) are wired. Cart, account, newsletter are still UI shells (no behavior); nothing from Shopify, Mongo or auth exists yet.
- Fonts are self-hosted via `next/font/local` from the exact Google woff2 files of the original request (`src/fonts`, see its README); never switch to `next/font/google` (different font build ⇒ visual drift, verified). Images use `next/image` with explicit `sizes`.
- Scope: ONLY home, collection, product pages plus the behavior behind header cart/search/account. No extra pages without user approval.
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
- Headers: CSP with nonces, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, frame-ancestors none.
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

## 10. Performance (1M-user target)
- Static/ISR for home, collections, products; dynamic bits (cart count, user) load client-side. Public pages never hit Mongo.
- `next/image` with explicit sizes (no layout shift). Fonts via `next/font` with the same families/weights.
- Mongo: indexes in models (`users.email` unique, `sessions.hash`, `notifications {userId, createdAt}`), `lean()` reads, connection cached across invocations.
- Budgets: LCP < 2.5s, CLS < 0.05, TBT < 200ms (Lighthouse CI), API p95 < 300ms. k6 load test before each major release.

## 11. Testing policy
1. Unit (Vitest): services, mappers, token logic.
2. Integration: route handlers against real Mongo/Redis (Docker); Shopify mocked at the HTTP boundary (MSW) in tests only.
3. Playwright (real browser): smoke (home → collection → product → add to cart → checkout redirect), auth flows, regression, mobile/tablet/desktop, visual locks.
4. Negative/behavioral: expired token, reused refresh token, rate limit, bad HMAC, Shopify down.
Done = lint + typecheck + tests green, visual baselines unchanged, no new console errors, axe a11y pass.

## 12. CI/CD
GitHub Actions: PR/`dev` → lint, typecheck, unit, integration, build, Playwright (incl. visual), audit. `main` → Vercel production deploy → post-deploy smoke against prod URL → on failure auto-rollback (`vercel rollback` to last good deployment) and open an issue. Preview deploys per PR.

## 13. Commands
`npm run dev|build|start|lint|typecheck|test|test:e2e`. Visual lock against a running server: `BASE_URL=http://localhost:3100 npx playwright test` (without BASE_URL Playwright builds and starts the app itself on :3100).
Later: `docker compose up -d mongo` (Phase 3), `docker compose up worker` (Phase B).
Cautions: never `pkill -f` with a pattern matching your own command line; `npx`/`npm` wrappers hide the real PID — start servers with `node node_modules/next/dist/bin/next start` and kill that PID.

## 14. Working agreement
- Start each task from `docs/IMPLEMENTATION_PLAN.md` (current phase, acceptance criteria); tick the checklist when done.
- Prefer editing existing files; reuse before creating; small reviewable commits.
- Report honestly: failing tests, skipped steps and unknowns are stated plainly.
- Blocked on credentials, a decision, or anything that could alter the design: ask, don't guess.
