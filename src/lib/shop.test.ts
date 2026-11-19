import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  parseShopQuery,
  resetPaging,
  shopHref,
  shopQueryToSearchParams,
  searchTerms,
} from "./shop";

describe("parseShopQuery", () => {
  it("returns defaults for empty params", () => {
    expect(parseShopQuery({})).toEqual({
      page: 1,
      sort: "featured",
      inStock: false,
      outOfStock: false,
      types: [],
    });
  });

  it("parses filters, sort, cursors and repeated params", () => {
    const query = parseShopQuery({
      sort: "price-desc",
      stock: ["in", "out"],
      min: "10",
      max: "50.5",
      type: ["House Plants", "Pots & Planters", "House Plants"],
      after: "abc",
      page: "3",
    });
    expect(query).toMatchObject({
      sort: "price-desc",
      inStock: true,
      outOfStock: true,
      min: 10,
      max: 50.5,
      types: ["House Plants", "Pots & Planters"],
      after: "abc",
      page: 3,
    });
  });

  it("falls back safely on hostile or invalid input", () => {
    const query = parseShopQuery({
      sort: "drop table",
      min: "-5",
      max: "NaN",
      page: "-1",
      after: "x".repeat(600),
      type: ["", "y".repeat(200)],
    });
    expect(query).toEqual({
      page: 1,
      sort: "featured",
      inStock: false,
      outOfStock: false,
      types: [],
    });
  });

  it("prefers `after` when both cursors are supplied", () => {
    const query = parseShopQuery({ after: "a", before: "b" });
    expect(query.after).toBe("a");
    expect(query.before).toBeUndefined();
  });
});

describe("URL serialization", () => {
  it("omits defaults and round-trips", () => {
    const query = parseShopQuery({
      sort: "alpha-asc",
      type: "Seeds & Tools",
      min: "5",
      stock: "in",
    });
    const params = Object.fromEntries([...shopQueryToSearchParams(query)].map(([k, v]) => [k, v]));
    expect(params).toEqual({ sort: "alpha-asc", stock: "in", min: "5", type: "Seeds & Tools" });
    expect(shopHref({})).toBe("/shop");
    expect(parseShopQuery(Object.fromEntries(shopQueryToSearchParams(query)))).toEqual(query);
  });

  it("resetPaging drops cursors and page but keeps filters", () => {
    const next = resetPaging(
      parseShopQuery({ after: "c", page: "4", sort: "price-asc", min: "3" }),
    );
    expect(next).toMatchObject({ page: 1, sort: "price-asc", min: 3 });
    expect(next.after).toBeUndefined();
  });

  it("counts active filters", () => {
    expect(
      activeFilterCount(parseShopQuery({ stock: "in", min: "1", max: "9", type: ["a", "b"] })),
    ).toBe(5);
    expect(activeFilterCount(parseShopQuery({ sort: "price-asc" }))).toBe(0);
  });
});

describe("listingSummary", () => {
  const single = { hasNextPage: false, hasPreviousPage: false };
  it("shows a plain count when everything fits on one page", async () => {
    const { listingSummary } = await import("./shop");
    expect(listingSummary(parseShopQuery({}), single, 8)).toBe("8 products");
    expect(listingSummary(parseShopQuery({}), single, 1)).toBe("1 product");
    expect(listingSummary(parseShopQuery({}), single, 0)).toBe("0 products");
  });

  it("shows the range on multi-page listings", async () => {
    const { listingSummary } = await import("./shop");
    expect(
      listingSummary(parseShopQuery({}), { hasNextPage: true, hasPreviousPage: false }, 12),
    ).toBe("Showing 1–12 products");
    expect(
      listingSummary(
        parseShopQuery({ page: "2" }),
        { hasNextPage: false, hasPreviousPage: true },
        8,
      ),
    ).toBe("Showing 13–20 products");
    expect(
      listingSummary(
        parseShopQuery({ page: "3" }),
        { hasNextPage: false, hasPreviousPage: true },
        1,
      ),
    ).toBe("Showing 25 product");
  });
});

describe("search terms", () => {
  it("keeps letters and digits only, lowercased", () => {
    expect(searchTerms('  Snake-Plant! "x" OR (y):z* ')).toEqual([
      "snake",
      "plant",
      "x",
      "or",
      "y",
      "z",
    ]);
  });

  it("limits the number and length of terms and keeps non-latin letters", () => {
    expect(searchTerms("a b c d e f g h")).toHaveLength(6);
    expect(searchTerms("x".repeat(500))[0]).toHaveLength(40);
    expect(searchTerms("Zürich 植物")).toEqual(["zürich", "植物"]);
  });

  it("is empty for blank or missing input", () => {
    expect(searchTerms(undefined)).toEqual([]);
    expect(searchTerms("  !!! ")).toEqual([]);
  });

  it("parses q, ignores hostile values, and round-trips through the URL", () => {
    expect(parseShopQuery({ q: "Snake  Plant" }).search).toBe("snake plant");
    expect(parseShopQuery({ q: ["a", "b"] }).search).toBe("a");
    expect(parseShopQuery({ q: "***" }).search).toBeUndefined();
    expect(parseShopQuery({}).search).toBeUndefined();
    const query = parseShopQuery({ q: "fern", sort: "price-asc" });
    expect(shopQueryToSearchParams(query).toString()).toBe("q=fern&sort=price-asc");
    expect(resetPaging({ ...query, page: 3, after: "x" })).toMatchObject({ search: "fern" });
  });

  it("does not count the search term as a filter", () => {
    expect(activeFilterCount(parseShopQuery({ q: "fern" }))).toBe(0);
  });
});
