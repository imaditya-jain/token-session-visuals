import "server-only";

import { cache } from "react";

import {
  fallbackBestSellers,
  fallbackCollections,
  fallbackProducts,
} from "@/data/fallback-catalog";
import { fallbackProductTypes, paginateFallback } from "@/data/fallback-shop";
import { parseShopQuery, type ProductPage, type ShopQuery } from "@/lib/shop";
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

/** One page (12) of a collection with filters/sort and cursor pagination; `undefined` when the collection is unknown. */
export async function getCollectionPage(
  handle: string,
  query: ShopQuery,
): Promise<ProductPage | undefined> {
  if (await isLive()) return shopify.getCollectionPage(handle, query);
  if (!fallbackCollections.some((collection) => collection.slug === handle)) return undefined;
  return paginateFallback(
    fallbackProducts.filter((product) => product.collectionSlugs.includes(handle)),
    query,
  );
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

/** One page (12) of all products with filters/sort and Shopify-style cursor pagination. */
export async function getShopPage(query: ShopQuery): Promise<ProductPage> {
  return (await isLive())
    ? shopify.getProductPage(query)
    : paginateFallback(fallbackProducts, query);
}

/** Every product of one collection, in the collection's own order; `undefined` when the collection is unknown. */
export async function getCollectionAll(handle: string): Promise<Product[] | undefined> {
  if (await isLive()) {
    const collection = await shopify.getCollection(handle);
    return collection ? shopify.getCollectionProducts(handle) : undefined;
  }
  if (!fallbackCollections.some((collection) => collection.slug === handle)) return undefined;
  return fallbackProducts.filter((product) => product.collectionSlugs.includes(handle));
}

/**
 * Product ids in best-selling order for the whole shop (or one collection). The browser sorts the listing it receives
 * by this. The offline catalog has no sales, so its Bestseller-badged items come first.
 */
export async function getSalesOrder(handle?: string): Promise<string[]> {
  if (await isLive()) return shopify.getSalesOrder(handle);
  const pool =
    handle === undefined
      ? fallbackProducts
      : fallbackProducts.filter((product) => product.collectionSlugs.includes(handle));
  return [...pool]
    .sort((a, b) => Number(b.badge === "Bestseller") - Number(a.badge === "Bestseller"))
    .map((product) => product.id);
}

/** Product types available as shop filters. */
export async function getProductTypes(): Promise<string[]> {
  return (await isLive()) ? shopify.getProductTypes() : fallbackProductTypes(fallbackProducts);
}

/** Other products from the same primary collection, in collection order. */
export async function getRelatedProducts(product: Product, limit = 4): Promise<Product[]> {
  const primary = product.collectionSlugs[0];
  if (!primary) return [];
  const page = await getCollectionPage(primary, parseShopQuery({}));
  return (page?.products ?? [])
    .filter((candidate) => candidate.slug !== product.slug)
    .slice(0, limit);
}

export { formatPrice } from "@/lib/format";
export { navLinks, testimonials } from "@/data/site";
export type { Collection, Product } from "@/lib/types";
