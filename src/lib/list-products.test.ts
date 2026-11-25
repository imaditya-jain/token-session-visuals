import { describe, expect, it } from "vitest";

import { listProducts, PAGE_SIZE, parseShopQuery } from "./shop";
import type { Product } from "./types";

const make = (n: number, over: Partial<Product> = {}): Product => ({
  id: `gid://shopify/Product/${n}`,
  slug: `plant-${n}`,
  name: `Plant ${String(n).padStart(2, "0")}`,
  category: n % 2 === 0 ? "House Plants" : "Succulents & Cacti",
  price: n * 10,
  image: "/x.jpg",
  light: "Bright, indirect light",
  size: "10 inch",
  inStock: n % 5 !== 0,
  collectionSlugs: [],
  ...over,
});
const catalog = Array.from({ length: 30 }, (_, i) => make(i + 1));
const q = (params: Record<string, string | string[]>) => parseShopQuery(params);

describe("listProducts (the browser's filtering)", () => {
  it("shows the first page of the featured order by default", () => {
    const listed = listProducts(catalog, q({}));
    expect(listed.products.map((p) => p.name)).toEqual(
      catalog.slice(0, PAGE_SIZE).map((p) => p.name),
    );
    expect(listed).toMatchObject({ total: 30, page: 1, pageCount: 3 });
  });

  it("pages forward, and keeps a page past the end inside the range", () => {
    expect(listProducts(catalog, q({ page: "3" })).products).toHaveLength(6);
    const beyond = listProducts(catalog, q({ page: "99" }));
    expect(beyond.page).toBe(3);
    expect(beyond.products).toHaveLength(6);
  });

  it("filters by availability (both boxes means everything)", () => {
    expect(listProducts(catalog, q({ stock: "in" })).total).toBe(24);
    expect(listProducts(catalog, q({ stock: "out" })).total).toBe(6);
    expect(listProducts(catalog, q({ stock: ["in", "out"] })).total).toBe(30);
  });

  it("filters by price range and product type, combined", () => {
    const listed = listProducts(catalog, q({ min: "50", max: "100", type: "House Plants" }));
    expect(
      listed.products.every(
        (p) => p.price >= 50 && p.price <= 100 && p.category === "House Plants",
      ),
    ).toBe(true);
    expect(listed.total).toBe(3);
  });

  it("searches name, category and light by every term", () => {
    const search = (text: string) => listProducts(catalog, q({ q: text })).total;
    expect(search("plant 07")).toBe(1);
    expect(search("succulents")).toBe(15);
    expect(search("plant bright")).toBe(30);
    expect(search("nothing like this")).toBe(0);
  });

  it("sorts by price and name in both directions", () => {
    expect(listProducts(catalog, q({ sort: "price-asc" })).products[0]?.price).toBe(10);
    expect(listProducts(catalog, q({ sort: "price-desc" })).products[0]?.price).toBe(300);
    expect(listProducts(catalog, q({ sort: "alpha-desc" })).products[0]?.name).toBe("Plant 30");
    expect(listProducts(catalog, q({ sort: "alpha-asc" })).products[0]?.name).toBe("Plant 01");
  });

  it("sorts by the shop's real sales ranking when it has one, and by the badge when it does not", () => {
    const ranking = [catalog[7]!.id, catalog[2]!.id];
    const bySales = listProducts(catalog, q({ sort: "best-selling" }), ranking).products;
    expect(bySales.slice(0, 2).map((p) => p.id)).toEqual(ranking);
    expect(bySales[2]?.id).toBe(catalog[0]!.id);

    const badged = catalog.map((p, i) => (i === 9 ? { ...p, badge: "Bestseller" as const } : p));
    expect(listProducts(badged, q({ sort: "best-selling" })).products[0]?.id).toBe(badged[9]!.id);
  });

  it("an empty list is one empty page, and a hostile query behaves like the default", () => {
    expect(listProducts([], q({}))).toMatchObject({
      products: [],
      total: 0,
      page: 1,
      pageCount: 1,
    });
    const hostile = parseShopQuery({
      sort: "<script>",
      min: "-1",
      after: "\u0000",
      type: '" OR title:*',
    });
    expect(listProducts(catalog, hostile).total).toBe(0); // the odd type matches nothing, nothing throws
  });
});
