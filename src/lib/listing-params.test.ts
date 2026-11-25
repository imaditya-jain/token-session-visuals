import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseShopQuery, shopQueryToSearchParams } from "./shop";

/**
 * `next.config.ts` serves a shop or collection address from the prebuilt default view only when none of the listing
 * parameters is present. If a parameter were ever added to the listing without being added there, that view would
 * silently ignore it, so this test keeps the two lists identical.
 */
describe("listing parameters in next.config.ts", () => {
  const source = readFileSync("next.config.ts", "utf8");
  const listed = [
    ...(/LISTING_PARAMS = \[([^\]]*)\]/.exec(source)?.[1] ?? "").matchAll(/"([^"]+)"/g),
  ].map((m) => m[1]);

  it("are exactly the parameters the listing writes into links", () => {
    const written = new Set(
      shopQueryToSearchParams({
        search: "fern",
        sort: "price-asc",
        inStock: true,
        outOfStock: true,
        min: 1,
        max: 2,
        types: ["Plants"],
        after: "a",
        before: "b",
        page: 2,
      }).keys(),
    );
    expect(new Set(listed)).toEqual(written);
  });

  it("are exactly the parameters the listing reads", () => {
    const read = new Set<string>();
    const probe = new Proxy({} as Record<string, string>, {
      get: (_target, key) => {
        if (typeof key === "string") read.add(key);
        return undefined;
      },
    });
    parseShopQuery(probe);
    expect(new Set(listed)).toEqual(read);
  });
});
