import "server-only";

import { z } from "zod";

const metafield = z.object({ value: z.string() }).nullable();
const money = z.object({ amount: z.string() });

export const productNodeSchema = z.object({
  id: z.string(),
  handle: z.string(),
  title: z.string(),
  productType: z.string(),
  tags: z.array(z.string()),
  availableForSale: z.boolean(),
  priceRange: z.object({ minVariantPrice: money }),
  compareAtPriceRange: z.object({ minVariantPrice: money }),
  featuredImage: z.object({ url: z.string().url() }).nullable(),
  light: metafield,
  size: metafield,
  collections: z.object({
    nodes: z.array(z.object({ handle: z.string(), tagline: metafield })),
  }),
});

export const collectionNodeSchema = z.object({
  handle: z.string(),
  title: z.string(),
  description: z.string(),
  image: z.object({ url: z.string().url() }).nullable(),
  tagline: metafield,
  position: metafield,
});

const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });

const page = <T extends z.ZodType>(node: T) => z.object({ nodes: z.array(node), pageInfo });

export const collectionsResponse = z.object({ collections: page(collectionNodeSchema) });
export const collectionResponse = z.object({ collection: collectionNodeSchema.nullable() });
export const collectionProductsResponse = z.object({
  collection: z.object({ products: page(productNodeSchema) }).nullable(),
});
export const productResponse = z.object({ product: productNodeSchema.nullable() });
export const productsResponse = z.object({ products: page(productNodeSchema) });

export type ProductNode = z.infer<typeof productNodeSchema>;
export type CollectionNode = z.infer<typeof collectionNodeSchema>;
export { page };

const cursorPage = z.object({
  nodes: z.array(productNodeSchema),
  pageInfo: z.object({
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean(),
    startCursor: z.string().nullable(),
    endCursor: z.string().nullable(),
  }),
});

export const productPageResponse = z.object({ products: cursorPage });
export const collectionPageResponse = z.object({
  collection: z.object({ products: cursorPage }).nullable(),
});
export const productTypesResponse = z.object({
  productTypes: z.object({ nodes: z.array(z.string()) }),
});
