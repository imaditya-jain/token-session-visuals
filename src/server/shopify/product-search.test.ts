import { describe, expect, it } from "vitest";

import { parseShopQuery } from "@/lib/shop";

import { buildProductSearchQuery, sortArgs } from "./product-search";

describe("buildProductSearchQuery", () => {
  it("is undefined without filters", () => {
    expect(buildProductSearchQuery(parseShopQuery({}))).toBeUndefined();
  });

  it("builds availability, price and type clauses", () => {
    const query = parseShopQuery({
      stock: "in",
      min: "10",
      max: "40",
      type: ["House Plants", "Pots & Planters"],
    });
    expect(buildProductSearchQuery(query)).toBe(
      'available_for_sale:true AND variants.price:>=10 AND variants.price:<=40 AND (product_type:"House Plants" OR product_type:"Pots & Planters")',
    );
  });

  it("treats both availability boxes as no restriction and out-of-stock as false", () => {
    expect(buildProductSearchQuery(parseShopQuery({ stock: ["in", "out"] }))).toBeUndefined();
    expect(buildProductSearchQuery(parseShopQuery({ stock: "out" }))).toBe(
      "-available_for_sale:true",
    );
  });

  it("escapes quotes and backslashes so users cannot inject search operators", () => {
    const query = parseShopQuery({ type: ['x" OR title:* OR "', "back\\slash"] });
    const built = buildProductSearchQuery(query)!;
    expect(built).toContain('product_type:"x\\" OR title:* OR \\""');
    expect(built).toContain('product_type:"back\\\\slash"');
  });
});

describe("sortArgs", () => {
  it("maps UI sorts to Shopify sort keys", () => {
    expect(sortArgs("featured")).toEqual({ sortKey: "ID", reverse: false });
    expect(sortArgs("best-selling")).toEqual({ sortKey: "BEST_SELLING", reverse: false });
    expect(sortArgs("alpha-desc")).toEqual({ sortKey: "TITLE", reverse: true });
    expect(sortArgs("price-asc")).toEqual({ sortKey: "PRICE", reverse: false });
    expect(sortArgs("price-desc")).toEqual({ sortKey: "PRICE", reverse: true });
  });
});

describe("collection listings", () => {
  it("maps sorts to collection sort keys", async () => {
    const { collectionSortArgs } = await import("./product-search");
    expect(collectionSortArgs("featured")).toEqual({
      sortKey: "COLLECTION_DEFAULT",
      reverse: false,
    });
    expect(collectionSortArgs("price-desc")).toEqual({ sortKey: "PRICE", reverse: true });
    expect(collectionSortArgs("alpha-asc")).toEqual({ sortKey: "TITLE", reverse: false });
  });

  it("builds typed filters (no string escaping involved)", async () => {
    const { buildCollectionFilters } = await import("./product-search");
    expect(buildCollectionFilters(parseShopQuery({}))).toEqual([]);
    expect(
      buildCollectionFilters(
        parseShopQuery({
          stock: "out",
          min: "10",
          max: "40",
          type: ["House Plants", "Seeds & Tools"],
        }),
      ),
    ).toEqual([
      { available: false },
      { price: { min: 10, max: 40 } },
      { productType: "House Plants" },
      { productType: "Seeds & Tools" },
    ]);
    expect(buildCollectionFilters(parseShopQuery({ stock: ["in", "out"] }))).toEqual([]);
    expect(buildCollectionFilters(parseShopQuery({ max: "5" }))).toEqual([{ price: { max: 5 } }]);
  });
});

describe("free-text search", () => {
  it("builds prefix terms and combines them with filters", () => {
    expect(buildProductSearchQuery(parseShopQuery({ q: "Snake plant" }))).toBe(
      "(snake* AND plant*)",
    );
    expect(buildProductSearchQuery(parseShopQuery({ q: "fern", stock: "in" }))).toBe(
      "(fern*) AND available_for_sale:true",
    );
  });

  it("cannot inject search syntax", () => {
    const built = buildProductSearchQuery(parseShopQuery({ q: 'x" OR tag:secret -foo (' }));
    expect(built).toBe("(x* AND or* AND tag* AND secret* AND foo*)");
    expect(built).not.toMatch(/[":()-]\S*secret|"|:/);
  });

  it("sorts by relevance only when searching with the default sort", () => {
    expect(sortArgs("featured", true)).toEqual({ sortKey: "RELEVANCE", reverse: false });
    expect(sortArgs("price-asc", true)).toEqual({ sortKey: "PRICE", reverse: false });
    expect(sortArgs("featured")).toEqual({ sortKey: "ID", reverse: false });
  });
});
