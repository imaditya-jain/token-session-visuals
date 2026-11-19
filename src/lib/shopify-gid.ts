import { z } from "zod";

/** Resources whose Shopify GIDs are mirrored in our database. */
export const MIRROR_RESOURCES = ["product", "collection", "order"] as const;
export type MirrorResource = (typeof MIRROR_RESOURCES)[number];

const TYPE_NAME: Record<MirrorResource, string> = {
  product: "Product",
  collection: "Collection",
  order: "Order",
};

export const gidFor = (resource: MirrorResource, numericId: string | number): string =>
  `gid://shopify/${TYPE_NAME[resource]}/${numericId}`;

/** A GID that is valid for exactly this resource type. */
export const gidSchema = (resource: MirrorResource) =>
  z.string().regex(new RegExp(`^gid://shopify/${TYPE_NAME[resource]}/\\d{1,20}$`), "Invalid GID");
