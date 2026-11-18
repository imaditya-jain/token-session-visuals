import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Collection, Product } from "@/lib/types";

const shopify = vi.hoisted(() => ({
  getCollections: vi.fn(),
  getCollection: vi.fn(),
  getCollectionProducts: vi.fn(),
  getBestSellers: vi.fn(),
  getProduct: vi.fn(),
  getProducts: vi.fn(),
  hasProducts: vi.fn(),
}));
vi.mock("@/server/services/catalog", () => shopify);
vi.mock("@/server/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
// React's request-scoped cache would memoize across tests; make it a passthrough here.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T>(fn: T) => fn,
}));

import { fallbackCollections, fallbackProducts } from "@/data/fallback-catalog";

import * as catalog from "./catalog";

const liveCollection: Collection = {
  slug: "live",
  name: "Live",
  tagline: "t",
  description: "",
  image: "",
};
const liveProduct: Product = {
  id: "1",
  slug: "live-product",
  name: "Live product",
  category: "House Plants",
  price: 1,
  image: "",
  light: "",
  size: "",
  inStock: true,
  collectionSlugs: ["live"],
};

describe("catalog facade source selection", () => {
  beforeEach(() => vi.resetAllMocks());

  it("serves Shopify data when the store has products and storefront collections", async () => {
    shopify.getCollections.mockResolvedValue([liveCollection]);
    shopify.hasProducts.mockResolvedValue(true);
    shopify.getProduct.mockResolvedValue(liveProduct);
    shopify.getCollectionProducts.mockResolvedValue([liveProduct]);

    expect(await catalog.getCollections()).toEqual([liveCollection]);
    expect(await catalog.getProduct("live-product")).toEqual(liveProduct);
  });

  it("returns undefined (404) for unknown handles in live mode instead of falling back", async () => {
    shopify.getCollections.mockResolvedValue([liveCollection]);
    shopify.hasProducts.mockResolvedValue(true);
    shopify.getProduct.mockResolvedValue(undefined);
    expect(await catalog.getProduct(fallbackProducts[0]!.slug)).toBeUndefined();
  });

  it("falls back when Shopify has products but no storefront collections", async () => {
    shopify.getCollections.mockResolvedValue([]);
    shopify.hasProducts.mockResolvedValue(true);
    expect(await catalog.getCollections()).toEqual(fallbackCollections);
    expect(shopify.getProduct).not.toHaveBeenCalled();
  });

  it("falls back when Shopify has collections but no products", async () => {
    shopify.getCollections.mockResolvedValue([liveCollection]);
    shopify.hasProducts.mockResolvedValue(false);
    expect(await catalog.getProducts()).toEqual(fallbackProducts);
  });

  it("falls back when Shopify errors or is unconfigured", async () => {
    shopify.getCollections.mockRejectedValue(new Error("Invalid Shopify environment"));
    shopify.hasProducts.mockResolvedValue(true);
    expect((await catalog.getBestSellers()).length).toBe(8);
    expect((await catalog.getCollectionProducts("house-plants")).length).toBeGreaterThan(0);
  });

  it("derives related products from the primary collection", async () => {
    shopify.getCollections.mockResolvedValue([]);
    shopify.hasProducts.mockResolvedValue(false);
    const monstera = fallbackProducts[0]!;
    const related = await catalog.getRelatedProducts(monstera);
    expect(related).toHaveLength(4);
    expect(related.map((p) => p.slug)).not.toContain(monstera.slug);
    expect(await catalog.getRelatedProducts({ ...monstera, collectionSlugs: [] })).toEqual([]);
  });

  it("fallback handles are unique and every product belongs to a fallback collection", () => {
    expect(new Set(fallbackProducts.map((p) => p.slug)).size).toBe(fallbackProducts.length);
    const slugs = new Set(fallbackCollections.map((c) => c.slug));
    for (const product of fallbackProducts)
      for (const s of product.collectionSlugs) expect(slugs.has(s)).toBe(true);
  });
});
