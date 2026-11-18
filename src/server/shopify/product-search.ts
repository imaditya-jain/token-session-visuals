import "server-only";

import type { ShopQuery, SortKey } from "@/lib/shop";

/** Quotes a value for Shopify's search syntax, escaping backslashes and quotes. */
const quote = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/** Builds the `query` argument of Storefront `products(...)` from validated filters. */
export function buildProductSearchQuery(query: ShopQuery): string | undefined {
  const parts: string[] = [];

  // Both boxes ticked means "no availability restriction".
  if (query.inStock !== query.outOfStock) {
    // Shopify ignores `available_for_sale:false`; "out of stock" must be expressed as a negation.
    parts.push(query.inStock ? "available_for_sale:true" : "-available_for_sale:true");
  }
  if (query.min !== undefined) parts.push(`variants.price:>=${query.min}`);
  if (query.max !== undefined) parts.push(`variants.price:<=${query.max}`);
  if (query.types.length > 0) {
    parts.push(`(${query.types.map((type) => `product_type:${quote(type)}`).join(" OR ")})`);
  }
  return parts.length > 0 ? parts.join(" AND ") : undefined;
}

type SortArgs = { sortKey: "ID" | "BEST_SELLING" | "TITLE" | "PRICE"; reverse: boolean };

export function sortArgs(sort: SortKey): SortArgs {
  switch (sort) {
    case "best-selling":
      return { sortKey: "BEST_SELLING", reverse: false };
    case "alpha-asc":
      return { sortKey: "TITLE", reverse: false };
    case "alpha-desc":
      return { sortKey: "TITLE", reverse: true };
    case "price-asc":
      return { sortKey: "PRICE", reverse: false };
    case "price-desc":
      return { sortKey: "PRICE", reverse: true };
    default:
      return { sortKey: "ID", reverse: false };
  }
}
