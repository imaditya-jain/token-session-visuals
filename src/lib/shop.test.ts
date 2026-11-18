import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  parseShopQuery,
  resetPaging,
  shopHref,
  shopQueryToSearchParams,
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
