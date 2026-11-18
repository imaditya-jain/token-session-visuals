import "server-only";

import { cache } from "react";

import {
  fallbackBestSellers,
  fallbackCollections,
  fallbackProducts,
} from "@/data/fallback-catalog";
import type { Collection, Product } from "@/lib/types";
import { logger } from "@/server/logger";
import * as shopify from "@/server/services/catalog";

/**
 * Storefront catalog facade. Components consume catalog data ONLY through this module (AGENTS.md).
 *
 * Source selection is all-or-nothing so pages never mix live and fallback data:
 *  - LIVE: Shopify is reachable and has at least one product AND one storefront collection.
 *  - FALLBACK: otherwise (empty store, Shopify error, missing config) the built-in catalog is served.
 */
const isLive = cache(async (): Promise<boolean> => {
  try {
    const [collections, products] = await Promise.all([
      shopify.getCollections(),
      shopify.hasProducts(),
    ]);
    const live = collections.length > 0 && products;
    if (!live)
      logger.warn("Shopify has no products or storefront collections; serving fallback catalog");
    return live;
  } catch (error) {
    logger.error({ err: error }, "Shopify unavailable; serving fallback catalog");
    return false;
  }
});

export async function getCollections(): Promise<Collection[]> {
  return (await isLive()) ? shopify.getCollections() : fallbackCollections;
}

export async function getCollection(handle: string): Promise<Collection | undefined> {
  return (await isLive())
    ? shopify.getCollection(handle)
    : fallbackCollections.find((collection) => collection.slug === handle);
}

export async function getCollectionProducts(handle: string): Promise<Product[]> {
  return (await isLive())
    ? shopify.getCollectionProducts(handle)
    : fallbackProducts.filter((product) => product.collectionSlugs.includes(handle));
}

export async function getBestSellers(): Promise<Product[]> {
  return (await isLive()) ? shopify.getBestSellers() : fallbackBestSellers;
}

export async function getProduct(handle: string): Promise<Product | undefined> {
  return (await isLive())
    ? shopify.getProduct(handle)
    : fallbackProducts.find((product) => product.slug === handle);
}

export async function getProducts(): Promise<Product[]> {
  return (await isLive()) ? shopify.getProducts() : fallbackProducts;
}

/** Other products from the same primary collection, in collection order. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const primary = product.collectionSlugs[0];
  if (!primary) return [];
  const siblings = await getCollectionProducts(primary);
  return siblings.filter((candidate) => candidate.slug !== product.slug).slice(0, limit);
}

export { formatPrice } from "@/lib/format";
export { navLinks, testimonials } from "@/data/site";
export type { Collection, Product } from "@/lib/types";
