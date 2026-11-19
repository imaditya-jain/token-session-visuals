import { describe, expect, it } from "vitest";

import type { Product } from "@/lib/types";

import { absoluteUrl, organizationJsonLd, productJsonLd, websiteJsonLd } from "./structured-data";

const origin = "https://fernwood.example";
const product: Product = {
  id: "gid://shopify/Product/1",
  slug: "monstera-deliciosa",
  name: "Monstera Deliciosa",
  category: "House Plants",
  price: 49,
  image: "/images/product-monstera.jpg",
  light: "Bright, indirect light",
  size: "Medium",
  inStock: true,
  collectionSlugs: ["house-plants"],
};

describe("absoluteUrl", () => {
  it("resolves relative paths and leaves absolute URLs alone", () => {
    expect(absoluteUrl(origin, "/images/a.jpg")).toBe(`${origin}/images/a.jpg`);
    expect(absoluteUrl(origin, "images/a.jpg")).toBe(`${origin}/images/a.jpg`);
    expect(absoluteUrl(origin, "https://cdn.shopify.com/x.jpg")).toBe(
      "https://cdn.shopify.com/x.jpg",
    );
  });
});

describe("productJsonLd", () => {
  it("describes the product and its offer with exact price formatting", () => {
    const data = productJsonLd(product, origin, "USD");
    expect(data["@type"]).toBe("Product");
    expect(data.image).toEqual([`${origin}/images/product-monstera.jpg`]);
    expect(data.url).toBe(`${origin}/products/monstera-deliciosa`);
    expect(data.offers).toMatchObject({
      "@type": "Offer",
      priceCurrency: "USD",
      price: "49.00",
      availability: "https://schema.org/InStock",
    });
  });

  it("reports sold-out products as out of stock and omits a missing image", () => {
    const data = productJsonLd({ ...product, inStock: false, image: "" }, origin, "USD");
    expect(data.offers.availability).toBe("https://schema.org/OutOfStock");
    expect(data).not.toHaveProperty("image");
  });
});

describe("site-level data", () => {
  it("describes the organisation", () => {
    expect(
      organizationJsonLd(origin, {
        name: "Fernwood",
        email: "hello@fernwood.shop",
        logo: "/logo.png",
      }),
    ).toMatchObject({ "@type": "Organization", url: origin, logo: `${origin}/logo.png` });
  });

  it("exposes site search through the /search page", () => {
    expect(websiteJsonLd(origin, "Fernwood").potentialAction).toEqual({
      "@type": "SearchAction",
      target: `${origin}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    });
  });
});
