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
| 1 | CMS pages and sections | [ ] | Needs each storefront page's content moved into data with identical defaults |
| 2 | Header, announcement, footer, social links | [x] | Built and verified on `feat/site-chrome`; **41 screenshot baselines await owner approval** (the new "Journal" link) |
| 3 | Blog completion + storefront nav | [x] | Blog pages use the common header/footer; "Journal" is in the header menu and footer; remaining blog gaps (revisions, autosave) are listed in CLAUDE.md |
| 4 | Wholesale + contact management | [x] | Saved in MongoDB, team + sender emails, admin lists/detail/notes/assign/archive/delete/export; sender acknowledgement is limited to one per address per day |
| 5 | Shopify products, variants, inventory | [ ] | Admin token scopes `read/write_products`, `read/write_inventory` are already granted |
| 6 | Order management | [ ] | `read_orders` granted; refunds/cancel need `write_orders` (granted) |
| 7 | Gardening subscriptions | [ ] | **Dependency:** Seal Subscriptions API key (the provider); without it only Shopify-side data can be shown |
| 8 | Business analytics | [ ] | Shopify Admin data + Mongo; metrics without a source are shown as "unavailable", never zero |
| 9 | Email templates + campaigns | [ ] | Needs an email provider for real volume (Gmail SMTP caps at ~500/day); open/click tracking needs one too |
| 10 | Media library (central) + social links | [~] | Social links done with phase 2; the central library generalises the blog's media (folders, reuse in pages/campaigns) |
| 11 | Responsive testing + integration | [ ] | Axe + overflow checks per module as they land |

## Decisions recorded
- Storefront chrome defaults are the current hard-coded content, so nothing changes visually until the owner publishes.
- The owner asked for the blog to be reachable from the storefront navigation: "Journal" is added to the default
  header menu and footer Company column (the only visual change; affected baselines are listed in the commit).
