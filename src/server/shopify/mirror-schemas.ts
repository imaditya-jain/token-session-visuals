import "server-only";

import { z } from "zod";

const pageInfo = z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() });
const page = <T extends z.ZodType>(node: T) => z.object({ nodes: z.array(node), pageInfo });
const idOnly = z.object({ id: z.string() });

export const productNode = z.object({
  id: z.string(),
  handle: z.string(),
  title: z.string(),
  status: z.string(),
  productType: z.string(),
  tags: z.array(z.string()),
  updatedAt: z.string(),
  variants: z.object({
    nodes: z.array(z.object({ id: z.string(), sku: z.string().nullable(), title: z.string() })),
  }),
  collections: z.object({ nodes: z.array(idOnly) }),
});

export const collectionNode = z.object({
  id: z.string(),
  handle: z.string(),
  title: z.string(),
  updatedAt: z.string(),
});

const money = z.object({ shopMoney: z.object({ amount: z.string(), currencyCode: z.string() }) });

export const orderNode = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  updatedAt: z.string(),
  processedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  displayFinancialStatus: z.string().nullable(),
  displayFulfillmentStatus: z.string(),
  customer: idOnly.nullable(),
  currentTotalPriceSet: money,
  lineItems: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        quantity: z.number().int(),
        product: idOnly.nullable(),
        variant: idOnly.nullable(),
      }),
    ),
  }),
});

export const productResponse = z.object({ product: productNode.nullable() });
export const productsResponse = z.object({ products: page(productNode) });
export const collectionResponse = z.object({ collection: collectionNode.nullable() });
export const collectionsResponse = z.object({ collections: page(collectionNode) });
export const orderResponse = z.object({ order: orderNode.nullable() });
export const ordersResponse = z.object({ orders: page(orderNode) });

export type ProductNode = z.infer<typeof productNode>;
export type CollectionNode = z.infer<typeof collectionNode>;
export type OrderNode = z.infer<typeof orderNode>;
