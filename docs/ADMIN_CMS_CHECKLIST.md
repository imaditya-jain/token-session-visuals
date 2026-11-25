# Admin CMS: business modules checklist

Status key: [x] done and verified · [~] partly done · [ ] not started. Updated as each module lands.
Everything below reuses the existing auth, RBAC, audit log, outbox email, Shopify clients, Mongo models and the
admin shell. Shopify stays the source of truth for products, variants, inventory and orders (nothing is duplicated
in MongoDB except read-only mirrors that already exist).

## Already in place before this program
- [x] Admin sign-in (password + emailed code), RBAC, Team, Roles, Activity, grouped sidebar
- [x] Blog: posts, categories, tags, five templates, scheduling, SEO, trash/restore, ISR, feed, sitemap
- [x] Media: Shopify Files upload/list/alt/delete (the blog's image library)
- [x] Wholesale and contact forms (outbox email to the business)
- [x] Newsletter double opt-in + `enqueueCampaign()` service, Shopify order/customer/product mirrors with webhooks
- [x] Gardener service page (Shopify product + Seal selling plans)

## Phases
| # | Module | Status | Notes / dependencies |
|---|---|---|---|
| 1 | CMS pages and sections | [x] | `/admin/site/pages`: 21 pages editable section by section (text, links, pictures, rich text, FAQs), draft/publish/discard, SEO title and description per page; defaults are the previous hard-coded content (visual baselines unchanged). Not editable here by design: Shopify-written policies, product/collection data, transactional account pages, search |
| 2 | Header, announcement, footer, social links | [x] | Built and verified on `feat/site-chrome`; **41 screenshot baselines await owner approval** (the new "Journal" link) |
| 3 | Blog completion + storefront nav | [x] | Blog pages use the common header/footer; "Journal" is in the header menu and footer; remaining blog gaps (revisions, autosave) are listed in CLAUDE.md |
| 4 | Wholesale + contact management | [x] | Saved in MongoDB, team + sender emails, admin lists/detail/notes/assign/archive/delete/export; sender acknowledgement is limited to one per address per day |
| 5 | Shopify products, variants, inventory | [x] | Products (create/edit/archive/delete, options, variants, images, collections, sales-channel publishing), inventory (low/sold-out, adjust with reason, history, threshold). Live-verified on the dev store: create, publish, edit, variant price, republish, delete. **Not live-verified:** image reorder/remove (Shopify returned no media right after adding) and activate-at-location |
| 6 | Order management | [x] | List (state/payment/fulfilment/date/search), detail like Shopify (items, payment, timeline, customer, addresses, shipments, notes/tags), fulfil with tracking, refund, cancel, CSV export. Live-verified read-only (list, filters, detail, suggested refund, CSV). **Fulfil, refund and cancel mutations are covered by code and types only; they were not run against real dev orders** |
| 7 | Gardening subscriptions | [~] | List/detail/pause/resume/cancel through the Seal Merchant API (`SEAL_API_TOKEN`). Live-verified: token accepted and list shape (`payload.subscriptions`, `next_cursor`); the dev store has no subscriptions yet, so detail and the pause/resume/cancel calls are unverified. Seal has no single "next billing date" field, so it is the earliest unprocessed billing attempt. Not built: skip/reschedule a charge |
| 8 | Business analytics | [x] | Dashboard "Business at a glance": date presets + custom range, revenue/orders/AOV/items/refunds/customers with change vs the previous period, daily chart, top products, to-fulfil, low stock, new enquiries, subscriptions. Each figure is `unavailable` with a reason when its source can't be read. Counts up to 2,000 orders per period (says so); dates are UTC; first-time vs returning uses the customer's current order count |
| 9 | Email templates + campaigns | [x] | 108 designs (12 layouts x 9 palettes), campaign editor with live preview, test send, send now, schedule, results (queued/delivered/waiting/failed). No open/click tracking, no segments (no provider for it); transactional emails keep one design |
| 10 | Media library (central) + social links | [x] | Folders, search, usage across posts/pages/header-footer/campaigns, replace in place with automatic update of every place using it, unused filter + bulk clean-up, delete refused while used. Social links done with phase 2. Replace live-verified on the dev store |
| 11 | Responsive testing + integration | [ ] | Axe + overflow checks per module as they land |

## Decisions recorded
- Storefront chrome defaults are the current hard-coded content, so nothing changes visually until the owner publishes.
- The owner asked for the blog to be reachable from the storefront navigation: "Journal" is added to the default
  header menu and footer Company column (the only visual change; affected baselines are listed in the commit).
