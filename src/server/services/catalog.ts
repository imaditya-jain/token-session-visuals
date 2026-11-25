import "server-only";

import type { z } from "zod";

import { PAGE_SIZE, resetPaging, type ProductPage, type ShopQuery } from "@/lib/shop";
import type { Collection, Product } from "@/lib/types";
import { ShopifyError, storefrontQuery } from "@/server/shopify/client";
import {
  buildCollectionFilters,
  buildProductSearchQuery,
  collectionSortArgs,
  sortArgs,
} from "@/server/shopify/product-search";
import {
  collectionPosition,
  isStorefrontCollection,
  mapCollection,
  mapProduct,
} from "@/server/shopify/mappers";
import {
  COLLECTION_PAGE_QUERY,
  COLLECTION_PRODUCTS_QUERY,
  COLLECTION_QUERY,
  COLLECTION_SALES_ORDER_QUERY,
  COLLECTIONS_QUERY,
  PRODUCT_PAGE_QUERY,
  PRODUCT_QUERY,
  PRODUCT_SALES_ORDER_QUERY,
  PRODUCT_TYPES_QUERY,
  PRODUCTS_QUERY,
} from "@/server/shopify/queries";
import {
  collectionPageResponse,
  collectionProductsResponse,
  collectionResponse,
  collectionSalesOrderResponse,
  collectionsResponse,
  productPageResponse,
  productResponse,
  productSalesOrderResponse,
  productTypesResponse,
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

const LIST_PAGE_SIZE = 100;
const SEARCH_REVALIDATE_SECONDS = 300;
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
  revalidate?: number,
): Promise<z.infer<S>> {
  return schema.parse(
    await storefrontQuery(query, variables, {
      tags: queryTags,
      ...(revalidate !== undefined ? { revalidate } : {}),
    }),
  );
}

export async function getCollections(): Promise<Collection[]> {
  const nodes = await paginate(
    async (after) =>
      (
        await run(collectionsResponse, COLLECTIONS_QUERY, { first: LIST_PAGE_SIZE, after }, [
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
          { handle, first: LIST_PAGE_SIZE, after },
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
      (
        await run(productsResponse, PRODUCTS_QUERY, { first: LIST_PAGE_SIZE, after }, [
          tags.catalog,
        ])
      ).products,
  );
  return nodes.map(mapProduct);
}

/** True when the store has at least one product (cheap probe used to decide live vs fallback). */
export async function hasProducts(): Promise<boolean> {
  const { products } = await run(productsResponse, PRODUCTS_QUERY, { first: 1 }, [tags.catalog]);
  return products.nodes.length > 0;
}

/** One page of all products using Shopify cursor pagination (forward via `after`, backward via `before`). */
export async function getProductPage(query: ShopQuery): Promise<ProductPage> {
  try {
    return await fetchProductPage(query);
  } catch (error) {
    // Cursors come from the URL; a stale or tampered one must degrade to page one, not an error page.
    const hasCursor = query.after !== undefined || query.before !== undefined;
    if (hasCursor && error instanceof ShopifyError && /cursor/i.test(error.message)) {
      return fetchProductPage(resetPaging(query));
    }
    throw error;
  }
}

type CursorPage = {
  nodes: Parameters<typeof mapProduct>[0][];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string | null;
    endCursor: string | null;
  };
};

const toProductPage = ({ nodes, pageInfo }: CursorPage): ProductPage => ({
  products: nodes.map(mapProduct),
  pageInfo: {
    hasNextPage: pageInfo.hasNextPage,
    hasPreviousPage: pageInfo.hasPreviousPage,
    ...(pageInfo.startCursor ? { startCursor: pageInfo.startCursor } : {}),
    ...(pageInfo.endCursor ? { endCursor: pageInfo.endCursor } : {}),
  },
});

/** Forward uses first/after; backward uses last/before (Shopify cursor pagination). */
const cursorArgs = (query: ShopQuery) => {
  const backwards = query.before !== undefined && query.after === undefined;
  return {
    first: backwards ? null : PAGE_SIZE,
    last: backwards ? PAGE_SIZE : null,
    after: query.after ?? null,
    before: backwards ? query.before : null,
  };
};

async function fetchProductPage(query: ShopQuery): Promise<ProductPage> {
  const { products } = await run(
    productPageResponse,
    PRODUCT_PAGE_QUERY,
    {
      ...cursorArgs(query),
      query: buildProductSearchQuery(query) ?? null,
      ...sortArgs(query.sort, Boolean(query.search)),
    },
    [tags.catalog],
    // Every distinct search string is its own cache entry, so keep those short-lived.
    query.search ? SEARCH_REVALIDATE_SECONDS : undefined,
  );
  return toProductPage(products);
}

/** One page of a collection's products. Returns an empty page when the collection does not exist. */
export async function getCollectionPage(handle: string, query: ShopQuery): Promise<ProductPage> {
  const fetchPage = async (q: ShopQuery): Promise<ProductPage> => {
    const { collection } = await run(
      collectionPageResponse,
      COLLECTION_PAGE_QUERY,
      {
        handle,
        ...cursorArgs(q),
        filters: buildCollectionFilters(q),
        ...collectionSortArgs(q.sort),
      },
      [tags.catalog, tags.collection(handle)],
    );
    return collection
      ? toProductPage(collection.products)
      : { products: [], pageInfo: { hasNextPage: false, hasPreviousPage: false } };
  };
  try {
    return await fetchPage(query);
  } catch (error) {
    const hasCursor = query.after !== undefined || query.before !== undefined;
    if (hasCursor && error instanceof ShopifyError && /cursor/i.test(error.message)) {
      return fetchPage(resetPaging(query));
    }
    throw error;
  }
}

/** Product ids in best-selling order for the whole shop, or for one collection when a handle is given. */
export async function getSalesOrder(handle?: string): Promise<string[]> {
  if (handle === undefined) {
    const nodes = await paginate(
      async (after) =>
        (
          await run(
            productSalesOrderResponse,
            PRODUCT_SALES_ORDER_QUERY,
            { first: LIST_PAGE_SIZE, after },
            [tags.catalog],
          )
        ).products,
    );
    return nodes.map((node) => node.id);
  }
  const nodes = await paginate(
    async (after) =>
      (
        await run(
          collectionSalesOrderResponse,
          COLLECTION_SALES_ORDER_QUERY,
          { handle, first: LIST_PAGE_SIZE, after },
          [tags.catalog, tags.collection(handle)],
        )
      ).collection?.products ?? null,
  );
  return nodes.map((node) => node.id);
}

export async function getProductTypes(): Promise<string[]> {
  const { productTypes } = await run(productTypesResponse, PRODUCT_TYPES_QUERY, {}, [tags.catalog]);
  return productTypes.nodes.filter((type) => type.length > 0).sort((a, b) => a.localeCompare(b));
}
