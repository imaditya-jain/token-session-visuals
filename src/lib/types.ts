/** Storefront domain types. Shopify shapes never leave `src/server/shopify`. */

export type Collection = {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
};

export type ProductBadge = "Sale" | "Bestseller" | "New";

export type Product = {
  id: string;
  slug: string;
  name: string;
  category: string;
  /** Display amount in the shop currency (Shopify returns decimal strings; arithmetic is never done on it). */
  price: number;
  compareAtPrice?: number;
  image: string;
  badge?: ProductBadge;
  light: string;
  size: string;
  inStock: boolean;
  /** Shopify variant a cart line is created from (the first variant). Absent in the offline fallback catalog. */
  variantId?: string;
  collectionSlugs: string[];
};
