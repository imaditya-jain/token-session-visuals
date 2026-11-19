# Fernwood Storefront

Next.js (App Router) storefront in the Shopify Whisk "Greenhouse" style. The visual design is locked and enforced by Playwright golden screenshots in `e2e/__baselines__`.

```sh
npm install
npm run dev          # http://localhost:3000
npm run build && npm start
npm run lint && npm run typecheck && npm test
npm run test:e2e     # visual lock + smoke (builds and serves the app on :3100)
```

See `CLAUDE.md`, `docs/ARCHITECTURE.md` and `docs/IMPLEMENTATION_PLAN.md`.
