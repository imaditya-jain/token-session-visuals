import { describe, expect, it } from "vitest";

import { collectionPosition, isStorefrontCollection, mapCollection, mapProduct } from "./mappers";
import type { CollectionNode, ProductNode } from "./schemas";

const baseProduct: ProductNode = {
  id: "gid://shopify/Product/1",
  handle: "monstera-deliciosa",
  title: "Monstera Deliciosa",
  productType: "House Plants",
  tags: ["Fernwood", "House Plants"],
  availableForSale: true,
  priceRange: { minVariantPrice: { amount: "49.0" } },
  compareAtPriceRange: { minVariantPrice: { amount: "0.0" } },
  variants: { nodes: [{ id: "gid://shopify/ProductVariant/1001" }] },
  featuredImage: { url: "https://cdn.shopify.com/s/files/1/x/files/product-monstera.jpg" },
  light: { value: "Bright, indirect light" },
  size: { value: '24" — 34" tall' },
  collections: {
    nodes: [
      { handle: "house-plants", tagline: { value: "Lush classics" } },
      { handle: "frontpage", tagline: null },
    ],
  },
};

describe("mapProduct", () => {
  it("maps core fields and keeps only storefront collections", () => {
    const product = mapProduct(baseProduct);
    expect(product).toMatchObject({
      slug: "monstera-deliciosa",
      name: "Monstera Deliciosa",
      category: "House Plants",
      price: 49,
      inStock: true,
      light: "Bright, indirect light",
      collectionSlugs: ["house-plants"],
    });
    expect(product.compareAtPrice).toBeUndefined();
    expect(product.badge).toBeUndefined();
  });

  it("sets compareAtPrice only when it exceeds price", () => {
    const sale = mapProduct({
      ...baseProduct,
      compareAtPriceRange: { minVariantPrice: { amount: "59.0" } },
    });
    expect(sale.compareAtPrice).toBe(59);
  });

  it("derives the badge by priority Sale > New > Bestseller", () => {
    expect(mapProduct({ ...baseProduct, tags: ["Bestseller", "New"] }).badge).toBe("New");
    expect(mapProduct({ ...baseProduct, tags: ["Bestseller", "Sale", "New"] }).badge).toBe("Sale");
    expect(mapProduct({ ...baseProduct, tags: ["Bestseller"] }).badge).toBe("Bestseller");
  });

  it("degrades gracefully when metafields and image are missing", () => {
    const product = mapProduct({ ...baseProduct, light: null, size: null, featuredImage: null });
    expect(product).toMatchObject({ light: "", size: "", image: "" });
  });

  it("rejects non-numeric money", () => {
    expect(() =>
      mapProduct({ ...baseProduct, priceRange: { minVariantPrice: { amount: "abc" } } }),
    ).toThrow(/Invalid money amount/);
  });
});

describe("mapCollection", () => {
  const node: CollectionNode = {
    handle: "house-plants",
    title: "House Plants",
    description: "Nursery-grown.",
    image: { url: "https://cdn.shopify.com/s/files/1/x/files/c.jpg" },
    tagline: { value: "Lush classics for every room" },
    position: { value: "2" },
  };

  it("maps a collection", () => {
    expect(mapCollection(node)).toEqual({
      slug: "house-plants",
      name: "House Plants",
      tagline: "Lush classics for every room",
      description: "Nursery-grown.",
      image: "https://cdn.shopify.com/s/files/1/x/files/c.jpg",
    });
  });

  it("orders by position and treats missing/invalid as last", () => {
    expect(collectionPosition(node)).toBe(2);
    expect(collectionPosition({ ...node, position: null })).toBe(Number.MAX_SAFE_INTEGER);
    expect(collectionPosition({ ...node, position: { value: "x" } })).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("treats only tagline-bearing collections as storefront collections", () => {
    expect(isStorefrontCollection(node)).toBe(true);
    expect(isStorefrontCollection({ tagline: null })).toBe(false);
    expect(isStorefrontCollection({ tagline: { value: "" } })).toBe(false);
  });
});
