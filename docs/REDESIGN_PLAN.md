# Redesign + mobile app plan

Approved by the owner on 2026-11-26. Brand colours (forest, cream, clay) and fonts (Fraunces, Work Sans) stay. Order: website first, then a separate Expo app repository.

## What the current home page lacks (from a full-page review)
- Every section sits on the same cream or white background, so sections blur together. Only the story band is dark.
- The hero is a photo with centred text and a wave edge. There is no clear call to action hierarchy and no trust signals.
- The collections grid ends with a lone fifth card (Gifts) on its own row.
- Cards are flat with very similar weight everywhere. There is no rhythm between large and small blocks.
- The logo is plain text ("Fernwood"). There is no mark.
- No wishlist, no quick view, no trust bar (delivery, guarantee, packaging).

## Phase W1: design system and section rhythm
- Alternating section surfaces from existing tokens: cream, sage-tinted, forest-deep, clay-tinted. Soft organic dividers (leaf/curve SVG) between bands.
- Section header pattern: small eyebrow + display title + short line, used everywhere.
- Trust bar under the hero (delivery, 30-day guarantee, plastic-free packaging, grown in our greenhouse).
- Collections as a bento grid (one large + four small) so 5 items fill the layout.
- Logo: a leaf/sprout mark + wordmark, SVG, used in header, footer, favicon, emails and the app.
- Motion: reveal-on-scroll (respecting reduced motion), smoother hover and press states.

## Phase W2: modern Plant Finder and gardener plans
- Plant Finder: full-bleed stage, bigger swipe cards, personality result card, share and save to wishlist.
- Gardener plans: three pricing cards (Monthly / Fortnightly / Weekly), "Most popular" highlight, per-visit price, what is included, comparison list, FAQ.

## Phase W3: wishlist, account, orders
- Wishlist (web): heart on cards and product page, `/account/wishlist`, guests keep a local list that merges on sign-in. Stored per account in MongoDB, Shopify product GIDs only.
- Account page: summary header, quick links, recent orders, notifications.
- Order history like marketplaces: status chips, item thumbnails, track and reorder, filters by time range.

## Phase W4: verification
- Regenerate golden baselines only after the owner reviews screenshots. Update CLAUDE.md section 0 and the docs.

## Phase A: Expo app (separate repository)
- Expo + React Native, Expo Router, Reanimated and Gesture Handler (smooth transitions, gliding carousels, sliders, swipe deck), pull-to-refresh, secure token storage.
- Screens: home, shop and collections, product, search, Plant Finder, gardener plans, cart (hosted checkout), wishlist, account, orders, notifications, auth (login with code, sign up, forgot and reset password, verify account).
- Backend needed: a token-based refresh flow for mobile (the web cookie is httpOnly with Path=/api/auth), the shared wishlist API, and a documented API contract.
- Branding: same tokens, fonts and logo as the website.

## Not seen
The Dribbble shots could not be opened in this environment, so the proposals above come from the current site review and general nursery and plant-store design practice. Share screenshots of the parts you like most and I will match them.
