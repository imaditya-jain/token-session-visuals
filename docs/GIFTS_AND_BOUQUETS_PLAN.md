# Gifts & Bouquets section (inspired by gifting sites such as Ferns N Petals)

Requested 2026-11-27, to be built next. Nothing here is built yet.

## What the owner asked for
A gifting and bouquet section like the big flower-and-gift sites: shop by occasion, bouquets, arrangements, plant gifts and combos.

## Proposed shape (needs the owner's go-ahead)
1. **`/gifts` landing page** (editable in Page content): hero, "Shop by occasion" tiles (Birthday, Anniversary, Housewarming, Thank you, Get well, Congratulations), "Shop by type" (Bouquets, Plant gifts, Gift combos, Gift cards), a featured strip per collection, a gift-message note.
2. **Shopify collections** (the shop stays the source of truth): `bouquets`, `gift-combos` and occasion collections or tags (`occasion-birthday`, ...), using the same `custom.tagline` / `custom.position` metafields as today. Occasion tiles link to `/collections/<handle>`.
3. **Home page section** "Gifts & bouquets" between Best sellers and the Plant Finder teaser (new baselines once approved).
4. **Gift extras at product level** (needs a decision): a gift message and a preferred delivery date as cart line attributes (the gardener booking already uses attributes), and a "send as a gift" note on the order.
5. **App**: same section on Home plus a Gifts tab or screen, reading the same collections from the Storefront API.

## Decisions needed before building
- **Bouquets are a new product type.** Are they fresh flowers (needs same-day or next-day delivery rules, city list, delivery date slots, substitutions) or dried / preserved arrangements and plant bouquets (ships like the rest)? Fresh flowers change shipping, packaging and the guarantee copy.
- **Delivery scope**: India only? Which cities? Same-day cut-off times?
- **Who supplies the photos and prices?** The dev-store gifts use placeholder prices and Unsplash pictures (`docs/IMAGE_CREDITS.md`); real products need real photography.
- **Gift message and delivery date**: required, optional, or not at all?

## Not to invent
No delivery promises, cut-off times, freshness guarantees or prices in code. Everything customers read about delivery must come from `data/store-info.ts` or Page content that the owner approves.
