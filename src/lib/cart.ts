import { z } from "zod";

/** Cart limits shared by the API and the UI. Shopify enforces stock; this stops absurd quantities. */
export const MAX_LINE_QUANTITY = 10;
export const MAX_CART_LINES = 50;

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

export type CartLine = {
  id: string;
  quantity: number;
  name: string;
  slug: string;
  image: string;
  /** Exact decimal strings (never float arithmetic). */
  unitPrice: string;
  lineTotal: string;
  variantTitle: string;
};

export type Cart = {
  lines: CartLine[];
  totalQuantity: number;
  subtotal: { amount: string; currency: string };
  checkoutUrl: string;
};
