import "server-only";

import { z } from "zod";

const money = z.object({ amount: z.string() });

export const cartNodeSchema = z.object({
  id: z.string(),
  checkoutUrl: z.string().url(),
  totalQuantity: z.number().int(),
  buyerIdentity: z.object({ email: z.string().nullable() }),
  cost: z.object({ subtotalAmount: z.object({ amount: z.string(), currencyCode: z.string() }) }),
  lines: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        quantity: z.number().int(),
        cost: z.object({ amountPerQuantity: money, totalAmount: money }),
        merchandise: z.object({
          title: z.string(),
          image: z.object({ url: z.string() }).nullable(),
          product: z.object({
            handle: z.string(),
            title: z.string(),
            featuredImage: z.object({ url: z.string() }).nullable(),
          }),
        }),
      }),
    ),
  }),
});

const userError = z.object({ code: z.string().nullable(), message: z.string() });
const payload = z.object({
  cart: cartNodeSchema.nullable(),
  userErrors: z.array(userError),
});

export const cartResponse = z.object({ cart: cartNodeSchema.nullable() });
export const cartCreateResponse = z.object({ cartCreate: payload });
export const cartLinesAddResponse = z.object({ cartLinesAdd: payload });
export const cartLinesUpdateResponse = z.object({ cartLinesUpdate: payload });
export const cartBuyerIdentityResponse = z.object({ cartBuyerIdentityUpdate: payload });
export const cartLinesRemoveResponse = z.object({ cartLinesRemove: payload });

export type CartNode = z.infer<typeof cartNodeSchema>;
