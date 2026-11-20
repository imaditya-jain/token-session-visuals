/** Cart limits shared by the API and the UI. Shopify enforces stock; this stops absurd quantities. */
export const MAX_LINE_QUANTITY = 10;
export const MAX_CART_LINES = 50;

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
  /** True when the cart carries a buyer email (it is linked to an account). The address itself never leaves the server. */
  identified: boolean;
};
