import type { MetadataRoute } from "next";

import { getCollections, getProducts } from "@/data/catalog";
import { POLICY_SLUGS } from "@/lib/policies";
import { publicOrigin } from "@/server/config/site";
import { getPolicy } from "@/server/services/policies";

/** Rebuilt hourly, like the catalog pages it lists. */
export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/shop",
  "/collections",
  "/about",
  "/care-guide",
  "/faq",
  "/contact",
  "/gift-cards",
  "/careers",
  "/wholesale",
  "/sustainability",
  "/press",
  "/accessibility",
  "/shipping-delivery",
  "/plant-guarantee",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = publicOrigin();
  const [collections, products, policies] = await Promise.all([
    getCollections(),
    getProducts(),
    // Only policies the merchant has actually written are indexable (the others render a noindex notice).
    Promise.all(POLICY_SLUGS.map(async (slug) => ((await getPolicy(slug)) ? slug : null))),
  ]);

  const paths = [
    ...STATIC_PATHS,
    ...collections.map((collection) => `/collections/${collection.slug}`),
    ...products.map((product) => `/products/${product.slug}`),
    ...policies
      .filter((slug): slug is (typeof POLICY_SLUGS)[number] => slug !== null)
      .map((slug) => `/policies/${slug}`),
  ];
  return paths.map((path) => ({ url: `${origin}${path === "/" ? "" : path}` }));
}
