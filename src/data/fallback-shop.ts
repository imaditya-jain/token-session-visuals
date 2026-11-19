import { PAGE_SIZE, searchTerms, type ProductPage, type ShopQuery } from "@/lib/shop";
import type { Product } from "@/lib/types";

/**
 * In-memory equivalent of the Shopify product page query, used only for the fallback catalog.
 * Cursors are opaque (base64url of the item's index in the filtered+sorted list), like Shopify's.
 */
const encode = (index: number) => Buffer.from(`i:${index}`).toString("base64url");
const decode = (cursor: string | undefined): number | undefined => {
  if (!cursor) return undefined;
  const match = /^i:(\d+)$/.exec(Buffer.from(cursor, "base64url").toString());
  return match ? Number(match[1]) : undefined;
};

function filterProducts(products: Product[], query: ShopQuery): Product[] {
  const terms = searchTerms(query.search);
  return products.filter((product) => {
    if (terms.length > 0) {
      const haystack = `${product.name} ${product.category} ${product.light}`.toLowerCase();
      if (!terms.every((term) => haystack.includes(term))) return false;
    }
    if (query.inStock !== query.outOfStock && product.inStock !== query.inStock) return false;
    if (query.min !== undefined && product.price < query.min) return false;
    if (query.max !== undefined && product.price > query.max) return false;
    if (query.types.length > 0 && !query.types.includes(product.category)) return false;
    return true;
  });
}

function sortProducts(products: Product[], sort: ShopQuery["sort"]): Product[] {
  const list = [...products];
  switch (sort) {
    case "best-selling":
      return list.sort(
        (a, b) => Number(b.badge === "Bestseller") - Number(a.badge === "Bestseller"),
      );
    case "alpha-asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "alpha-desc":
      return list.sort((a, b) => b.name.localeCompare(a.name));
    case "price-asc":
      return list.sort((a, b) => a.price - b.price);
    case "price-desc":
      return list.sort((a, b) => b.price - a.price);
    default:
      return list;
  }
}

export function paginateFallback(products: Product[], query: ShopQuery): ProductPage {
  const sorted = sortProducts(filterProducts(products, query), query.sort);
  const afterIndex = decode(query.after);
  const beforeIndex = decode(query.before);

  let start = 0;
  let end = Math.min(PAGE_SIZE, sorted.length);
  if (afterIndex !== undefined) {
    start = Math.min(afterIndex + 1, sorted.length);
    end = Math.min(start + PAGE_SIZE, sorted.length);
  } else if (beforeIndex !== undefined) {
    end = Math.min(beforeIndex, sorted.length);
    start = Math.max(0, end - PAGE_SIZE);
  }

  const slice = sorted.slice(start, end);
  return {
    products: slice,
    pageInfo: {
      hasNextPage: end < sorted.length,
      hasPreviousPage: start > 0,
      ...(slice.length > 0 ? { startCursor: encode(start), endCursor: encode(end - 1) } : {}),
    },
  };
}

export const fallbackProductTypes = (products: Product[]): string[] =>
  [...new Set(products.map((product) => product.category))].sort((a, b) => a.localeCompare(b));
