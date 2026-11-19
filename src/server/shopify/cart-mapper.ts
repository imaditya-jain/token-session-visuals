import "server-only";

import type { Cart } from "@/lib/cart";

import type { CartNode } from "./cart-schemas";

/** Maps Shopify's cart to our DTO. Money stays as Shopify's exact decimal strings. */
export const mapCart = (node: CartNode): Cart => ({
  totalQuantity: node.totalQuantity,
  subtotal: {
    amount: node.cost.subtotalAmount.amount,
    currency: node.cost.subtotalAmount.currencyCode,
  },
  checkoutUrl: node.checkoutUrl,
  identified: Boolean(node.buyerIdentity.email),
  lines: node.lines.nodes.map((line) => ({
    id: line.id,
    quantity: line.quantity,
    name: line.merchandise.product.title,
    slug: line.merchandise.product.handle,
    image: line.merchandise.image?.url ?? line.merchandise.product.featuredImage?.url ?? "",
    unitPrice: line.cost.amountPerQuantity.amount,
    lineTotal: line.cost.totalAmount.amount,
    variantTitle: line.merchandise.title === "Default Title" ? "" : line.merchandise.title,
  })),
});
