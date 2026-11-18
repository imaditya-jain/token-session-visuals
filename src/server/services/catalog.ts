import "server-only";

import type { z } from "zod";

import type { Collection, Product } from "@/lib/types";
import { storefrontQuery } from "@/server/shopify/client";
import {
  collectionPosition,
  isStorefrontCollection,
  mapCollection,
  mapProduct,
} from "@/server/shopify/mappers";
import {
  COLLECTION_PRODUCTS_QUERY,
  COLLECTION_QUERY,
  COLLECTIONS_QUERY,
  PRODUCT_QUERY,
  PRODUCTS_QUERY,
} from "@/server/shopify/queries";
import {
  collectionProductsResponse,
  collectionResponse,
  collectionsResponse,
  productResponse,
  productsResponse,
} from "@/server/shopify/schemas";

/** Cache tags; webhooks call revalidateTag with these. */
export const tags = {
  catalog: "catalog",
  product: (handle: string) => `product:${handle}`,
  collection: (handle: string) => `collection:${handle}`,
} as const;

/** Handle of the merchant-curated collection that drives the home page best-sellers section. */
export const BEST_SELLERS_HANDLE = "home-best-sellers";

const PAGE_SIZE = 100;
const MAX_PAGES = 20;

type Page<T> = { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } };

async function paginate<T>(
  fetchPage: (after: string | null) => Promise<Page<T> | null>,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchPage(after);
    if (!page) return all;
    all.push(...page.nodes);
    if (!page.pageInfo.hasNextPage) return all;
    after = page.pageInfo.endCursor;
  }
  throw new Error("Catalog pagination exceeded the safety limit");
}

async function run<S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, unknown>,
  queryTags: string[],
): Promise<z.infer<S>> {
  return schema.parse(await storefrontQuery(query, variables, { tags: queryTags }));
}

export async function getCollections(): Promise<Collection[]> {
  const nodes = await paginate(
    async (after) =>
      (
        await run(collectionsResponse, COLLECTIONS_QUERY, { first: PAGE_SIZE, after }, [
          tags.catalog,
        ])
      ).collections,
  );
  return nodes
    .filter(isStorefrontCollection)
    .sort((a, b) => collectionPosition(a) - collectionPosition(b))
    .map(mapCollection);
}

export async function getCollection(handle: string): Promise<Collection | undefined> {
  const { collection } = await run(collectionResponse, COLLECTION_QUERY, { handle }, [
    tags.catalog,
    tags.collection(handle),
  ]);
  return collection && isStorefrontCollection(collection) ? mapCollection(collection) : undefined;
}

export async function getCollectionProducts(handle: string): Promise<Product[]> {
  const nodes = await paginate(
    async (after) =>
      (
        await run(
          collectionProductsResponse,
          COLLECTION_PRODUCTS_QUERY,
          { handle, first: PAGE_SIZE, after },
          [tags.catalog, tags.collection(handle)],
        )
      ).collection?.products ?? null,
  );
  return nodes.map(mapProduct);
}

export async function getBestSellers(): Promise<Product[]> {
  return getCollectionProducts(BEST_SELLERS_HANDLE);
}

export async function getProduct(handle: string): Promise<Product | undefined> {
  const { product } = await run(productResponse, PRODUCT_QUERY, { handle }, [
    tags.catalog,
    tags.product(handle),
  ]);
  return product ? mapProduct(product) : undefined;
}

export async function getProducts(): Promise<Product[]> {
  const nodes = await paginate(
    async (after) =>
      (await run(productsResponse, PRODUCTS_QUERY, { first: PAGE_SIZE, after }, [tags.catalog]))
        .products,
  );
  return nodes.map(mapProduct);
}

/** True when the store has at least one product (cheap probe used to decide live vs fallback). */
export async function hasProducts(): Promise<boolean> {
  const { products } = await run(productsResponse, PRODUCTS_QUERY, { first: 1 }, [tags.catalog]);
  return products.nodes.length > 0;
}
