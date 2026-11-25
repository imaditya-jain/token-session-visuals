import { z } from "zod";

export const orderGid = z.string().regex(/^gid:\/\/shopify\/Order\/\d{1,20}$/, "Invalid order id");
export const lineItemGid = z
  .string()
  .regex(/^gid:\/\/shopify\/LineItem\/\d{1,20}$/, "Invalid line item id");
export const fulfillmentOrderGid = z
  .string()
  .regex(/^gid:\/\/shopify\/FulfillmentOrder\/\d{1,20}$/, "Invalid fulfilment id");

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
    .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), "Invalid characters");

export const FINANCIAL_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "PARTIALLY_PAID",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "VOIDED",
  "EXPIRED",
] as const;
export const FULFILLMENT_STATUSES = [
  "UNFULFILLED",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "SCHEDULED",
  "ON_HOLD",
  "IN_PROGRESS",
  "REQUEST_DECLINED",
  "PENDING_FULFILLMENT",
  "OPEN",
  "RESTOCKED",
] as const;

export const orderListQuerySchema = z.object({
  search: text(100).optional(),
  /** open = not cancelled; cancelled; all */
  state: z.enum(["open", "cancelled", "all"]).default("all"),
  payment: z.enum(FINANCIAL_STATUSES).optional(),
  fulfillment: z.enum(["UNFULFILLED", "PARTIALLY_FULFILLED", "FULFILLED"]).optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  after: z.string().max(500).optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const fulfillOrderSchema = z.object({
  fulfillmentOrderId: fulfillmentOrderGid,
  /** Omit to fulfil everything that is still open in that fulfilment. */
  lines: z
    .array(
      z.object({
        id: z.string().regex(/^gid:\/\/shopify\/FulfillmentOrderLineItem\/\d{1,20}$/),
        quantity: z.number().int().min(1).max(10_000),
      }),
    )
    .max(100)
    .optional(),
  trackingCompany: text(100).default(""),
  trackingNumber: text(100).default(""),
  trackingUrl: z
    .union([z.literal(""), z.string().trim().url().max(500).startsWith("https://")])
    .default(""),
  notifyCustomer: z.boolean().default(true),
});

export const cancelOrderSchema = z.object({
  reason: z.enum(["CUSTOMER", "DECLINED", "FRAUD", "INVENTORY", "OTHER", "STAFF"]).default("OTHER"),
  refund: z.boolean().default(true),
  restock: z.boolean().default(true),
  notifyCustomer: z.boolean().default(true),
  staffNote: text(300).default(""),
});

export const refundOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        lineItemId: lineItemGid,
        quantity: z.number().int().min(1).max(10_000),
        restock: z.boolean().default(false),
      }),
    )
    .max(100)
    .default([]),
  refundShipping: z.boolean().default(false),
  note: text(300).default(""),
  notifyCustomer: z.boolean().default(true),
});

export const updateOrderSchema = z
  .object({
    note: text(5000).optional(),
    tags: z
      .array(text(40).pipe(z.string().min(1)))
      .max(50)
      .optional(),
  })
  .refine((v) => v.note !== undefined || v.tags !== undefined, "Nothing to change");

export type Money = { amount: string; currency: string };

export type OrderListItem = {
  id: string;
  name: string;
  createdAt: string;
  customerName: string;
  payment: string;
  fulfillment: string;
  cancelled: boolean;
  total: Money;
  itemCount: number;
  tags: string[];
  channel: string;
};
export type OrderListPage = { items: OrderListItem[]; nextCursor: string | null };

export type Address = {
  name: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  zip: string;
  country: string;
  phone: string;
};

export type OrderLine = {
  id: string;
  title: string;
  variantTitle: string;
  sku: string;
  quantity: number;
  refundableQuantity: number;
  imageUrl: string | null;
  unitPrice: Money;
  discountedUnitPrice: Money;
  productId: string | null;
};

export type OrderDetail = {
  id: string;
  name: string;
  createdAt: string;
  cancelledAt: string | null;
  cancelReason: string | null;
  payment: string;
  fulfillment: string;
  note: string;
  tags: string[];
  channel: string;
  currency: string;
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    orders: number;
  } | null;
  email: string;
  shippingAddress: Address | null;
  billingAddress: Address | null;
  shippingMethod: string;
  lines: OrderLine[];
  totals: {
    subtotal: Money;
    shipping: Money;
    tax: Money;
    discounts: Money;
    total: Money;
    refunded: Money;
    received: Money;
  };
  fulfillmentOrders: {
    id: string;
    status: string;
    location: string;
    lines: { id: string; title: string; remaining: number; total: number }[];
  }[];
  fulfillments: {
    id: string;
    status: string;
    createdAt: string;
    tracking: { company: string; number: string; url: string }[];
  }[];
  transactions: {
    id: string;
    kind: string;
    status: string;
    gateway: string;
    amount: Money;
    processedAt: string | null;
  }[];
  refunds: { id: string; createdAt: string; note: string; amount: Money }[];
  timeline: { message: string; createdAt: string }[];
};
