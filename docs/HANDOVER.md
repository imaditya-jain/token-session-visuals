# Handover: Fernwood storefront (staging to production)

Written for the owner, who will take this from staging to production. Everything below was built and verified against the **development store** (`StorePilot AI`) with real Shopify data. Nothing has been deployed or merged to `main`.

## 1. What is built

| Area | State |
|---|---|
| Storefront (home, collections, products, search, cart, account, orders, content pages) | Done. Design locked; 70 visual baselines guard it. |
| Catalog from Shopify with an offline fallback | Done. Live data always wins over the fallback. |
| Accounts, email verification, password reset, data export and deletion | Done. See `docs/SECURITY.md`. |
| Order history, notifications, optional branded order emails | Done. Emails are off by default (`ORDER_EMAIL_NOTIFICATIONS=false`). |
| Newsletter (double opt-in) and consent mirrored to Shopify | Done. |
| **Gifts collection** (10 products) | Done on the dev store. Placeholder prices, Unsplash photos (`docs/IMAGE_CREDITS.md`). |
| **Gardener service** (`/gardener-services`) | Done. One-time visit plus Monthly / Fortnightly / Weekly Seal subscription plans. Cities: Nagpur, Pune, Mumbai. |
| **Wholesale** (`/wholesale`) | Application form done. Pricing is Shopify B2B (catalog, price list, payment terms), set up on the dev store. |
| Observability, performance gates, load tests, Docker, runbooks, ASVS self-review | Done. |

## 2. How the three new features work

**Gifts.** Ordinary Shopify products in a `gifts` collection (`scripts/seed-gifts.ts`, `scripts/seed-data/gifts.json`). Stock is held at the same location as the original catalog. Replace the placeholder prices, texts and photos in Shopify admin; the site picks changes up within an hour or immediately through the product/collection webhooks.

**Gardener service.**
- The service is ONE Shopify product, `garden-care-visit` ($60 placeholder, `scripts/seed-services.ts`).
- The subscription plans are a Seal Subscriptions rule on that product, created in the Seal app (not code): Monthly $50, Fortnightly $45, Weekly $40 per visit.
- The booking form collects name, email, phone, city, address, preferred date, notes and an optional marketing checkbox. These become order line properties.
- The server also creates the Shopify customer if the email is unknown (never edits an existing one) and starts the double opt-in only if the box was ticked.
- The page shows "Booking opens soon" whenever the product is unpublished.

**Wholesale.**
1. A business applies on `/wholesale`. The application is emailed to your inbox (`CONTACT_INBOX`, default `SMTP_EMAIL`) with the applicant as reply-to. Nothing is sent to the applicant.
2. You review it. If approved, create the company in Shopify admin (Customers > Companies): add a location, a contact with the **Ordering only** role at that location, set payment terms, and attach the **Wholesale** catalog to the location.
3. The Wholesale catalog (`scripts/seed-wholesale.ts`) prices every product at a percentage off retail (30% is a placeholder; change it under Catalogs) and is published to all products.
4. Wholesale orders are placed through Shopify (B2B draft order or the company's own checkout), where the wholesale price and payment terms apply. **The headless storefront does not show wholesale prices**: its accounts are not Shopify customer accounts, so Shopify cannot tell the storefront who a company buyer is. Making that work means moving customer sign-in to Shopify's customer accounts, a separate project.

## 3. Test data on the dev store

- A sample company "Sample Wholesale Café" with one location and the Wholesale catalog (delete it before launch, or keep it as a reference).
- The Gifts collection and its 10 products, the Garden Care Visit product (now published) with its Seal rule.
- One customer tagged `gardener-booking` is yours from earlier testing; all my test customers were deleted.

## 4. What I verified against real Shopify data

- Production build served 53 of 53 sitemap URLs with HTTP 200 using live data.
- Gardener booking in a real browser: customer created with name, phone, Pune address and tags; the cart priced the Monthly plan at $50; the buyer email stays on the cart for a pre-filled checkout.
- Quick add on a gift product gives a real cart line and a working checkout redirect (this also caught a wrong stock location, now fixed).
- Wholesale price list: every gift product resolves to exactly 30% off for the sample company; a B2B draft order priced 10 units at $19.60 each (retail $28).
- Earlier: live order flow (draft, paid, shipped or cancelled), order history, notifications, data export and deletion.

Not verified live: a real payment (no payment gateway is configured on the dev store), the double opt-in email click-through against Shopify, and Seal charging a renewal.

## 5. Production checklist (yours)

1. **Shopify plan.** B2B needs Shopify Plus (or the plan tier that includes B2B). Confirm before relying on wholesale.
2. **Seal.** Install it on the production store, recreate the rule on the gardener product (same plans), and check your payment gateway is one Seal supports for auto-charging.
3. **Products.** Run the seeders against production only after review (they refuse non-development stores unless `SHOPIFY_ALLOW_WRITE=1`), or create the products by hand. Replace the placeholder prices, copy and the Unsplash photos.
4. **Environment variables** (Vercel): `SHOPIFY_STORE_URL`, `SHOPIFY_STOREFRONT_API_ACCESS_TOKEN`, `SHOPIFY_ADMIN_API_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `MONGODB_URI`, `SMTP_EMAIL`, `SMTP_PASS`, `CONTACT_INBOX`, `CRON_SECRET`, `SITE_URL` (**must be set where the app is built**, because pages bake it in), plus optional Sentry values. Generate fresh secrets; never reuse the staging ones.
5. **Admin token scopes** must include products, inventory, orders, customers (read and write), and for the seeders publications and companies.
6. **MongoDB Atlas.** Allow Vercel's IPs (or `0.0.0.0/0` with strong credentials) and move off the free tier to get backups (see `docs/RUNBOOKS.md`).
7. **Webhooks.** `node --env-file=.env scripts/register-shopify-webhooks.ts --url https://<domain> --apply`.
8. **Policies.** Write the four policy pages in Shopify (Settings > Policies); until then the site shows an "updating" notice.
9. **Owner decisions still open:** free-shipping threshold ($70 in site copy versus $75 in the announcement bar), social profile URLs, and a header/footer link to Gifts if you want one.
10. **Deploy** manually on Vercel, then run the "Production smoke test" workflow with the live URL and set the repo variable `PROD_URL` for uptime checks.

## 6. Known limits

- Performance: CI shows LCP about 3.6 to 4.7 s and a score of 0.83 to 0.90, against targets of 2.5 s and 0.9. The gates fail only on regressions; the remaining levers are listed in `CLAUDE.md`.
- Accessibility: `color-contrast` is excluded because the clay accent on small labels is 3.35:1; fixing it is a palette decision.
- Security gaps (no MFA, no breached-password check, no security audit log, free-tier database without backups) are listed in `docs/SECURITY.md`.
- The gardener booking creates the Shopify customer before payment. That is intended, but a visitor who never pays still leaves a customer record.
- Gmail SMTP caps at roughly 500 emails a day; real campaigns need an email provider.

## 7. Working on it

- Branches: `main` (production, not touched), `dev` (integration, everything here), short-lived `feat/*`, `fix/*`, `chore/*`.
- Commands: `npm run dev | build | lint | typecheck | test:unit | test:integration | test:e2e`. Visual lock: `npx playwright test`.
- Never run `--update-snapshots` to make a test pass; baselines change only with an approved design change.
- Rollback and incident steps: `docs/RUNBOOKS.md`. Security review: `docs/SECURITY.md`. Architecture and phase plan: `docs/ARCHITECTURE.md`, `docs/IMPLEMENTATION_PLAN.md`. Project rules and current state: `CLAUDE.md`.
