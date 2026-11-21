import "server-only";

import type { z } from "zod";

import { MAX_CART_LINES, type Cart } from "@/lib/cart";
import { AppError, badRequest, conflict } from "@/server/http/errors";
import { logger } from "@/server/logger";
import { mapCart } from "@/server/shopify/cart-mapper";
import {
  CART_BUYER_IDENTITY_UPDATE,
  CART_CREATE,
  CART_LINES_ADD,
  CART_LINES_REMOVE,
  CART_LINES_UPDATE,
  CART_QUERY,
} from "@/server/shopify/cart-queries";
import {
  cartBuyerIdentityResponse,
  cartCreateResponse,
  cartLinesAddResponse,
  cartLinesRemoveResponse,
  cartLinesUpdateResponse,
  cartResponse,
  type CartNode,
} from "@/server/shopify/cart-schemas";
import { ShopifyError, storefrontQuery } from "@/server/shopify/client";

/** `cart` is the cart to persist in the cookie (null when there is none any more). */
export type CartResult = { cart: Cart | null; cartId: string | null };

const unavailable = () =>
  new AppError(503, "cart_unavailable", "The cart is temporarily unavailable. Please try again.", {
    "Retry-After": "5",
  });

async function run<S extends z.ZodType>(
  schema: S,
  query: string,
  variables: Record<string, unknown>,
): Promise<z.infer<S>> {
  try {
    return schema.parse(await storefrontQuery(query, variables, { noStore: true }));
  } catch (error) {
    // Missing Shopify configuration, outages, throttling and malformed responses are all "cart unavailable".
    logger.error({ err: error instanceof Error ? error : String(error) }, "Shopify cart failure");
    if (error instanceof ShopifyError || error instanceof Error) throw unavailable();
    throw error;
  }
}

type Payload = { cart: CartNode | null; userErrors: { code: string | null; message: string }[] };

function unwrap(payload: Payload): CartResult {
  const [first] = payload.userErrors;
  if (first) {
    // Stock and merchandise problems are the shopper's to fix; anything else is on us.
    if (first.code === "MERCHANDISE_NOT_ENOUGH_STOCK" || first.code === "MERCHANDISE_OUT_OF_STOCK")
      throw conflict("That item is out of stock or the quantity isn't available.", "out_of_stock");
    if (first.code === "INVALID_MERCHANDISE_LINE" || first.code === "INVALID")
      throw badRequest("That item can't be added to the cart.", "invalid_item");
    logger.error({ code: first.code, message: first.message }, "Shopify cart userError");
    throw unavailable();
  }
  if (!payload.cart) throw unavailable();
  return { cart: mapCart(payload.cart), cartId: payload.cart.id };
}

export async function getCart(cartId: string | null): Promise<CartResult> {
  if (!cartId) return { cart: null, cartId: null };
  const { cart } = await run(cartResponse, CART_QUERY, { id: cartId });
  // Shopify returns null for expired or completed (checked-out) carts: start fresh.
  return cart ? { cart: mapCart(cart), cartId: cart.id } : { cart: null, cartId: null };
}

export type AddLineOptions = {
  sellingPlanId?: string | undefined;
  attributes?: { key: string; value: string }[] | undefined;
};

export async function addLine(
  cartId: string | null,
  variantId: string,
  quantity: number,
  options: AddLineOptions = {},
): Promise<CartResult> {
  const lines = [
    {
      merchandiseId: variantId,
      quantity,
      ...(options.sellingPlanId ? { sellingPlanId: options.sellingPlanId } : {}),
      ...(options.attributes?.length ? { attributes: options.attributes } : {}),
    },
  ];
  if (cartId) {
    const existing = await getCart(cartId);
    if (existing.cart) {
      const alreadyThere = existing.cart.lines.length;
      if (alreadyThere >= MAX_CART_LINES) throw conflict("Your cart is full.", "cart_full");
      const { cartLinesAdd } = await run(cartLinesAddResponse, CART_LINES_ADD, { cartId, lines });
      return unwrap(cartLinesAdd);
    }
  }
  const { cartCreate } = await run(cartCreateResponse, CART_CREATE, { lines });
  return unwrap(cartCreate);
}

export async function updateLine(
  cartId: string | null,
  lineId: string,
  quantity: number,
): Promise<CartResult> {
  if (!cartId) throw badRequest("There is no cart to update.", "no_cart");
  if (quantity === 0) return removeLine(cartId, lineId);
  const { cartLinesUpdate } = await run(cartLinesUpdateResponse, CART_LINES_UPDATE, {
    cartId,
    lines: [{ id: lineId, quantity }],
  });
  return unwrap(cartLinesUpdate);
}

export async function removeLine(cartId: string | null, lineId: string): Promise<CartResult> {
  if (!cartId) throw badRequest("There is no cart to update.", "no_cart");
  const { cartLinesRemove } = await run(cartLinesRemoveResponse, CART_LINES_REMOVE, {
    cartId,
    lineIds: [lineId],
  });
  return unwrap(cartLinesRemove);
}

/**
 * Links the cart to an account (or unlinks it with `null`). Shopify then pre-fills checkout with this email,
 * which is what ties the finished order to the account's order history. Returns the refreshed cart because
 * Shopify issues a new checkout URL.
 */
export async function setBuyerEmail(
  cartId: string | null,
  email: string | null,
): Promise<CartResult> {
  if (!cartId) return { cart: null, cartId: null };
  const { cartBuyerIdentityUpdate } = await run(
    cartBuyerIdentityResponse,
    CART_BUYER_IDENTITY_UPDATE,
    { cartId, email },
  );
  return unwrap(cartBuyerIdentityUpdate);
}
