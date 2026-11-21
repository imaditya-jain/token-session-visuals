# Runbooks

Operational procedures for the Fernwood storefront. Deployment is manual (Vercel); nothing here is automated on purpose.
Where a step says "owner", it needs a dashboard login only the store owner has.

## 1. Rollback

**Symptom:** a deploy broke something users can see (errors, blank pages, failed logins).

1. Vercel dashboard -> Deployments -> the last known-good deployment -> **Promote to Production**. Takes seconds, no rebuild.
2. Run the manual **Production smoke test** workflow (GitHub Actions) with the production URL.
3. In git, do NOT force-push or rewrite history. Fix forward on a `fix/*` branch cut from `dev`, or `git revert <merge-commit>` on `dev`, then merge to `main` as usual.
4. Data: no deploy ever runs destructive migrations (indexes are ensured at startup, models only add fields), so a code rollback is always safe for the database. If a release added a new field, the old code simply ignores it.

**Rollback does not undo:** emails already sent, Shopify changes, queued jobs. Queued jobs are idempotent and retried by the new (old) code.

## 2. Incident response

Severity guide: **SEV1** = checkout/login down or customer data exposed; **SEV2** = a feature degraded; **SEV3** = cosmetic.

1. **Detect.** The `Uptime` GitHub workflow fails (probes `/api/health` every 15 min, and `/api/health/ready` when `READINESS_SECRET` is set). Sentry (if enabled) reports unexpected 500s and permanently failed jobs.
2. **Triage (first 15 min).** Is it us or a dependency?
   - `GET /api/health/ready` with `Authorization: Bearer $CRON_SECRET`: reports MongoDB reachability and whether Shopify/email are configured.
   - Database down -> API answers `503 service_unavailable` + `Retry-After` by design; static pages keep serving. Check Atlas status and the Network Access allow-list.
   - Shopify down -> catalog falls back to the built-in design data, cart answers `503 cart_unavailable`, orders `503 orders_unavailable`. Check status.shopify.com.
   - Bad deploy -> section 1.
3. **Contain.** Suspected account abuse: rate limits are per IP and per account already; tighten in code only via a normal fix. Suspected leaked secret: section 3 immediately.
4. **Personal data exposed (breach).** Note what, when and how many. GDPR requires notifying the regulator within 72 hours of becoming aware, and affected people without undue delay when risk is high. Decide with the owner/legal; this repo cannot decide it for you.
5. **Recover and review.** Write down timeline, cause, fix and the test that now prevents it (an e2e or integration test is part of the fix).

## 3. Secret rotation

Rotate on schedule (suggest every 12 months), on staff change, and **immediately** on suspected leak. Set the new value in Vercel (and Docker env if self-hosting), then redeploy. Impact differs a lot per secret:

| Secret | What it protects | Impact of rotating |
|---|---|---|
| `ACCESS_TOKEN_SECRET` | access JWTs (15 min) | Every signed-in browser silently refreshes once. Harmless. Must differ from the refresh secret. |
| `REFRESH_TOKEN_SECRET` | refresh-token hashes, one-time email/reset tokens, newsletter unsubscribe links, cart cookie signature, order e-mail keys | **Everyone is signed out**, pending verify/reset links stop working (users request new ones), old unsubscribe links in sent emails stop working, guest carts are forgotten (cookie ignored; the Shopify cart itself survives until it expires), and order-to-account linking for guest orders (`emailKey`) breaks until the mirror is re-keyed. Plan it: do it in a quiet period. Rotating on a leak is still correct: it invalidates every session an attacker could hold. |
| `SHOPIFY_STOREFRONT_API_ACCESS_TOKEN` | public catalog and cart API | Create the new token in Shopify, swap, redeploy, delete the old one. No customer impact. |
| `SHOPIFY_ADMIN_API_ACCESS_TOKEN` | customer data, orders, mirror | Same; if leaked, treat as a data incident (section 2). Least-privilege scopes only. |
| `SHOPIFY_WEBHOOK_SECRET` | webhook signature | Must match what Shopify signs with. Update the app secret and the env together, then re-run the webhook registration script; webhooks fail closed (rejected) in between and Shopify retries. |
| `CRON_SECRET` | cron + readiness endpoints | Update Vercel env (Vercel Cron sends it automatically), the `scheduler` container env, and the GitHub `READINESS_SECRET`. |
| `MONGODB_URI` credentials | the database | Create a second Atlas user, swap env, redeploy, delete the first user. |
| `SMTP_PASS` | outgoing email | Create a new Gmail app password, swap, redeploy. Queued emails retry. |
| `SENTRY_AUTH_TOKEN` / DSN | monitoring | Build-time only / public by design. |

After any rotation: run the smoke test, then check `/api/health/ready`.
Never paste secrets in chat, issues, commits or logs. `gitleaks` runs in CI; if it flags a secret, rotate it, don't just delete the commit.

## 4. Backups and restore (known gap)

The database is MongoDB Atlas **free tier (M0), which has no automated backups**. What that means in practice:
- Lost data would be accounts, sessions, notifications, newsletter subscribers and the mirrors. Orders, products and customers are **in Shopify**, which stays the source of truth, and the mirrors can be rebuilt by the daily backfill job.
- Not recoverable from Shopify: password hashes, newsletter consent history, in-app notifications.
- Before real sales, move to a paid Atlas tier with continuous backup (or schedule `mongodump` yourself) and rehearse one restore. Until then, `mongodump` before risky changes.

## 5. Common operations

- **Re-register webhooks (new domain/env):** `node --env-file=.env scripts/register-shopify-webhooks.ts --url https://<domain>` (dry run), add `--apply`.
- **Stuck background jobs:** `GET /api/cron/jobs` with the Bearer `CRON_SECRET` drains emails and jobs and shows counts. Failed jobs are reported to Sentry.
- **Rebuild a catalog that looks stale:** a product/collection webhook revalidates it; otherwise ISR refreshes within 1 hour.
- **A customer asks for their data or deletion:** both are self-service on `/account`. Shopify keeps order records it is legally required to.
- **Load test before a major release:** `scripts/load-test.sh all <staging-url>` (staging only).
