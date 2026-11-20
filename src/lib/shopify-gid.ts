import { z } from "zod";

/** Resources whose Shopify GIDs are mirrored in our database. */
export const MIRROR_RESOURCES = ["product", "collection", "order"] as const;
export type MirrorResource = (typeof MIRROR_RESOURCES)[number];

/** Every kind of GID we validate; only the first three are mirrored into our database. */
type GidKind = MirrorResource | "customer";

const TYPE_NAME: Record<GidKind, string> = {
  product: "Product",
  collection: "Collection",
  order: "Order",
  customer: "Customer",
};

export const gidFor = (resource: MirrorResource, numericId: string | number): string =>
  `gid://shopify/${TYPE_NAME[resource]}/${numericId}`;

/** A GID that is valid for exactly this resource type. */
export const gidSchema = (resource: GidKind) =>
  z.string().regex(new RegExp(`^gid://shopify/${TYPE_NAME[resource]}/\\d{1,20}$`), "Invalid GID");
