import "server-only";

import { z } from "zod";

const plan = z.object({
  id: z.string(),
  name: z.string(),
  // Only fixed-price plans carry a price here; any other adjustment shape comes back as an empty object.
  priceAdjustments: z.array(
    z.object({
      adjustmentValue: z.object({ price: z.object({ amount: z.string() }).optional() }),
    }),
  ),
});

export const gardenerProductResponse = z.object({
  product: z
    .object({
      title: z.string(),
      availableForSale: z.boolean(),
      variants: z.object({
        nodes: z.array(
          z.object({
            id: z.string(),
            price: z.object({ amount: z.string(), currencyCode: z.string() }),
          }),
        ),
      }),
      sellingPlanGroups: z.object({
        nodes: z.array(z.object({ sellingPlans: z.object({ nodes: z.array(plan) }) })),
      }),
    })
    .nullable(),
});
