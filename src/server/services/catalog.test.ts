import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetEnvCache } from "@/server/config/env";

import {
  getBestSellers,
  getCollection,
  getCollections,
  getProduct,
  getProductPage,
} from "./catalog";

const product = (
  handle: string,
  collections: { handle: string; tagline: string | null }[] = [],
) => ({
  id: `gid://shopify/Product/${handle}`,
  handle,
  title: handle,
  productType: "House Plants",
  tags: [],
  availableForSale: true,
  priceRange: { minVariantPrice: { amount: "10.0" } },
  compareAtPriceRange: { minVariantPrice: { amount: "0.0" } },
  featuredImage: { url: "https://cdn.shopify.com/s/files/1/x/files/a.jpg" },
  light: null,
  size: null,
  collections: {
    nodes: collections.map((c) => ({
      handle: c.handle,
      tagline: c.tagline ? { value: c.tagline } : null,
    })),
  },
});

const collection = (handle: string, tagline: string | null, position: string | null) => ({
  handle,
  title: handle,
  description: "",
  image: null,
  tagline: tagline ? { value: tagline } : null,
  position: position ? { value: position } : null,
});

const page = <T>(nodes: T[], hasNextPage = false, endCursor: string | null = null) => ({
  nodes,
  pageInfo: { hasNextPage, endCursor },
});

const reply = (data: unknown) =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("catalog service", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_STORE_URL", "example-store.myshopify.com");
    vi.stubEnv("SHOPIFY_STOREFRONT_API_ACCESS_TOKEN", "shpat_test_token_value");
    resetEnvCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns only storefront collections, ordered by position, across pages", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        reply({
          collections: page(
            [collection("seeds-tools", "t", "4"), collection("frontpage", null, null)],
            true,
            "c1",
          ),
        }),
      )
      .mockResolvedValueOnce(reply({ collections: page([collection("house-plants", "t", "1")]) }));

    const result = await getCollections();
    expect(result.map((c) => c.slug)).toEqual(["house-plants", "seeds-tools"]);
  });

  it("hides non-storefront collections by handle", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      reply({ collection: collection("frontpage", null, null) }),
    );
    expect(await getCollection("frontpage")).toBeUndefined();
  });

  it("returns undefined for unknown products", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ product: null }));
    expect(await getProduct("nope")).toBeUndefined();
  });

  it("returns best sellers in collection order and tolerates a missing collection", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        reply({ collection: { products: page([product("b"), product("a")]) } }),
      )
      .mockResolvedValueOnce(reply({ collection: null }));
    expect((await getBestSellers()).map((p) => p.slug)).toEqual(["b", "a"]);
    expect(await getBestSellers()).toEqual([]);
  });

  it("rejects malformed Shopify responses instead of rendering them", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ product: { handle: 1 } }));
    await expect(getProduct("x")).rejects.toThrow();
  });
});

describe("getProductPage", () => {
  beforeEach(() => {
    vi.stubEnv("SHOPIFY_STORE_URL", "example-store.myshopify.com");
    vi.stubEnv("SHOPIFY_STOREFRONT_API_ACCESS_TOKEN", "shpat_test_token_value");
    resetEnvCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  const pageInfo = { hasNextPage: true, hasPreviousPage: false, startCursor: "s", endCursor: "e" };

  it("requests 12 items forward, or the last 12 when paging backwards", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply({ products: { nodes: [product("a")], pageInfo } }));
    const { parseShopQuery } = await import("@/lib/shop");

    const forward = await getProductPage(parseShopQuery({ after: "cur" }));
    expect(forward.products.map((p) => p.slug)).toEqual(["a"]);
    expect(forward.pageInfo).toMatchObject({ hasNextPage: true, endCursor: "e" });
    const forwardVars = JSON.parse(
      String((fetchMock.mock.calls[0]![1] as RequestInit).body),
    ).variables;
    expect(forwardVars).toMatchObject({ first: 12, last: null, after: "cur", before: null });

    await getProductPage(parseShopQuery({ before: "cur" }));
    const backVars = JSON.parse(
      String((fetchMock.mock.calls[1]![1] as RequestInit).body),
    ).variables;
    expect(backVars).toMatchObject({ first: null, last: 12, after: null, before: "cur" });
  });

  it("degrades a malformed cursor to the first page instead of failing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        async () =>
          new Response(JSON.stringify({ errors: [{ message: "Malformed cursor" }] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      )
      .mockImplementationOnce(async () => reply({ products: { nodes: [product("a")], pageInfo } }));
    const { parseShopQuery } = await import("@/lib/shop");

    const result = await getProductPage(parseShopQuery({ after: "garbage", page: "4" }));
    expect(result.products).toHaveLength(1);
    const retryVars = JSON.parse(
      String((fetchMock.mock.calls[1]![1] as RequestInit).body),
    ).variables;
    expect(retryVars).toMatchObject({ after: null, before: null });
  });

  it("does not swallow other Shopify errors", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(JSON.stringify({ errors: [{ message: "Access denied" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { parseShopQuery } = await import("@/lib/shop");
    await expect(getProductPage(parseShopQuery({ after: "x" }))).rejects.toThrow("Access denied");
  });
});
