import "server-only";

import type { Collection, Product, ProductBadge } from "@/lib/types";

import type { CollectionNode, ProductNode } from "./schemas";

/** Collections shown in the storefront are those carrying the `custom.tagline` metafield. */
export const isStorefrontCollection = (node: { tagline: { value: string } | null }) =>
  Boolean(node.tagline?.value);

const BADGE_PRIORITY: ProductBadge[] = ["Sale", "New", "Bestseller"];

const toAmount = (value: string): number => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error(`Invalid money amount: ${value}`);
  return amount;
};

export function mapProduct(node: ProductNode): Product {
  const price = toAmount(node.priceRange.minVariantPrice.amount);
  const compare = toAmount(node.compareAtPriceRange.minVariantPrice.amount);
  const badge = BADGE_PRIORITY.find((candidate) => node.tags.includes(candidate));

  return {
    id: node.id,
    slug: node.handle,
    name: node.title,
    category: node.productType,
    price,
    ...(compare > price ? { compareAtPrice: compare } : {}),
    image: node.featuredImage?.url ?? "",
    ...(badge ? { badge } : {}),
    light: node.light?.value ?? "",
    size: node.size?.value ?? "",
    inStock: node.availableForSale,
    collectionSlugs: node.collections.nodes.filter(isStorefrontCollection).map((c) => c.handle),
  };
}

export function mapCollection(node: CollectionNode): Collection {
  return {
    slug: node.handle,
    name: node.title,
    tagline: node.tagline?.value ?? "",
    description: node.description,
    image: node.image?.url ?? "",
  };
}

export const collectionPosition = (node: CollectionNode): number => {
  const parsed = Number(node.position?.value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};
