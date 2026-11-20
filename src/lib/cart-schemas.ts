import { z } from "zod";

import { MAX_LINE_QUANTITY } from "@/lib/cart";

/** Request validation for the cart API (server side only; the browser never loads zod for the cart). */
export const variantIdSchema = z
  .string()
  .regex(/^gid:\/\/shopify\/ProductVariant\/\d{1,20}$/, "Invalid product variant");
export const lineIdSchema = z
  .string()
  .max(200)
  .regex(/^gid:\/\/shopify\/CartLine\/[\w-]{1,100}(\?cart=[\w-]{1,100})?$/, "Invalid cart line");
const quantity = z.number().int().min(1).max(MAX_LINE_QUANTITY);

export const addLineSchema = z.object({
  variantId: variantIdSchema,
  quantity: quantity.default(1),
});
export const updateLineSchema = z.object({
  lineId: lineIdSchema,
  quantity: z.number().int().min(0).max(MAX_LINE_QUANTITY),
});
export const removeLineSchema = z.object({ lineId: lineIdSchema });
