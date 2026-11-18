/** Order shapes shared by the API, the service and the account pages. */

export type Money = { amount: string; currency: string };

export type OrderLine = {
  title: string;
  variantTitle?: string;
  quantity: number;
  image?: string;
  unitPrice: Money;
};

export type Tracking = { company?: string; number?: string; url?: string };

export type OrderSummary = {
  /** Numeric Shopify id, used in URLs. */
  id: string;
  name: string;
  processedAt: string;
  financialStatus: string;
  fulfillmentStatus: string;
  cancelled: boolean;
  total: Money;
  itemCount: number;
  /** First few product images for the list view. */
  previewImages: string[];
};

export type OrderDetail = OrderSummary & {
  lines: OrderLine[];
  subtotal: Money;
  shipping: Money;
  tax: Money;
  tracking: Tracking[];
  shippingAddress?: { city?: string; region?: string; country?: string };
};

export type OrderPage = {
  orders: OrderSummary[];
  pageInfo: {
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor?: string;
    endCursor?: string;
  };
};

export const ORDERS_PAGE_SIZE = 10;

/** Shopify enums ("PARTIALLY_FULFILLED") → customer-facing labels. */
export function statusLabel(status: string): string {
  const spaced = status.toLowerCase().replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
