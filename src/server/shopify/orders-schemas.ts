import "server-only";

import { z } from "zod";

const money = z.object({ shopMoney: z.object({ amount: z.string(), currencyCode: z.string() }) });

export const orderNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
  cancelledAt: z.string().nullable(),
  displayFinancialStatus: z.string().nullable(),
  displayFulfillmentStatus: z.string(),
  currentTotalPriceSet: money,
  currentSubtotalPriceSet: money,
  totalShippingPriceSet: money,
  currentTotalTaxSet: money,
  lineItems: z.object({
    nodes: z.array(
      z.object({
        title: z.string(),
        quantity: z.number().int(),
        variantTitle: z.string().nullable(),
        image: z.object({ url: z.string() }).nullable(),
        originalUnitPriceSet: money,
      }),
    ),
  }),
  fulfillments: z.array(
    z.object({
      trackingInfo: z.array(
        z.object({
          company: z.string().nullable(),
          number: z.string().nullable(),
          url: z.string().nullable(),
        }),
      ),
    }),
  ),
  shippingAddress: z
    .object({
      city: z.string().nullable(),
      province: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable(),
});

const pageInfo = z.object({
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  startCursor: z.string().nullable(),
  endCursor: z.string().nullable(),
});

export const ordersResponse = z.object({
  orders: z.object({ nodes: z.array(orderNodeSchema), pageInfo }),
});
export const orderResponse = z.object({ order: orderNodeSchema.nullable() });

export type OrderNode = z.infer<typeof orderNodeSchema>;
