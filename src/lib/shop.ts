import { z } from "zod";

import type { Product } from "@/lib/types";

export const PAGE_SIZE = 12;

export const SORT_KEYS = [
  "featured",
  "best-selling",
  "alpha-asc",
  "alpha-desc",
  "price-asc",
  "price-desc",
] as const;

export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_LABELS: Record<SortKey, string> = {
  featured: "Featured",
  "best-selling": "Best selling",
  "alpha-asc": "Alphabetically, A-Z",
  "alpha-desc": "Alphabetically, Z-A",
  "price-asc": "Price, low to high",
  "price-desc": "Price, high to low",
};

/** Validated, normalized shop request. Everything comes from the URL so pages are shareable. */
export type ShopQuery = {
  /** Opaque Shopify cursors; at most one of them is set. */
  after?: string;
  before?: string;
  /** Cosmetic 1-based page number carried through links (cursors are opaque). */
  page: number;
  sort: SortKey;
  inStock: boolean;
  outOfStock: boolean;
  min?: number;
  max?: number;
  types: string[];
  /** Normalized search terms (letters/digits only, space separated), e.g. "snake plant". */
  search?: string;
};

export type PageInfo = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
};

export type ProductPage = { products: Product[]; pageInfo: PageInfo };

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
const all = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const cursor = z.string().min(1).max(512);
const price = z.coerce.number().finite().min(0).max(1_000_000);

export const MAX_SEARCH_TERMS = 6;
export const MAX_SEARCH_TERM_LENGTH = 40;

/** Splits free text into safe terms: letters and digits only, so no search-syntax can be injected. */
export function searchTerms(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TERMS)
    .map((term) => term.slice(0, MAX_SEARCH_TERM_LENGTH));
}

/** Never throws: invalid or hostile input falls back to defaults. */
export function parseShopQuery(params: RawParams): ShopQuery {
  const after = cursor.safeParse(first(params["after"]));
  const before = cursor.safeParse(first(params["before"]));
  const sort = z.enum(SORT_KEYS).safeParse(first(params["sort"]));
  const min = price.safeParse(first(params["min"]) || undefined);
  const max = price.safeParse(first(params["max"]) || undefined);
  const page = z.coerce.number().int().min(1).max(10_000).safeParse(first(params["page"]));
  const types = [
    ...new Set(
      all(params["type"])
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length <= 80),
    ),
  ].slice(0, 20);

  const search = searchTerms((first(params["q"]) ?? "").slice(0, 200)).join(" ");

  return {
    ...(after.success ? { after: after.data } : before.success ? { before: before.data } : {}),
    page: page.success ? page.data : 1,
    sort: sort.success ? sort.data : "featured",
    inStock: all(params["stock"]).includes("in"),
    outOfStock: all(params["stock"]).includes("out"),
    ...(min.success ? { min: min.data } : {}),
    ...(max.success ? { max: max.data } : {}),
    types,
    ...(search ? { search } : {}),
  };
}

/** Serializes a query back to URL params, omitting defaults. Cursors/page are included only when set. */
export function shopQueryToSearchParams(query: Partial<ShopQuery>): URLSearchParams {
  const params = new URLSearchParams();
  if (query.search) params.set("q", query.search);
  if (query.sort && query.sort !== "featured") params.set("sort", query.sort);
  if (query.inStock) params.append("stock", "in");
  if (query.outOfStock) params.append("stock", "out");
  if (query.min !== undefined) params.set("min", String(query.min));
  if (query.max !== undefined) params.set("max", String(query.max));
  for (const type of query.types ?? []) params.append("type", type);
  if (query.after) params.set("after", query.after);
  if (query.before) params.set("before", query.before);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

export const activeFilterCount = (query: ShopQuery) =>
  Number(query.inStock) +
  Number(query.outOfStock) +
  Number(query.min !== undefined) +
  Number(query.max !== undefined) +
  query.types.length;

/** Same filters/sort, back to the first page (used whenever a filter or sort changes). */
export function resetPaging(query: ShopQuery): ShopQuery {
  const next: ShopQuery = { ...query, page: 1 };
  delete next.after;
  delete next.before;
  return next;
}

export const SHOP_PATH = "/shop";

/** Link to a product listing (shop or a collection) carrying filters, sort and cursor. */
export function shopHref(query: Partial<ShopQuery>, basePath: string = SHOP_PATH): string {
  const search = shopQueryToSearchParams(query).toString();
  return search ? `${basePath}?${search}` : basePath;
}

/** "8 products" when everything fits on one page, otherwise "Showing 13–20 products". */
export function listingSummary(query: ShopQuery, pageInfo: PageInfo, shown: number): string {
  if (shown === 0) return "0 products";
  if (!pageInfo.hasNextPage && !pageInfo.hasPreviousPage && query.page === 1) {
    return `${shown} ${shown === 1 ? "product" : "products"}`;
  }
  const first = (query.page - 1) * PAGE_SIZE + 1;
  return shown === 1
    ? `Showing ${first} product`
    : `Showing ${first}–${first + shown - 1} products`;
}
