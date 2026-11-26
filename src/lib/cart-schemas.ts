import { z } from "zod";

import { MAX_LINE_QUANTITY } from "@/lib/cart";
import { bookingSchema } from "@/lib/gardener-schemas";
import { giftSchema } from "@/lib/gift-schemas";

/** Request validation for the cart API (server side only; the browser never loads zod for the cart). */
export const variantIdSchema = z
  .string()
  .regex(/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/, "Invalid product variant");
export const lineIdSchema = z
  .string()
  .max(200)
  .regex(/^gid:\/\/shopify\/CartLine\/[\w-]{1,100}(\?cart=[\w-]{1,100})?$/, "Invalid cart line");
const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);

export const sellingPlanIdSchema = z
  .string()
  .regex(/^gid:\/\/shopify\/SellingPlan\/\d{1,20}$/, "Invalid subscription plan");

export const addLineSchema = z
  .object({
    variantId: variantIdSchema,
    quantity: quantity.default(1),
    /** A subscription plan (Seal) for this line. */
    sellingPlanId: sellingPlanIdSchema.optional(),
    /** Gardener booking details; becomes line attributes on the order. */
    booking: bookingSchema.optional(),
    /** Gift message, and for fresh bouquets the recipient, address and delivery date. Becomes line attributes. */
    gift: giftSchema.optional(),
  })
  .refine((value) => !(value.booking && value.gift), "Send either a booking or a gift, not both");
export const updateLineSchema = z.object({
  lineId: lineIdSchema,
  quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
});
export const removeLineSchema = z.object({ lineId: lineIdSchema });
