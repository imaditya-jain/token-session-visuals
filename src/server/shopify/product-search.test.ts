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
