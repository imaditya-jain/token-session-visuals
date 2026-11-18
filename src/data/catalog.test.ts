import { describe, expect, it } from "vitest";

import {
  bestSellers,
  collections,
  formatPrice,
  getCollection,
  getCollectionProducts,
  getProduct,
  products,
} from "@/data/catalog";

describe("catalog facade", () => {
  it("resolves products and collections by slug", () => {
    expect(getProduct("monstera-deliciosa")?.name).toBeTruthy();
    expect(getCollection("house-plants")?.slug).toBe("house-plants");
    expect(getProduct("does-not-exist")).toBeUndefined();
  });

  it("every product belongs to an existing collection", () => {
    const slugs = new Set(collections.map((c) => c.slug));
    for (const product of products) {
      expect(product.collectionSlugs.length).toBeGreaterThan(0);
      for (const slug of product.collectionSlugs) expect(slugs.has(slug)).toBe(true);
    }
  });

  it("has unique product slugs and public image paths", () => {
    expect(new Set(products.map((p) => p.slug)).size).toBe(products.length);
    for (const product of products) expect(product.image).toMatch(/^\/images\/.+\.jpg$/);
  });

  it("collection products only include members", () => {
    for (const product of getCollectionProducts("house-plants")) {
      expect(product.collectionSlugs).toContain("house-plants");
    }
    expect(bestSellers.length).toBeGreaterThan(0);
  });

  it("formats prices in USD", () => {
    expect(formatPrice(48)).toContain("48");
  });
});
