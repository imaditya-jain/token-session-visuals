import { describe, expect, it } from "vitest";

import { fallbackProducts } from "@/data/fallback-catalog";
import { parseShopQuery } from "@/lib/shop";

import { fallbackProductTypes, paginateFallback } from "./fallback-shop";

const q = (params: Record<string, string | string[]>) => parseShopQuery(params);

describe("paginateFallback", () => {
  it("returns 12 products then the remainder, with consistent cursors", () => {
    const first = paginateFallback(fallbackProducts, q({}));
    expect(first.products).toHaveLength(12);
    expect(first.pageInfo).toMatchObject({ hasNextPage: true, hasPreviousPage: false });

    const second = paginateFallback(fallbackProducts, q({ after: first.pageInfo.endCursor! }));
    expect(second.products).toHaveLength(fallbackProducts.length - 12);
    expect(second.pageInfo).toMatchObject({ hasNextPage: false, hasPreviousPage: true });

    const back = paginateFallback(fallbackProducts, q({ before: second.pageInfo.startCursor! }));
    expect(back.products.map((p) => p.id)).toEqual(first.products.map((p) => p.id));
  });

  it("never repeats or skips products across pages", () => {
    const ids = new Set<string>();
    let page = paginateFallback(fallbackProducts, q({}));
    ids.add(page.products[0]!.id);
    for (const p of page.products) ids.add(p.id);
    while (page.pageInfo.hasNextPage) {
      page = paginateFallback(fallbackProducts, q({ after: page.pageInfo.endCursor! }));
      for (const p of page.products) {
        expect(ids.has(p.id)).toBe(false);
        ids.add(p.id);
      }
    }
    expect(ids.size).toBe(fallbackProducts.length);
  });

  it("filters by availability, price and type", () => {
    expect(
      paginateFallback(fallbackProducts, q({ stock: "out" })).products.map((p) => p.slug),
    ).toEqual(["golden-barrel-cactus"]);
    const priced = paginateFallback(fallbackProducts, q({ min: "30", max: "40" })).products;
    expect(priced.length).toBeGreaterThan(0);
    expect(priced.every((p) => p.price >= 30 && p.price <= 40)).toBe(true);
    const typed = paginateFallback(fallbackProducts, q({ type: "Seeds & Tools" })).products;
    expect(typed.every((p) => p.category === "Seeds & Tools")).toBe(true);
  });

  it("sorts by price and name", () => {
    const asc = paginateFallback(fallbackProducts, q({ sort: "price-asc" })).products.map(
      (p) => p.price,
    );
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const names = paginateFallback(fallbackProducts, q({ sort: "alpha-desc" })).products.map(
      (p) => p.name,
    );
    expect(names).toEqual([...names].sort((a, b) => b.localeCompare(a)));
  });

  it("treats malformed cursors as the first page and handles empty results", () => {
    expect(paginateFallback(fallbackProducts, q({ after: "not-a-cursor" })).products).toHaveLength(
      12,
    );
    const none = paginateFallback(fallbackProducts, q({ min: "9999" }));
    expect(none.products).toEqual([]);
    expect(none.pageInfo).toEqual({ hasNextPage: false, hasPreviousPage: false });
  });

  it("lists product types alphabetically", () => {
    expect(fallbackProductTypes(fallbackProducts)).toEqual([
      "House Plants",
      "Pots & Planters",
      "Seeds & Tools",
      "Succulents & Cacti",
    ]);
  });
});
